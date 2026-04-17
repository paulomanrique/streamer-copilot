import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { PermissionLevel, SuggestionEntry, SuggestionList, SuggestionListUpsertInput } from '../../shared/types.js';

interface SuggestionListRow {
  id: string;
  title: string;
  trigger: string;
  mode: string;
  allow_duplicates: number;
  permissions_json: string;
  cooldown_seconds: number;
  user_cooldown_seconds: number;
  enabled: number;
}

interface SuggestionEntryRow {
  id: string;
  list_id: string;
  platform: string;
  user_key: string;
  display_name: string;
  content: string;
  created_at: string;
}

export interface AddEntryInput {
  listId: string;
  platform: string;
  userKey: string;
  displayName: string;
  content: string;
}

export class SuggestionRepository {
  constructor(private readonly db: Database.Database) {}

  listLists(): SuggestionList[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, trigger, mode, allow_duplicates, permissions_json,
                cooldown_seconds, user_cooldown_seconds, enabled
         FROM suggestion_lists
         ORDER BY created_at ASC, id ASC`,
      )
      .all() as SuggestionListRow[];

    return rows.map((row) => this.mapListRow(row));
  }

  upsertList(input: SuggestionListUpsertInput): SuggestionList[] {
    const nextId = input.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO suggestion_lists (
           id, title, trigger, mode, allow_duplicates, permissions_json,
           cooldown_seconds, user_cooldown_seconds, enabled, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           trigger = excluded.trigger,
           mode = excluded.mode,
           allow_duplicates = excluded.allow_duplicates,
           permissions_json = excluded.permissions_json,
           cooldown_seconds = excluded.cooldown_seconds,
           user_cooldown_seconds = excluded.user_cooldown_seconds,
           enabled = excluded.enabled,
           updated_at = datetime('now')`,
      )
      .run(
        nextId,
        input.title.trim(),
        input.trigger.trim(),
        input.mode,
        input.allowDuplicates ? 1 : 0,
        JSON.stringify(input.permissions),
        input.cooldownSeconds,
        input.userCooldownSeconds,
        input.enabled ? 1 : 0,
      );

    return this.listLists();
  }

  deleteList(id: string): SuggestionList[] {
    this.db.prepare('DELETE FROM suggestion_lists WHERE id = ?').run(id);
    return this.listLists();
  }

  listEntries(listId: string): SuggestionEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, list_id, platform, user_key, display_name, content, created_at
         FROM suggestion_entries
         WHERE list_id = ?
         ORDER BY created_at ASC`,
      )
      .all(listId) as SuggestionEntryRow[];

    return rows.map((row) => this.mapEntryRow(row));
  }

  addEntry(input: AddEntryInput): SuggestionEntry | null {
    const id = randomUUID();
    try {
      this.db
        .prepare(
          `INSERT INTO suggestion_entries (id, list_id, platform, user_key, display_name, content)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(id, input.listId, input.platform, input.userKey, input.displayName, input.content);
    } catch {
      return null;
    }

    const row = this.db
      .prepare('SELECT id, list_id, platform, user_key, display_name, content, created_at FROM suggestion_entries WHERE id = ?')
      .get(id) as SuggestionEntryRow | undefined;

    return row ? this.mapEntryRow(row) : null;
  }

  hasUserEntry(listId: string, userKey: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM suggestion_entries WHERE list_id = ? AND user_key = ? LIMIT 1')
      .get(listId, userKey);
    return !!row;
  }

  clearEntries(listId: string): void {
    this.db.prepare('DELETE FROM suggestion_entries WHERE list_id = ?').run(listId);
  }

  clearSessionEntries(): void {
    this.db
      .prepare(
        `DELETE FROM suggestion_entries
         WHERE list_id IN (SELECT id FROM suggestion_lists WHERE mode = 'session')`,
      )
      .run();
  }

  private mapListRow(row: SuggestionListRow): SuggestionList {
    return {
      id: row.id,
      title: row.title,
      trigger: row.trigger,
      mode: row.mode as SuggestionList['mode'],
      allowDuplicates: row.allow_duplicates === 1,
      permissions: JSON.parse(row.permissions_json) as PermissionLevel[],
      cooldownSeconds: row.cooldown_seconds,
      userCooldownSeconds: row.user_cooldown_seconds,
      enabled: row.enabled === 1,
    };
  }

  private mapEntryRow(row: SuggestionEntryRow): SuggestionEntry {
    return {
      id: row.id,
      listId: row.list_id,
      platform: row.platform as SuggestionEntry['platform'],
      userKey: row.user_key,
      displayName: row.display_name,
      content: row.content,
      createdAt: row.created_at,
    };
  }
}
