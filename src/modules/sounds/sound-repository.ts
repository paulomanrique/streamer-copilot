import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { PermissionLevel, SoundCommand, SoundCommandUpsertInput } from '../../shared/types.js';

interface SoundCommandRow {
  id: string;
  trigger: string;
  file_path: string;
  permissions_json: string;
  cooldown_seconds: number;
  enabled: number;
}

export class SoundCommandRepository {
  constructor(private readonly db: Database.Database) {}

  list(): SoundCommand[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, trigger, file_path, permissions_json, cooldown_seconds, enabled
          FROM sound_commands
          ORDER BY created_at ASC, id ASC
        `,
      )
      .all() as SoundCommandRow[];

    return rows.map((row) => ({
      id: row.id,
      trigger: row.trigger,
      filePath: row.file_path,
      permissions: JSON.parse(row.permissions_json) as PermissionLevel[],
      cooldownSeconds: row.cooldown_seconds,
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
            enabled,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            trigger = excluded.trigger,
            file_path = excluded.file_path,
            permissions_json = excluded.permissions_json,
            cooldown_seconds = excluded.cooldown_seconds,
            enabled = excluded.enabled,
            updated_at = datetime('now')
        `,
      )
      .run(
        nextId,
        input.trigger,
        input.filePath,
        JSON.stringify(input.permissions),
        input.cooldownSeconds,
        input.enabled ? 1 : 0,
      );

    return this.list();
  }

  delete(id: string): SoundCommand[] {
    this.db.prepare('DELETE FROM sound_commands WHERE id = ?').run(id);
    return this.list();
  }
}
