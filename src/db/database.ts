import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { MIGRATIONS } from './migrations.js';

const MAX_BACKUPS = 5;
const BACKUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

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
    // Execute each statement individually so an ALTER TABLE ADD COLUMN that targets
    // a column that already exists (from a partial previous migration) is tolerated.
    const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try {
        db.exec(stmt);
      } catch (err) {
        const isDuplicateColumn =
          err instanceof Error &&
          /duplicate column name/i.test(err.message) &&
          /ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN/i.test(stmt);
        if (!isDuplicateColumn) throw err;
      }
    }
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

  runIntegrityCheck(db);
  runMigrations(db);

  const backupTimer = setInterval(() => {
    void backupDatabase(db, dbPath).catch((err) =>
      console.warn('Database backup failed:', err instanceof Error ? err.message : String(err)),
    );
  }, BACKUP_INTERVAL_MS);

  // Run initial backup asynchronously (non-blocking)
  void backupDatabase(db, dbPath).catch(() => {});

  return {
    db,
    path: dbPath,
    close: () => {
      clearInterval(backupTimer);
      db.close();
    },
  };
}

/**
 * Run PRAGMA integrity_check on startup to detect corruption early.
 * Logs a warning instead of crashing if corruption is found.
 */
function runIntegrityCheck(db: Database.Database): void {
  try {
    const result = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const status = result[0]?.integrity_check;
    if (status !== 'ok') {
      console.warn('Database integrity check failed:', result);
    }
  } catch (err) {
    console.warn('Failed to run integrity check:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Create a backup copy of the database file using SQLite's backup API.
 * Keeps at most MAX_BACKUPS recent copies, rotating oldest out.
 */
async function backupDatabase(db: Database.Database, dbPath: string): Promise<void> {
  const backupDir = path.join(path.dirname(dbPath), 'backups');
  await fs.mkdir(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `streamer-copilot-${timestamp}.db`);

  await db.backup(backupPath);

  // Rotate old backups
  const entries = await fs.readdir(backupDir);
  const backupFiles = entries
    .filter((name) => name.startsWith('streamer-copilot-') && name.endsWith('.db'))
    .sort();

  if (backupFiles.length > MAX_BACKUPS) {
    const toDelete = backupFiles.slice(0, backupFiles.length - MAX_BACKUPS);
    await Promise.all(toDelete.map((name) => fs.unlink(path.join(backupDir, name)).catch(() => {})));
  }
}
