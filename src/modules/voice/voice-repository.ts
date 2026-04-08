import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { PermissionLevel, VoiceCommand, VoiceCommandUpsertInput } from '../../shared/types.js';

interface VoiceCommandRow {
  id: string;
  trigger: string;
  template: string | null;
  language: string;
  permissions_json: string;
  cooldown_seconds: number;
  enabled: number;
}

export class VoiceCommandRepository {
  constructor(private readonly db: Database.Database) {}

  list(): VoiceCommand[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, trigger, template, language, permissions_json, cooldown_seconds, enabled
          FROM voice_commands
          ORDER BY created_at ASC, id ASC
        `,
      )
      .all() as VoiceCommandRow[];

    return rows.map((row) => ({
      id: row.id,
      trigger: row.trigger,
      template: row.template,
      language: row.language,
      permissions: JSON.parse(row.permissions_json) as PermissionLevel[],
      cooldownSeconds: row.cooldown_seconds,
      enabled: row.enabled === 1,
    }));
  }

  upsert(input: VoiceCommandUpsertInput): VoiceCommand[] {
    const nextId = input.id ?? randomUUID();
    this.db
      .prepare(
        `
          INSERT INTO voice_commands (
            id,
            trigger,
            template,
            language,
            permissions_json,
            cooldown_seconds,
            enabled,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            trigger = excluded.trigger,
            template = excluded.template,
            language = excluded.language,
            permissions_json = excluded.permissions_json,
            cooldown_seconds = excluded.cooldown_seconds,
            enabled = excluded.enabled,
            updated_at = datetime('now')
        `,
      )
      .run(
        nextId,
        input.trigger,
        input.template,
        input.language,
        JSON.stringify(input.permissions),
        input.cooldownSeconds,
        input.enabled ? 1 : 0,
      );

    return this.list();
  }

  delete(id: string): VoiceCommand[] {
    this.db.prepare('DELETE FROM voice_commands WHERE id = ?').run(id);
    return this.list();
  }
}
