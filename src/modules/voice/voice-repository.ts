import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { VoiceCommand, VoiceCommandUpsertInput } from '../../shared/types.js';
import { JsonStore } from '../../db/json-store.js';
import { PROFILE_CONFIG_FILES } from '../../shared/constants.js';
import { migratePermissions } from '../commands/permissions-migration.js';

export class VoiceCommandRepository {
  private cache: { dir: string; data: VoiceCommand[] } | null = null;

  constructor(private readonly getDirectory: () => string) {}

  private filePath(): string {
    return path.join(this.getDirectory(), PROFILE_CONFIG_FILES.voiceCommands);
  }

  private readAll(): VoiceCommand[] {
    const dir = this.getDirectory();
    if (this.cache?.dir === dir) return this.cache.data;
    const raw = new JsonStore<unknown[]>(this.filePath(), []).read();
    const { migrated, didChange } = normalizeStoredCommands(raw);
    if (didChange) {
      new JsonStore<VoiceCommand[]>(this.filePath(), []).write(migrated);
    }
    this.cache = { dir, data: migrated };
    return migrated;
  }

  private writeAll(data: VoiceCommand[]): void {
    new JsonStore<VoiceCommand[]>(this.filePath(), []).write(data);
    this.cache = { dir: this.getDirectory(), data };
  }

  list(): VoiceCommand[] {
    return this.readAll();
  }

  upsert(input: VoiceCommandUpsertInput): VoiceCommand[] {
    const all = this.readAll();
    const id = input.id ?? randomUUID();
    const next: VoiceCommand = {
      id,
      trigger: input.trigger,
      template: input.template,
      language: input.language,
      permissions: input.permissions,
      cooldownSeconds: input.cooldownSeconds,
      userCooldownSeconds: input.userCooldownSeconds,
      announceUsername: input.announceUsername,
      characterLimit: input.characterLimit,
      enabled: input.enabled,
    };
    const idx = all.findIndex((c) => c.id === id);
    if (idx >= 0) all[idx] = next; else all.push(next);
    this.writeAll(all);
    return all;
  }

  delete(id: string): VoiceCommand[] {
    const next = this.readAll().filter((c) => c.id !== id);
    this.writeAll(next);
    return next;
  }
}

function normalizeStoredCommands(raw: unknown[]): { migrated: VoiceCommand[]; didChange: boolean } {
  let didChange = false;
  const out: VoiceCommand[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown> & Partial<VoiceCommand>;
    const rawPerms = obj.permissions as unknown;
    const migratedPerms = migratePermissions(rawPerms);
    const wasLegacy = !Array.isArray(rawPerms)
      || rawPerms.length > 0 && typeof (rawPerms as unknown[])[0] === 'string';
    if (wasLegacy) didChange = true;
    if ('minSubscriberTier' in obj) {
      didChange = true;
      delete (obj as Record<string, unknown>).minSubscriberTier;
    }
    out.push({ ...(obj as VoiceCommand), permissions: migratedPerms });
  }
  return { migrated: out, didChange };
}
