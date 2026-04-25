import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type {
  PlatformId,
  Raffle,
  RaffleCreateInput,
  RaffleEntry,
  RaffleRoundActionType,
  RaffleRoundResult,
  RaffleRoundResultType,
  RaffleSnapshot,
  RaffleStatus,
  RaffleUpdateInput,
} from '../../shared/types.js';
import { JsonStore } from '../../db/json-store.js';
import { PROFILE_CONFIG_FILES } from '../../shared/constants.js';

interface RaffleRecord {
  id: string;
  title: string;
  entryCommand: string;
  mode: Raffle['mode'];
  status: RaffleStatus;
  entryDeadlineAt: string | null;
  acceptedPlatforms: PlatformId[];
  staffTriggerCommand: string;
  openAnnouncementTemplate: string;
  eliminationAnnouncementTemplate: string;
  winnerAnnouncementTemplate: string;
  spinSoundFile: string | null;
  eliminatedSoundFile: string | null;
  winnerSoundFile: string | null;
  winnerEntryId: string | null;
  top2EntryIds: string[];
  lastSpinAt: string | null;
  currentRound: number;
  overlaySessionId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RaffleEntryRecord {
  id: string;
  raffleId: string;
  platform: PlatformId;
  userKey: string;
  displayName: string;
  sourceMessageId: string | null;
  enteredAt: string;
  isEliminated: boolean;
  eliminationOrder: number | null;
  isWinner: boolean;
}

interface RaffleRoundRecord {
  id: string;
  raffleId: string;
  roundNumber: number;
  actionType: RaffleRoundActionType;
  selectedEntryId: string;
  selectedEntryName: string;
  resultType: RaffleRoundResultType;
  participantCountBefore: number;
  participantCountAfter: number;
  animationSeedJson: string | null;
  createdAt: string;
}

interface RafflesFile {
  raffles: RaffleRecord[];
  entries: Record<string, RaffleEntryRecord[]>;
  rounds: Record<string, RaffleRoundRecord[]>;
}

export interface RecordRoundInput {
  raffleId: string;
  roundNumber: number;
  actionType: RaffleRoundActionType;
  selectedEntryId: string;
  selectedEntryName: string;
  resultType: RaffleRoundResultType;
  participantCountBefore: number;
  participantCountAfter: number;
  animationSeedJson: string | null;
}

export interface RegisterEntryInput {
  raffleId: string;
  platform: PlatformId;
  userKey: string;
  displayName: string;
  sourceMessageId: string | null;
  enteredAt: string;
}

const EMPTY_FILE: RafflesFile = { raffles: [], entries: {}, rounds: {} };

export class RaffleRepository {
  private cache: { dir: string; data: RafflesFile } | null = null;

  constructor(private readonly getDirectory: () => string) {}

  private filePath(): string {
    return path.join(this.getDirectory(), PROFILE_CONFIG_FILES.raffles);
  }

  private readFile(): RafflesFile {
    const dir = this.getDirectory();
    if (this.cache?.dir === dir) return this.cache.data;
    const data = new JsonStore<RafflesFile>(this.filePath(), EMPTY_FILE).read();
    if (!data.raffles) data.raffles = [];
    if (!data.entries) data.entries = {};
    if (!data.rounds) data.rounds = {};
    this.cache = { dir, data };
    return data;
  }

  private writeFile(data: RafflesFile): void {
    new JsonStore<RafflesFile>(this.filePath(), EMPTY_FILE).write(data);
    this.cache = { dir: this.getDirectory(), data };
  }

  list(): Raffle[] {
    const file = this.readFile();
    return file.raffles.map((r) => this.mapRaffle(r, file));
  }

  getById(id: string): Raffle | null {
    const file = this.readFile();
    const record = file.raffles.find((r) => r.id === id);
    return record ? this.mapRaffle(record, file) : null;
  }

  getActive(): Raffle | null {
    const file = this.readFile();
    const active = file.raffles
      .filter((r) => ['collecting', 'ready_to_spin', 'spinning', 'paused_top2'].includes(r.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt))
      .at(0);
    return active ? this.mapRaffle(active, file) : null;
  }

  create(input: RaffleCreateInput): Raffle[] {
    const file = this.readFile();
    const now = new Date().toISOString();
    const record: RaffleRecord = {
      id: randomUUID(),
      title: input.title,
      entryCommand: input.entryCommand,
      mode: input.mode,
      status: 'draft',
      entryDeadlineAt: input.entryDeadlineAt ?? null,
      acceptedPlatforms: input.acceptedPlatforms ?? [],
      staffTriggerCommand: input.staffTriggerCommand ?? '',
      openAnnouncementTemplate: input.openAnnouncementTemplate ?? '',
      eliminationAnnouncementTemplate: input.eliminationAnnouncementTemplate ?? '',
      winnerAnnouncementTemplate: input.winnerAnnouncementTemplate ?? '',
      spinSoundFile: input.spinSoundFile ?? null,
      eliminatedSoundFile: input.eliminatedSoundFile ?? null,
      winnerSoundFile: input.winnerSoundFile ?? null,
      winnerEntryId: null,
      top2EntryIds: [],
      lastSpinAt: null,
      currentRound: 0,
      overlaySessionId: null,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    };
    file.raffles.push(record);
    this.writeFile(file);
    return this.list();
  }

