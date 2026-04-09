import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { PermissionLevel, TextCommand, TextCommandUpsertInput } from '../../shared/types.js';

interface TextCommandRow {
  id: string;
  trigger: string;
  response: string;
  permissions_json: string;
  cooldown_seconds: number;
  enabled: number;
}

export class TextCommandRepository {
  constructor(private readonly db: Database.Database) {}

  list(): TextCommand[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, trigger, response, permissions_json, cooldown_seconds, enabled
          FROM text_commands
          ORDER BY created_at ASC, id ASC
        `,
      )
      .all() as TextCommandRow[];

    return rows.map((row) => ({
      id: row.id,
      trigger: row.trigger,
      response: row.response,
      permissions: JSON.parse(row.permissions_json) as PermissionLevel[],
      cooldownSeconds: row.cooldown_seconds,
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
            enabled,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            trigger = excluded.trigger,
            response = excluded.response,
            permissions_json = excluded.permissions_json,
            cooldown_seconds = excluded.cooldown_seconds,
            enabled = excluded.enabled,
            updated_at = datetime('now')
        `,
      )
      .run(
        nextId,
        input.trigger,
        input.response,
        JSON.stringify(input.permissions),
        input.cooldownSeconds,
        input.enabled ? 1 : 0,
      );

    return this.list();
  }

  delete(id: string): TextCommand[] {
    this.db.prepare('DELETE FROM text_commands WHERE id = ?').run(id);
    return this.list();
  }
}
