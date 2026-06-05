import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { CommandSchedule, SoundCommand, SoundCommandUpsertInput } from '../../shared/types.js';
import { JsonStore } from '../../db/json-store.js';
import { PROFILE_CONFIG_FILES } from '../../shared/constants.js';
import { migratePermissions } from '../commands/permissions-migration.js';

export class SoundCommandRepository {
  private cache: { dir: string; data: SoundCommand[] } | null = null;

  constructor(private readonly getDirectory: () => string) {}

  private filePath(): string {
    return path.join(this.getDirectory(), PROFILE_CONFIG_FILES.soundCommands);
  }

  private readAll(): SoundCommand[] {
    const dir = this.getDirectory();
    if (this.cache?.dir === dir) return this.cache.data;
    const raw = new JsonStore<unknown[]>(this.filePath(), []).read();
    const { migrated, didChange } = normalizeStoredCommands(raw);
    if (didChange) {
      new JsonStore<SoundCommand[]>(this.filePath(), []).write(migrated);
    }
    this.cache = { dir, data: migrated };
    return migrated;
  }

  private writeAll(data: SoundCommand[]): void {
    new JsonStore<SoundCommand[]>(this.filePath(), []).write(data);
    this.cache = { dir: this.getDirectory(), data };
  }

  list(): SoundCommand[] {
    return this.readAll();
  }

  upsert(input: SoundCommandUpsertInput): SoundCommand[] {
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
    const next: SoundCommand = {
      id,
      name: input.name,
      trigger: input.trigger?.trim() ?? null,
      filePath: input.filePath,
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

  delete(id: string): SoundCommand[] {
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

/**
 * Aceita o JSON cru e devolve uma lista canônica de `SoundCommand`.
 *
 * Migra comandos com `permissions: string[]` (formato legado) para
 * `permissions: PermissionEntry[]` expandindo cada nível para todas as
 * plataformas conhecidas (ver `permissions-migration.ts`). Também derruba
 * o campo `minSubscriberTier` legado.
 *
 * `didChange` indica se o JSON precisa ser regravado para persistir a
 * migração — economiza um write em comandos já no formato novo.
 */
function normalizeStoredCommands(raw: unknown[]): { migrated: SoundCommand[]; didChange: boolean } {
  let didChange = false;
  const out: SoundCommand[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown> & Partial<SoundCommand>;
    const rawPerms = obj.permissions as unknown;
    const migratedPerms = migratePermissions(rawPerms);
    const wasLegacy = !Array.isArray(rawPerms)
      || rawPerms.length > 0 && typeof (rawPerms as unknown[])[0] === 'string';
    if (wasLegacy) didChange = true;
    if ('minSubscriberTier' in obj) {
      didChange = true;
      delete (obj as Record<string, unknown>).minSubscriberTier;
    }
    out.push({ ...(obj as SoundCommand), permissions: migratedPerms });
  }
  return { migrated: out, didChange };
}
