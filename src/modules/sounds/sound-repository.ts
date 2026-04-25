import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { CommandSchedule, SoundCommand, SoundCommandUpsertInput } from '../../shared/types.js';
import { JsonStore } from '../../db/json-store.js';
import { PROFILE_CONFIG_FILES } from '../../shared/constants.js';

export class SoundCommandRepository {
  private cache: { dir: string; data: SoundCommand[] } | null = null;

  constructor(private readonly getDirectory: () => string) {}

  private filePath(): string {
    return path.join(this.getDirectory(), PROFILE_CONFIG_FILES.soundCommands);
  }

  private readAll(): SoundCommand[] {
    const dir = this.getDirectory();
    if (this.cache?.dir === dir) return this.cache.data;
    const data = new JsonStore<SoundCommand[]>(this.filePath(), []).read();
    this.cache = { dir, data };
    return data;
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
