import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { PermissionLevel, PlatformId, TextCommand, TextCommandUpsertInput } from '../../shared/types.js';

interface TextCommandRow {
  id: string;
  trigger: string;
  response: string;
  permissions_json: string;
  cooldown_seconds: number | null;
  user_cooldown_seconds: number | null;
  command_enabled: number;
  schedule_enabled: number;
  schedule_interval_seconds: number | null;
  schedule_random_window_seconds: number;
  schedule_target_platforms_json: string;
  schedule_last_sent_at: string | null;
  enabled: number;
}

export class TextCommandRepository {
  constructor(private readonly db: Database.Database) {}

  list(): TextCommand[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, trigger, response, permissions_json, cooldown_seconds, user_cooldown_seconds, enabled
               , command_enabled, schedule_enabled, schedule_interval_seconds
               , schedule_random_window_seconds, schedule_target_platforms_json, schedule_last_sent_at
          FROM text_commands
          ORDER BY created_at ASC, id ASC
        `,
      )
      .all() as TextCommandRow[];

    return rows.map((row) => ({
      id: row.id,
      trigger: row.trigger || null,
      response: row.response,
      permissions: JSON.parse(row.permissions_json) as PermissionLevel[],
      cooldownSeconds: row.cooldown_seconds,
      userCooldownSeconds: row.user_cooldown_seconds,
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

  upsert(input: TextCommandUpsertInput): TextCommand[] {
    const nextId = input.id ?? randomUUID();
    this.db
      .prepare(
        `
          INSERT INTO text_commands (
            id,
            trigger,
            response,
            permissions_json,
            cooldown_seconds,
            user_cooldown_seconds,
            command_enabled,
            schedule_enabled,
            schedule_interval_seconds,
            schedule_random_window_seconds,
            schedule_target_platforms_json,
            enabled,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            trigger = excluded.trigger,
            response = excluded.response,
            permissions_json = excluded.permissions_json,
            cooldown_seconds = excluded.cooldown_seconds,
            user_cooldown_seconds = excluded.user_cooldown_seconds,
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
        input.response,
        JSON.stringify(input.permissions),
        input.cooldownSeconds,
        input.userCooldownSeconds,
        input.commandEnabled ? 1 : 0,
        input.schedule?.enabled ? 1 : 0,
        input.schedule?.enabled ? input.schedule.intervalSeconds : null,
        input.schedule?.enabled ? input.schedule.randomWindowSeconds : 0,
        JSON.stringify(input.schedule?.enabled ? input.schedule.targetPlatforms : ['twitch', 'youtube']),
        input.enabled ? 1 : 0,
      );

    return this.list();
  }

  delete(id: string): TextCommand[] {
    this.db.prepare('DELETE FROM text_commands WHERE id = ?').run(id);
    return this.list();
  }

  markScheduleSent(id: string, sentAt: string): void {
    this.db
      .prepare(
        `
          UPDATE text_commands
          SET schedule_last_sent_at = ?, updated_at = datetime('now')
          WHERE id = ?
        `,
      )
      .run(sentAt, id);
  }
}
