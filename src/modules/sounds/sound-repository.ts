import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { PermissionLevel, PlatformId, SoundCommand, SoundCommandUpsertInput } from '../../shared/types.js';

interface SoundCommandRow {
  id: string;
  trigger: string;
  file_path: string;
  permissions_json: string;
  cooldown_seconds: number;
  command_enabled: number;
  schedule_enabled: number;
  schedule_interval_seconds: number | null;
  schedule_random_window_seconds: number;
  schedule_target_platforms_json: string;
  schedule_last_sent_at: string | null;
  enabled: number;
}

export class SoundCommandRepository {
  constructor(private readonly db: Database.Database) {}

  list(): SoundCommand[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, trigger, file_path, permissions_json, cooldown_seconds, enabled
               , command_enabled, schedule_enabled, schedule_interval_seconds
               , schedule_random_window_seconds, schedule_target_platforms_json, schedule_last_sent_at
          FROM sound_commands
          ORDER BY created_at ASC, id ASC
        `,
      )
      .all() as SoundCommandRow[];

    return rows.map((row) => ({
      id: row.id,
      trigger: row.trigger || null,
      filePath: row.file_path,
      permissions: JSON.parse(row.permissions_json) as PermissionLevel[],
      cooldownSeconds: row.cooldown_seconds,
      commandEnabled: row.command_enabled === 1,
      schedule: row.schedule_enabled === 1 && row.schedule_interval_seconds !== null
        ? {
            intervalSeconds: row.schedule_interval_seconds,
            randomWindowSeconds: row.schedule_random_window_seconds,
            targetPlatforms: JSON.parse(row.schedule_target_platforms_json) as PlatformId[],
            enabled: true,
            lastSentAt: row.schedule_last_sent_at,
          }
        : null,
      enabled: row.enabled === 1,
    }));
  }

  upsert(input: SoundCommandUpsertInput): SoundCommand[] {
    const nextId = input.id ?? randomUUID();
    this.db
      .prepare(
        `
          INSERT INTO sound_commands (
            id,
            trigger,
            file_path,
            permissions_json,
            cooldown_seconds,
            command_enabled,
            schedule_enabled,
            schedule_interval_seconds,
            schedule_random_window_seconds,
            schedule_target_platforms_json,
            enabled,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            trigger = excluded.trigger,
            file_path = excluded.file_path,
            permissions_json = excluded.permissions_json,
            cooldown_seconds = excluded.cooldown_seconds,
            command_enabled = excluded.command_enabled,
            schedule_enabled = excluded.schedule_enabled,
            schedule_interval_seconds = excluded.schedule_interval_seconds,
            schedule_random_window_seconds = excluded.schedule_random_window_seconds,
            schedule_target_platforms_json = excluded.schedule_target_platforms_json,
            enabled = excluded.enabled,
            updated_at = datetime('now')
        `,
      )
      .run(
        nextId,
        input.trigger?.trim() ?? '',
        input.filePath,
        JSON.stringify(input.permissions),
        input.cooldownSeconds,
        input.commandEnabled ? 1 : 0,
        input.schedule?.enabled ? 1 : 0,
        input.schedule?.enabled ? input.schedule.intervalSeconds : null,
        input.schedule?.enabled ? input.schedule.randomWindowSeconds : 0,
        JSON.stringify(input.schedule?.enabled ? input.schedule.targetPlatforms : []),
        input.enabled ? 1 : 0,
      );

    return this.list();
  }

  delete(id: string): SoundCommand[] {
    this.db.prepare('DELETE FROM sound_commands WHERE id = ?').run(id);
    return this.list();
  }

  markScheduleSent(id: string, sentAt: string): void {
    this.db
      .prepare(
        `
          UPDATE sound_commands
          SET schedule_last_sent_at = ?, updated_at = datetime('now')
          WHERE id = ?
        `,
      )
      .run(sentAt, id);
  }
}
