import path from 'node:path';

import Database from 'better-sqlite3';

import { MIGRATIONS } from './migrations.js';

export interface DatabaseHandle {
  db: Database.Database;
  close: () => void;
  path: string;
}

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function runMigrations(db: Database.Database): void {
  ensureMigrationsTable(db);

  const getApplied = db.prepare('SELECT version FROM schema_migrations');
  const appliedVersions = new Set<number>((getApplied.all() as Array<{ version: number }>).map((row) => row.version));

  const applyMigration = db.transaction((version: number, name: string, sql: string) => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(version, name);
  });

  for (const migration of MIGRATIONS.sort((a, b) => a.version - b.version)) {
    if (appliedVersions.has(migration.version)) continue;
    applyMigration(migration.version, migration.name, migration.sql);
  }
}

export function resolveDatabasePath(userDataPath: string): string {
  return path.join(userDataPath, 'streamer-copilot.db');
}

export function openDatabase(userDataPath: string): DatabaseHandle {
  const dbPath = resolveDatabasePath(userDataPath);
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  return {
    db,
    path: dbPath,
    close: () => db.close(),
  };
}
