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
  {
    version: 4,
    name: 'create_sound_commands',
    sql: `
      CREATE TABLE IF NOT EXISTS sound_commands (
        id TEXT PRIMARY KEY,
        trigger TEXT NOT NULL,
        file_path TEXT NOT NULL,
        permissions_json TEXT NOT NULL,
        cooldown_seconds INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 5,
    name: 'create_text_commands',
    sql: `
      CREATE TABLE IF NOT EXISTS text_commands (
        id TEXT PRIMARY KEY,
        trigger TEXT NOT NULL,
        response TEXT NOT NULL,
        permissions_json TEXT NOT NULL,
        cooldown_seconds INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 6,
    name: 'create_raffles',
    sql: `
      CREATE TABLE IF NOT EXISTS raffles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        entry_command TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        entry_deadline_at TEXT,
        accepted_platforms_json TEXT NOT NULL,
        staff_trigger_command TEXT NOT NULL,
        winner_announcement_template TEXT NOT NULL,
        winner_entry_id TEXT,
        top2_entry_ids_json TEXT NOT NULL DEFAULT '[]',
        last_spin_at TEXT,
        current_round INTEGER NOT NULL DEFAULT 0,
        overlay_session_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS raffle_entries (
        id TEXT PRIMARY KEY,
        raffle_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        user_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        source_message_id TEXT,
        entered_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_eliminated INTEGER NOT NULL DEFAULT 0,
        elimination_order INTEGER,
        is_winner INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (raffle_id) REFERENCES raffles(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_raffle_entries_unique_user
      ON raffle_entries (raffle_id, user_key);

      CREATE INDEX IF NOT EXISTS idx_raffle_entries_active
      ON raffle_entries (raffle_id, is_eliminated);

      CREATE INDEX IF NOT EXISTS idx_raffle_entries_entered_at
      ON raffle_entries (raffle_id, entered_at);

      CREATE TABLE IF NOT EXISTS raffle_rounds (
        id TEXT PRIMARY KEY,
        raffle_id TEXT NOT NULL,
        round_number INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        selected_entry_id TEXT NOT NULL,
        selected_entry_name TEXT NOT NULL,
        result_type TEXT NOT NULL,
        participant_count_before INTEGER NOT NULL,
        participant_count_after INTEGER NOT NULL,
        animation_seed_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (raffle_id) REFERENCES raffles(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_raffle_rounds_raffle
      ON raffle_rounds (raffle_id, round_number);
    `,
  },
  {
    version: 7,
    name: 'create_chat_log',
    sql: `
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        channel TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT,
        message_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        badges_json TEXT NOT NULL DEFAULT '[]',
        avatar_url TEXT,
        timestamp_label TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
      ON chat_messages(session_id, created_at ASC);
    `,
  },
  {
    version: 8,
    name: 'raffle_open_announcement',
    sql: `
      ALTER TABLE raffles ADD COLUMN open_announcement_template TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 9,
    name: 'raffle_elimination_announcement',
    sql: `
      ALTER TABLE raffles ADD COLUMN elimination_announcement_template TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 10,
    name: 'raffle_sounds',
    sql: `
      ALTER TABLE raffles ADD COLUMN spin_sound_file TEXT;
      ALTER TABLE raffles ADD COLUMN eliminated_sound_file TEXT;
      ALTER TABLE raffles ADD COLUMN winner_sound_file TEXT;
    `,
  },
  {
    version: 11,
    name: 'command_schedules',
    sql: `
      ALTER TABLE text_commands ADD COLUMN command_enabled INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE text_commands ADD COLUMN schedule_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE text_commands ADD COLUMN schedule_interval_seconds INTEGER;
      ALTER TABLE text_commands ADD COLUMN schedule_random_window_seconds INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE text_commands ADD COLUMN schedule_target_platforms_json TEXT NOT NULL DEFAULT '["twitch","youtube"]';
      ALTER TABLE text_commands ADD COLUMN schedule_last_sent_at TEXT;

      ALTER TABLE sound_commands ADD COLUMN command_enabled INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE sound_commands ADD COLUMN schedule_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sound_commands ADD COLUMN schedule_interval_seconds INTEGER;
      ALTER TABLE sound_commands ADD COLUMN schedule_random_window_seconds INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sound_commands ADD COLUMN schedule_target_platforms_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE sound_commands ADD COLUMN schedule_last_sent_at TEXT;
    `,
  },
  {
    version: 12,
    name: 'create_suggestions',
    sql: `
      CREATE TABLE IF NOT EXISTS suggestion_lists (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        trigger TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'session',
        allow_duplicates INTEGER NOT NULL DEFAULT 0,
        permissions_json TEXT NOT NULL DEFAULT '["everyone"]',
        cooldown_seconds INTEGER NOT NULL DEFAULT 0,
        user_cooldown_seconds INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS suggestion_entries (
        id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        user_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (list_id) REFERENCES suggestion_lists(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_suggestion_entries_list
      ON suggestion_entries (list_id, created_at ASC);

      CREATE INDEX IF NOT EXISTS idx_suggestion_entries_user
      ON suggestion_entries (list_id, user_key);
    `,
  },
];
