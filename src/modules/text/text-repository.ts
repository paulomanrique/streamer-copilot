import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { CommandSchedule, TextCommand, TextCommandUpsertInput } from '../../shared/types.js';
import { JsonStore } from '../../db/json-store.js';
import { PROFILE_CONFIG_FILES } from '../../shared/constants.js';
import { migratePermissions } from '../commands/permissions-migration.js';

export class TextCommandRepository {
  private cache: { dir: string; data: TextCommand[] } | null = null;

  constructor(private readonly getDirectory: () => string) {}

  private filePath(): string {
    return path.join(this.getDirectory(), PROFILE_CONFIG_FILES.textCommands);
  }

  private readAll(): TextCommand[] {
    const dir = this.getDirectory();
    if (this.cache?.dir === dir) return this.cache.data;
    const raw = new JsonStore<unknown[]>(this.filePath(), []).read();
    const { migrated, didChange } = normalizeStoredCommands(raw);
    if (didChange) new JsonStore<TextCommand[]>(this.filePath(), []).write(migrated);
    this.cache = { dir, data: migrated };
    return migrated;
  }

  private writeAll(data: TextCommand[]): void {
    new JsonStore<TextCommand[]>(this.filePath(), []).write(data);
    this.cache = { dir: this.getDirectory(), data };
  }

  list(): TextCommand[] {
    return this.readAll();
  }

  upsert(input: TextCommandUpsertInput): TextCommand[] {
    const all = this.readAll();
    const id = input.id ?? randomUUID();
    const existing = all.find((c) => c.id === id);
    const schedule: CommandSchedule | null = input.schedule?.enabled
      ? {
          intervalSeconds: input.schedule.intervalSeconds,
          randomWindowSeconds: input.schedule.randomWindowSeconds,
          targetPlatforms: input.schedule.targetPlatforms,
          enabled: true,
          lastSentAt: existing?.schedule?.lastSentAt ?? null,
        }
      : null;
    const next: TextCommand = {
      id,
      name: input.name,
      trigger: input.trigger?.trim() ?? null,
      response: input.response,
      permissions: input.permissions,
      cooldownSeconds: input.cooldownSeconds,
      userCooldownSeconds: input.userCooldownSeconds,
      commandEnabled: input.commandEnabled,
      schedule,
      enabled: input.enabled,
    };
    const idx = all.findIndex((c) => c.id === id);
    if (idx >= 0) all[idx] = next; else all.push(next);
    this.writeAll(all);
    return all;
  }

  delete(id: string): TextCommand[] {
    const next = this.readAll().filter((c) => c.id !== id);
    this.writeAll(next);
    return next;
  }

  markScheduleSent(id: string, sentAt: string): void {
    const all = this.readAll();
    const cmd = all.find((c) => c.id === id);
    if (cmd?.schedule) cmd.schedule.lastSentAt = sentAt;
    this.writeAll(all);
  }
}

function normalizeStoredCommands(raw: unknown[]): { migrated: TextCommand[]; didChange: boolean } {
  let didChange = false;
  const out: TextCommand[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown> & Partial<TextCommand>;
    const rawPerms = obj.permissions as unknown;
    const migratedPerms = migratePermissions(rawPerms);
    const wasLegacy = !Array.isArray(rawPerms)
      || rawPerms.length > 0 && typeof (rawPerms as unknown[])[0] === 'string';
    if (wasLegacy) didChange = true;
    if ('minSubscriberTier' in obj) { didChange = true; delete (obj as Record<string, unknown>).minSubscriberTier; }
    out.push({ ...(obj as TextCommand), permissions: migratedPerms });
  }
  return { migrated: out, didChange };
}
