import type Database from 'better-sqlite3';

import type { EventLogEntry, EventLogFilters, EventLogLevel } from '../../shared/types.js';

interface EventLogRow {
  id: number;
  level: EventLogLevel;
  category: string;
  message: string;
  metadata_json: string | null;
  created_at: string;
}

export class LogRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters?: EventLogFilters): EventLogEntry[] {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters?.level && filters.level !== 'all') {
      clauses.push('level = ?');
      params.push(filters.level);
    }

    if (filters?.category?.trim()) {
      clauses.push('category = ?');
      params.push(filters.category.trim());
    }

    if (filters?.query?.trim()) {
      clauses.push('(message LIKE ? OR category LIKE ?)');
      const query = `%${filters.query.trim()}%`;
      params.push(query, query);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `
          SELECT id, level, category, message, metadata_json, created_at
          FROM event_logs
          ${whereClause}
          ORDER BY created_at DESC, id DESC
          LIMIT 250
        `,
      )
      .all(...params) as EventLogRow[];

    return rows.map((row) => ({
      id: row.id,
      level: row.level,
      category: row.category,
      message: row.message,
      metadataJson: row.metadata_json,
      createdAt: row.created_at,
    }));
  }

  insert(level: EventLogLevel, category: string, message: string, metadata?: unknown): void {
    this.db
      .prepare(
        `
          INSERT INTO event_logs (level, category, message, metadata_json)
          VALUES (?, ?, ?, ?)
        `,
      )
      .run(level, category, message, metadata === undefined ? null : JSON.stringify(metadata));
  }

  deleteAll(): void {
    this.db.prepare(`DELETE FROM event_logs`).run();
  }
}
