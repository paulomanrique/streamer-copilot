import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { PlatformId, ScheduledMessage, ScheduledMessageUpsertInput } from '../../shared/types.js';

interface ScheduledMessageRow {
  id: string;
  message: string;
  interval_seconds: number;
  random_window_seconds: number;
  target_platforms_json: string;
  enabled: number;
  last_sent_at: string | null;
}

export class ScheduledMessageRepository {
  constructor(private readonly db: Database.Database) {}

  list(): ScheduledMessage[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, message, interval_seconds, random_window_seconds, target_platforms_json, enabled, last_sent_at
          FROM scheduled_messages
          ORDER BY created_at ASC, id ASC
        `,
      )
      .all() as ScheduledMessageRow[];

    return rows.map((row) => this.mapRow(row));
  }

  upsert(input: ScheduledMessageUpsertInput): ScheduledMessage[] {
    const nextId = input.id ?? randomUUID();

    this.db
      .prepare(
        `
          INSERT INTO scheduled_messages (
            id,
            message,
            interval_seconds,
            random_window_seconds,
            target_platforms_json,
            enabled,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            message = excluded.message,
            interval_seconds = excluded.interval_seconds,
            random_window_seconds = excluded.random_window_seconds,
            target_platforms_json = excluded.target_platforms_json,
            enabled = excluded.enabled,
            updated_at = datetime('now')
        `,
      )
      .run(
        nextId,
        input.message,
        input.intervalSeconds,
        input.randomWindowSeconds,
        JSON.stringify(input.targetPlatforms),
        input.enabled ? 1 : 0,
      );

    return this.list();
  }

  delete(id: string): ScheduledMessage[] {
    this.db.prepare('DELETE FROM scheduled_messages WHERE id = ?').run(id);
    return this.list();
  }

  markSent(id: string, sentAt: string): void {
    this.db
      .prepare(
        `
          UPDATE scheduled_messages
          SET last_sent_at = ?, updated_at = datetime('now')
          WHERE id = ?
        `,
      )
      .run(sentAt, id);
  }

  private mapRow(row: ScheduledMessageRow): ScheduledMessage {
    return {
      id: row.id,
      message: row.message,
      intervalSeconds: row.interval_seconds,
      randomWindowSeconds: row.random_window_seconds,
      targetPlatforms: JSON.parse(row.target_platforms_json) as PlatformId[],
      enabled: row.enabled === 1,
      lastSentAt: row.last_sent_at,
    };
  }
}
