import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export interface ChatSession {
  id: string;
  platform: string;
  channel: string;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
}

export interface ChatLogMessage {
  id: string;
  sessionId: string;
  author: string;
  content: string;
  badges: string[];
  avatarUrl: string | null;
  timestampLabel: string;
  createdAt: string;
}

interface SessionRow {
  id: string;
  platform: string;
  channel: string;
  started_at: string;
  ended_at: string | null;
  message_count: number;
}

interface MessageRow {
  id: string;
  session_id: string;
  author: string;
  content: string;
  badges_json: string;
  avatar_url: string | null;
  timestamp_label: string;
  created_at: string;
}

export class ChatLogRepository {
  constructor(private readonly db: Database) {}

  openSession(platform: string, channel: string): ChatSession {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO chat_sessions (id, platform, channel, started_at)
         VALUES (?, ?, ?, datetime('now'))`,
      )
      .run(id, platform, channel);
    return this.getSession(id)!;
  }

  closeSession(sessionId: string): void {
    this.db
      .prepare(`UPDATE chat_sessions SET ended_at = datetime('now') WHERE id = ?`)
      .run(sessionId);
  }

  recordMessage(
    sessionId: string,
    msg: { id: string; author: string; content: string; badges: string[]; avatarUrl?: string | null; timestampLabel: string },
  ): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO chat_messages (id, session_id, author, content, badges_json, avatar_url, timestamp_label)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(msg.id, sessionId, msg.author, msg.content, JSON.stringify(msg.badges), msg.avatarUrl ?? null, msg.timestampLabel);

    this.db
      .prepare(`UPDATE chat_sessions SET message_count = message_count + 1 WHERE id = ?`)
      .run(sessionId);
  }

  listSessions(filters?: { platform?: string }): ChatSession[] {
    let sql = `SELECT * FROM chat_sessions`;
    const params: unknown[] = [];
    if (filters?.platform) {
      sql += ` WHERE platform = ?`;
      params.push(filters.platform);
    }
    sql += ` ORDER BY started_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as SessionRow[];
    return rows.map(this.mapSession);
  }

  getSession(sessionId: string): ChatSession | null {
    const row = this.db.prepare(`SELECT * FROM chat_sessions WHERE id = ?`).get(sessionId) as SessionRow | undefined;
    return row ? this.mapSession(row) : null;
  }

  getMessages(sessionId: string, opts?: { limit?: number; offset?: number }): ChatLogMessage[] {
    const limit = opts?.limit ?? 200;
    const offset = opts?.offset ?? 0;
    const rows = this.db
      .prepare(
        `SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?`,
      )
      .all(sessionId, limit, offset) as MessageRow[];
    return rows.map(this.mapMessage);
  }

  countMessages(sessionId: string): number {
    const row = this.db.prepare(`SELECT COUNT(*) as n FROM chat_messages WHERE session_id = ?`).get(sessionId) as { n: number };
    return row.n;
  }

  deleteSession(sessionId: string): void {
    this.db.prepare(`DELETE FROM chat_sessions WHERE id = ?`).run(sessionId);
  }

  /** Wipes every session and message. Active sessions in memory are no longer
   *  valid after this; callers must re-open them. */
  deleteAllSessions(): void {
    this.db.prepare(`DELETE FROM chat_sessions`).run();
    this.db.prepare(`DELETE FROM chat_messages`).run();
  }

  private mapSession(row: SessionRow): ChatSession {
    return {
      id: row.id,
      platform: row.platform,
      channel: row.channel,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      messageCount: row.message_count,
    };
  }

  private mapMessage(row: MessageRow): ChatLogMessage {
    return {
      id: row.id,
      sessionId: row.session_id,
      author: row.author,
      content: row.content,
      badges: JSON.parse(row.badges_json) as string[],
      avatarUrl: row.avatar_url,
      timestampLabel: row.timestamp_label,
      createdAt: row.created_at,
    };
  }
}
