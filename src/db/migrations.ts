export interface SqlMigration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: SqlMigration[] = [
  {
    version: 1,
    name: 'create_core_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS event_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 2,
    name: 'create_scheduled_messages',
    sql: `
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id TEXT PRIMARY KEY,
        message TEXT NOT NULL,
        interval_seconds INTEGER NOT NULL,
        random_window_seconds INTEGER NOT NULL DEFAULT 0,
        target_platforms_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_sent_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 3,
    name: 'create_voice_commands',
    sql: `
      CREATE TABLE IF NOT EXISTS voice_commands (
        id TEXT PRIMARY KEY,
        trigger TEXT NOT NULL,
        template TEXT,
        language TEXT NOT NULL,
        permissions_json TEXT NOT NULL,
        cooldown_seconds INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
];
