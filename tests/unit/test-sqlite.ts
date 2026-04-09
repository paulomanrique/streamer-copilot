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
  close: () => void;
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
    close: () => {
      db.close();
    },
  };
}
