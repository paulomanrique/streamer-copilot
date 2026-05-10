import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { JsonStore } from '../../db/json-store.js';
import { PROFILE_CONFIG_FILES } from '../../shared/constants.js';
import type {
  PlatformId,
  Poll,
  PollOption,
  PollStatus,
  PollUpsertInput,
  PollVote,
} from '../../shared/types.js';

interface PollsFile {
  polls: PollRecord[];
  votes: Record<string, PollVote[]>;
}

interface PollRecord {
  id: string;
  title: string;
  options: PollOption[];
  durationSeconds: number;
  acceptedPlatforms: PlatformId[];
  resultAnnouncementTemplate: string;
  status: PollStatus;
  startedAt: string | null;
  closesAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const EMPTY_FILE: PollsFile = { polls: [], votes: {} };

export interface RecordVoteInput {
  pollId: string;
  optionId: string;
  platform: PlatformId;
  userKey: string;
  displayName: string;
  votedAt: string;
}

export interface UpdateStatusInput {
  status: PollStatus;
  startedAt?: string | null;
  closesAt?: string | null;
  closedAt?: string | null;
}

export class PollRepository {
  private cache: { dir: string; data: PollsFile } | null = null;

  constructor(private readonly getDirectory: () => string) {}

  list(): Poll[] {
    return this.readFile().polls.map((r) => this.mapPoll(r));
  }

  get(id: string): Poll | null {
    const record = this.readFile().polls.find((p) => p.id === id);
    return record ? this.mapPoll(record) : null;
  }

  getActive(): Poll | null {
    const record = this.readFile().polls.find((p) => p.status === 'active');
    return record ? this.mapPoll(record) : null;
  }

  upsert(input: PollUpsertInput): Poll[] {
    const file = this.readFile();
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();
    const existing = file.polls.find((p) => p.id === id);

    const options: PollOption[] = input.options.map((opt, idx) => ({
      id: opt.id ?? randomUUID(),
      index: idx + 1,
      label: opt.label.trim(),
    }));

    const record: PollRecord = {
      id,
      title: input.title.trim(),
      options,
      durationSeconds: input.durationSeconds,
      acceptedPlatforms: Array.from(new Set(input.acceptedPlatforms)),
      resultAnnouncementTemplate: input.resultAnnouncementTemplate ?? '',
      status: existing?.status ?? 'draft',
      startedAt: existing?.startedAt ?? null,
      closesAt: existing?.closesAt ?? null,
      closedAt: existing?.closedAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const idx = file.polls.findIndex((p) => p.id === id);
    if (idx >= 0) file.polls[idx] = record; else file.polls.push(record);
    this.writeFile(file);
    return this.list();
  }

  updateStatus(id: string, patch: UpdateStatusInput): Poll | null {
    const file = this.readFile();
    const record = file.polls.find((p) => p.id === id);
    if (!record) return null;

    record.status = patch.status;
    if (patch.startedAt !== undefined) record.startedAt = patch.startedAt;
    if (patch.closesAt !== undefined) record.closesAt = patch.closesAt;
    if (patch.closedAt !== undefined) record.closedAt = patch.closedAt;
    record.updatedAt = new Date().toISOString();

    this.writeFile(file);
    return this.mapPoll(record);
  }

  delete(id: string): Poll[] {
    const file = this.readFile();
    file.polls = file.polls.filter((p) => p.id !== id);
    delete file.votes[id];
    this.writeFile(file);
    return this.list();
  }

  /** Records a vote. Returns null when the user already voted in this poll (first-vote-wins). */
  recordVote(input: RecordVoteInput): PollVote | null {
    const file = this.readFile();
    if (!file.votes[input.pollId]) file.votes[input.pollId] = [];
    const bucket = file.votes[input.pollId];
    if (bucket.some((v) => v.userKey === input.userKey)) return null;

    const vote: PollVote = {
      pollId: input.pollId,
      optionId: input.optionId,
      platform: input.platform,
      userKey: input.userKey,
      displayName: input.displayName,
      votedAt: input.votedAt,
    };
    bucket.push(vote);
    this.writeFile(file);
    return vote;
  }

  listVotes(pollId: string): PollVote[] {
    return [...(this.readFile().votes[pollId] ?? [])];
  }

  clearVotes(pollId: string): void {
    const file = this.readFile();
    file.votes[pollId] = [];
    this.writeFile(file);
  }

  private filePath(): string {
    return path.join(this.getDirectory(), PROFILE_CONFIG_FILES.polls);
  }

  private readFile(): PollsFile {
    const dir = this.getDirectory();
    if (this.cache?.dir === dir) return this.cache.data;
    const data = new JsonStore<PollsFile>(this.filePath(), EMPTY_FILE).read();
    if (!data.polls) data.polls = [];
    if (!data.votes) data.votes = {};
    this.cache = { dir, data };
    return data;
  }

  private writeFile(data: PollsFile): void {
    new JsonStore<PollsFile>(this.filePath(), EMPTY_FILE).write(data);
    this.cache = { dir: this.getDirectory(), data };
  }

  private mapPoll(r: PollRecord): Poll {
    return {
      id: r.id,
      title: r.title,
      options: r.options.map((opt, idx) => ({ ...opt, index: idx + 1 })),
      durationSeconds: r.durationSeconds,
      acceptedPlatforms: r.acceptedPlatforms ?? [],
      resultAnnouncementTemplate: r.resultAnnouncementTemplate ?? '',
      status: r.status,
      startedAt: r.startedAt,
      closesAt: r.closesAt,
      closedAt: r.closedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
