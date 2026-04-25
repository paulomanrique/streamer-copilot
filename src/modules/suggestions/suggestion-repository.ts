import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { PermissionLevel, PlatformId, SuggestionEntry, SuggestionList, SuggestionListUpsertInput } from '../../shared/types.js';
import { JsonStore } from '../../db/json-store.js';
import { PROFILE_CONFIG_FILES } from '../../shared/constants.js';

interface SuggestionsFile {
  lists: SuggestionListRecord[];
  entries: Record<string, SuggestionEntryRecord[]>;
}

interface SuggestionListRecord {
  id: string;
  title: string;
  trigger: string;
  feedbackTemplate: string;
  feedbackSoundPath: string | null;
  feedbackTargetPlatforms: PlatformId[];
  mode: 'global' | 'session';
  allowDuplicates: boolean;
  permissions: PermissionLevel[];
  cooldownSeconds: number;
  userCooldownSeconds: number;
  enabled: boolean;
}

interface SuggestionEntryRecord {
  id: string;
  listId: string;
  platform: string;
  userKey: string;
  displayName: string;
  content: string;
  createdAt: string;
}

export interface AddEntryInput {
  listId: string;
  platform: string;
  userKey: string;
  displayName: string;
  content: string;
}

const EMPTY_FILE: SuggestionsFile = { lists: [], entries: {} };

export class SuggestionRepository {
  private cache: { dir: string; data: SuggestionsFile } | null = null;

  constructor(private readonly getDirectory: () => string) {}

  private filePath(): string {
    return path.join(this.getDirectory(), PROFILE_CONFIG_FILES.suggestions);
  }

  private readFile(): SuggestionsFile {
    const dir = this.getDirectory();
    if (this.cache?.dir === dir) return this.cache.data;
    const data = new JsonStore<SuggestionsFile>(this.filePath(), EMPTY_FILE).read();
    if (!data.lists) data.lists = [];
    if (!data.entries) data.entries = {};
    this.cache = { dir, data };
    return data;
  }

  private writeFile(data: SuggestionsFile): void {
    new JsonStore<SuggestionsFile>(this.filePath(), EMPTY_FILE).write(data);
    this.cache = { dir: this.getDirectory(), data };
  }

  listLists(): SuggestionList[] {
    const { lists, entries } = this.readFile();
    return lists.map((r) => this.mapList(r, (entries[r.id] ?? []).length));
  }

  upsertList(input: SuggestionListUpsertInput): SuggestionList[] {
    const file = this.readFile();
    const id = input.id ?? randomUUID();
    const record: SuggestionListRecord = {
      id,
      title: input.title.trim(),
      trigger: input.trigger.trim(),
      feedbackTemplate: input.feedbackTemplate.trim(),
      feedbackSoundPath: input.feedbackSoundPath ?? null,
      feedbackTargetPlatforms: input.feedbackTargetPlatforms ?? [],
      mode: input.mode,
      allowDuplicates: input.allowDuplicates,
      permissions: input.permissions,
      cooldownSeconds: input.cooldownSeconds,
      userCooldownSeconds: input.userCooldownSeconds,
      enabled: input.enabled,
    };
    const idx = file.lists.findIndex((l) => l.id === id);
    if (idx >= 0) file.lists[idx] = record; else file.lists.push(record);
    this.writeFile(file);
    return this.listLists();
  }

  deleteList(id: string): SuggestionList[] {
    const file = this.readFile();
    file.lists = file.lists.filter((l) => l.id !== id);
    delete file.entries[id];
    this.writeFile(file);
    return this.listLists();
  }

  listEntries(listId: string): SuggestionEntry[] {
    const { entries } = this.readFile();
    return (entries[listId] ?? []).map((r) => this.mapEntry(r));
  }

  addEntry(input: AddEntryInput): SuggestionEntry | null {
    const file = this.readFile();
    const list = file.lists.find((l) => l.id === input.listId);
    if (!list) return null;

    if (!file.entries[input.listId]) file.entries[input.listId] = [];
    const bucket = file.entries[input.listId];

    if (!list.allowDuplicates && bucket.some((e) => e.userKey === input.userKey)) return null;

    const record: SuggestionEntryRecord = {
      id: randomUUID(),
      listId: input.listId,
      platform: input.platform,
      userKey: input.userKey,
      displayName: input.displayName,
      content: input.content,
      createdAt: new Date().toISOString(),
    };
    bucket.push(record);
    this.writeFile(file);
    return this.mapEntry(record);
  }

  hasUserEntry(listId: string, userKey: string): boolean {
    const { entries } = this.readFile();
    return (entries[listId] ?? []).some((e) => e.userKey === userKey);
  }

  clearEntries(listId: string): void {
    const file = this.readFile();
    file.entries[listId] = [];
    this.writeFile(file);
  }

  clearSessionEntries(): void {
    const file = this.readFile();
    for (const list of file.lists) {
      if (list.mode === 'session') file.entries[list.id] = [];
    }
    this.writeFile(file);
  }

  private mapList(r: SuggestionListRecord, entryCount: number): SuggestionList {
    return {
      id: r.id,
      title: r.title,
      trigger: r.trigger,
      feedbackTemplate: r.feedbackTemplate,
      feedbackSoundPath: r.feedbackSoundPath,
      feedbackTargetPlatforms: r.feedbackTargetPlatforms ?? [],
      mode: r.mode,
      allowDuplicates: r.allowDuplicates,
      permissions: r.permissions,
      cooldownSeconds: r.cooldownSeconds,
      userCooldownSeconds: r.userCooldownSeconds,
      enabled: r.enabled,
      entryCount,
    };
  }

  private mapEntry(r: SuggestionEntryRecord): SuggestionEntry {
    return {
      id: r.id,
      listId: r.listId,
      platform: r.platform as SuggestionEntry['platform'],
      userKey: r.userKey,
      displayName: r.displayName,
      content: r.content,
      createdAt: r.createdAt,
    };
  }
}