  update(input: RaffleUpdateInput): Raffle[] {
    const file = this.readFile();
    const idx = file.raffles.findIndex((r) => r.id === input.id);
    if (idx < 0) return this.list();
    const existing = file.raffles[idx];
    file.raffles[idx] = {
      ...existing,
      title: input.title,
      entryCommand: input.entryCommand,
      mode: input.mode,
      entryDeadlineAt: input.entryDeadlineAt ?? null,
      acceptedPlatforms: input.acceptedPlatforms ?? [],
      staffTriggerCommand: input.staffTriggerCommand ?? '',
      openAnnouncementTemplate: input.openAnnouncementTemplate ?? '',
      eliminationAnnouncementTemplate: input.eliminationAnnouncementTemplate ?? '',
      winnerAnnouncementTemplate: input.winnerAnnouncementTemplate ?? '',
      spinSoundFile: input.spinSoundFile ?? null,
      eliminatedSoundFile: input.eliminatedSoundFile ?? null,
      winnerSoundFile: input.winnerSoundFile ?? null,
      enabled: input.enabled,
      updatedAt: new Date().toISOString(),
    };
    this.writeFile(file);
    return this.list();
  }

  delete(id: string): Raffle[] {
    const file = this.readFile();
    file.raffles = file.raffles.filter((r) => r.id !== id);
    delete file.entries[id];
    delete file.rounds[id];
    this.writeFile(file);
    return this.list();
  }

  listEntries(raffleId: string): RaffleEntry[] {
    const { entries } = this.readFile();
    return (entries[raffleId] ?? [])
      .slice()
      .sort((a, b) => a.enteredAt.localeCompare(b.enteredAt) || a.id.localeCompare(b.id))
      .map((r) => this.mapEntry(r));
  }

  listActiveEntries(raffleId: string): RaffleEntry[] {
    return this.listEntries(raffleId).filter((e) => !e.isEliminated && !e.isWinner);
  }

