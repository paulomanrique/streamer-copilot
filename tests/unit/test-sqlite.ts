import { DatabaseSync } from 'node:sqlite';

type BindValue = string | number | null | undefined;

interface StatementLike {
  run: (...params: BindValue[]) => unknown;
  get: (...params: BindValue[]) => unknown;
  all: (...params: BindValue[]) => unknown[];
}

interface DatabaseLike {
  exec: (sql: string) => void;
  prepare: (sql: string) => StatementLike;
  pragma: (sql: string) => void;
  transaction: <TArgs extends unknown[]>(fn: (...args: TArgs) => void) => (...args: TArgs) => void;
  close: () => void;
}

/**
 * Mirrors the production migration runner (src/db/database.ts): executes the
 * SQL statement by statement and tolerates `ALTER TABLE ... ADD COLUMN` on a
 * column that already exists (migration 18 re-adds
 * voice_commands.user_cooldown_seconds for DBs that ran an older revision of
 * migration 17). Running the raw blob via `db.exec` aborts on that statement.
 */
export function execMigrationSql(db: DatabaseLike, sql: string): void {
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
}

export function createTestDatabase(): DatabaseLike {
  const db = new DatabaseSync(':memory:');

  return {
    exec: (sql) => {
      db.exec(sql);
    },
    prepare: (sql) => {
      const statement = db.prepare(sql);
      return {
        run: (...params) => statement.run(...params),
        get: (...params) => statement.get(...params),
        all: (...params) => statement.all(...params),
      };
    },
    pragma: (sql) => {
      db.exec(`PRAGMA ${sql};`);
    },
    transaction: (fn) => {
      return (...args) => {
        db.exec('BEGIN');
        try {
          fn(...args);
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      };
    },
    close: () => {
      db.close();
    },
  };
}