  listRounds(raffleId: string): RaffleRoundResult[] {
    const { rounds } = this.readFile();
    return (rounds[raffleId] ?? [])
      .slice()
      .sort((a, b) => a.roundNumber - b.roundNumber || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((r) => this.mapRound(r));
  }

  getSnapshot(raffleId: string): RaffleSnapshot | null {
    const raffle = this.getById(raffleId);
    if (!raffle) return null;
    const entries = this.listEntries(raffleId);
    return {
      raffle,
      entries,
      activeEntries: entries.filter((e) => !e.isEliminated && !e.isWinner),
      overlay: null,
      history: this.listRounds(raffleId),
    };
  }

  registerEntry(input: RegisterEntryInput): RaffleEntry | null {
    const file = this.readFile();
    if (!file.raffles.some((r) => r.id === input.raffleId)) return null;
    if (!file.entries[input.raffleId]) file.entries[input.raffleId] = [];
    const bucket = file.entries[input.raffleId];
    if (bucket.some((e) => e.userKey === input.userKey)) return null;
    const record: RaffleEntryRecord = {
      id: randomUUID(),
      raffleId: input.raffleId,
      platform: input.platform,
      userKey: input.userKey,
      displayName: input.displayName,
      sourceMessageId: input.sourceMessageId,
      enteredAt: input.enteredAt,
      isEliminated: false,
      eliminationOrder: null,
      isWinner: false,
    };
    bucket.push(record);
    this.writeFile(file);
    return this.mapEntry(record);
  }

  transitionStatus(raffleId: string, status: RaffleStatus, extras: {
    winnerEntryId?: string | null;
    top2EntryIds?: string[];
    lastSpinAt?: string | null;
    currentRound?: number;
    overlaySessionId?: string | null;
  } = {}): void {
    const file = this.readFile();
    const idx = file.raffles.findIndex((r) => r.id === raffleId);
    if (idx < 0) throw new Error(`Raffle "${raffleId}" not found`);
    const r = file.raffles[idx];
    file.raffles[idx] = {
      ...r,
      status,
      winnerEntryId: extras.winnerEntryId !== undefined ? extras.winnerEntryId : r.winnerEntryId,
      top2EntryIds: extras.top2EntryIds !== undefined ? extras.top2EntryIds : r.top2EntryIds,
      lastSpinAt: extras.lastSpinAt !== undefined ? extras.lastSpinAt : r.lastSpinAt,
      currentRound: extras.currentRound !== undefined ? extras.currentRound : r.currentRound,
      overlaySessionId: extras.overlaySessionId !== undefined ? extras.overlaySessionId : r.overlaySessionId,
      updatedAt: new Date().toISOString(),
    };
    this.writeFile(file);
  }

  eliminateEntry(raffleId: string, entryId: string, eliminationOrder: number): void {
    const file = this.readFile();
    const bucket = file.entries[raffleId] ?? [];
    const idx = bucket.findIndex((e) => e.id === entryId);
    if (idx >= 0) {
      bucket[idx] = { ...bucket[idx], isEliminated: true, eliminationOrder };
      this.writeFile(file);
    }
  }

  markWinner(raffleId: string, entryId: string): void {
    const file = this.readFile();
    const bucket = file.entries[raffleId] ?? [];
    let changed = false;
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i].id === entryId && !bucket[i].isWinner) {
        bucket[i] = { ...bucket[i], isWinner: true };
        changed = true;
      }
    }
    if (changed) this.writeFile(file);
  }

  recordRound(input: RecordRoundInput): RaffleRoundResult {
    const file = this.readFile();
    if (!file.rounds[input.raffleId]) file.rounds[input.raffleId] = [];
    const record: RaffleRoundRecord = {
      id: randomUUID(),
      raffleId: input.raffleId,
      roundNumber: input.roundNumber,
      actionType: input.actionType,
      selectedEntryId: input.selectedEntryId,
      selectedEntryName: input.selectedEntryName,
      resultType: input.resultType,
      participantCountBefore: input.participantCountBefore,
      participantCountAfter: input.participantCountAfter,
      animationSeedJson: input.animationSeedJson,
      createdAt: new Date().toISOString(),
    };
    file.rounds[input.raffleId].push(record);
    this.writeFile(file);
    return this.mapRound(record);
  }

  reset(raffleId: string): void {
    const file = this.readFile();
    const idx = file.raffles.findIndex((r) => r.id === raffleId);
    if (idx < 0) return;
    file.rounds[raffleId] = [];
    const bucket = file.entries[raffleId] ?? [];
    file.entries[raffleId] = bucket.map((e) => ({
      ...e,
      isEliminated: false,
      eliminationOrder: null,
      isWinner: false,
    }));
    file.raffles[idx] = {
      ...file.raffles[idx],
      status: 'draft',
      winnerEntryId: null,
      top2EntryIds: [],
      lastSpinAt: null,
      currentRound: 0,
      overlaySessionId: null,
      updatedAt: new Date().toISOString(),
    };
    this.writeFile(file);
  }

  private mapRaffle(r: RaffleRecord, file: RafflesFile): Raffle {
    const entries = file.entries[r.id] ?? [];
    return {
      id: r.id,
      title: r.title,
      entryCommand: r.entryCommand,
      mode: r.mode,
      status: r.status,
      entryDeadlineAt: r.entryDeadlineAt,
      acceptedPlatforms: r.acceptedPlatforms,
      staffTriggerCommand: r.staffTriggerCommand,
      openAnnouncementTemplate: r.openAnnouncementTemplate,
      eliminationAnnouncementTemplate: r.eliminationAnnouncementTemplate,
      winnerAnnouncementTemplate: r.winnerAnnouncementTemplate,
      spinSoundFile: r.spinSoundFile,
      eliminatedSoundFile: r.eliminatedSoundFile,
      winnerSoundFile: r.winnerSoundFile,
      winnerEntryId: r.winnerEntryId,
      top2EntryIds: r.top2EntryIds,
      entriesCount: entries.length,
      activeEntriesCount: entries.filter((e) => !e.isEliminated && !e.isWinner).length,
      lastSpinAt: r.lastSpinAt,
      currentRound: r.currentRound,
      overlaySessionId: r.overlaySessionId,
      enabled: r.enabled,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private mapEntry(r: RaffleEntryRecord): RaffleEntry {
    return {
      id: r.id,
      raffleId: r.raffleId,
      platform: r.platform,
      userKey: r.userKey,
      displayName: r.displayName,
      sourceMessageId: r.sourceMessageId,
      enteredAt: r.enteredAt,
      isEliminated: r.isEliminated,
      eliminationOrder: r.eliminationOrder,
      isWinner: r.isWinner,
    };
  }

  private mapRound(r: RaffleRoundRecord): RaffleRoundResult {
    return {
      id: r.id,
      raffleId: r.raffleId,
      roundNumber: r.roundNumber,
      actionType: r.actionType,
      selectedEntryId: r.selectedEntryId,
      selectedEntryName: r.selectedEntryName,
      resultType: r.resultType,
      participantCountBefore: r.participantCountBefore,
      participantCountAfter: r.participantCountAfter,
      animationSeedJson: r.animationSeedJson,
      createdAt: r.createdAt,
    };
  }
}
