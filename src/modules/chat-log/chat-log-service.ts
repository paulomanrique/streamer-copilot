import type { ChatMessage, PlatformId } from '../../shared/types.js';
import type { ChatLogRepository, ChatSession, ChatLogMessage } from './chat-log-repository.js';

export type { ChatSession, ChatLogMessage };

export class ChatLogService {
  // platform → active session id
  private readonly activeSessions = new Map<PlatformId, string>();

  constructor(private readonly repo: ChatLogRepository) {}

  openSession(platform: PlatformId, channel: string): void {
    // Close any existing session for this platform first
    this.closeSession(platform);
    const session = this.repo.openSession(platform, channel);
    this.activeSessions.set(platform, session.id);
  }

  closeSession(platform: PlatformId): void {
    const sessionId = this.activeSessions.get(platform);
    if (sessionId) {
      this.repo.closeSession(sessionId);
      this.activeSessions.delete(platform);
    }
  }

  recordMessage(message: ChatMessage): void {
    const sessionId = this.activeSessions.get(message.platform);
    if (!sessionId) return;
    this.repo.recordMessage(sessionId, {
      id: message.id,
      author: message.author,
      content: message.content,
      badges: message.badges,
      avatarUrl: message.avatarUrl,
      timestampLabel: message.timestampLabel,
    });
  }

  listSessions(filters?: { platform?: string }): ChatSession[] {
    return this.repo.listSessions(filters);
  }

  getMessages(sessionId: string, opts?: { limit?: number; offset?: number }): ChatLogMessage[] {
    return this.repo.getMessages(sessionId, opts);
  }

  countMessages(sessionId: string): number {
    return this.repo.countMessages(sessionId);
  }

  deleteSession(sessionId: string): void {
    // If it's an active session, close it first
    for (const [platform, sid] of this.activeSessions) {
      if (sid === sessionId) {
        this.activeSessions.delete(platform);
        break;
      }
    }
    this.repo.deleteSession(sessionId);
  }

  exportSessionHtml(sessionId: string): string {
    const session = this.repo.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const messages = this.repo.getMessages(sessionId, { limit: 100_000 });

    const platformLabel = session.platform === 'youtube-v' ? 'YouTube (Vertical)' : session.platform.charAt(0).toUpperCase() + session.platform.slice(1);
    const startDate = new Date(session.startedAt).toLocaleString();
    const endDate = session.endedAt ? new Date(session.endedAt).toLocaleString() : 'Active';

    const messagesHtml = messages
      .map((m) => {
        const badgesHtml = m.badges.map((b) => `<span class="badge">${escapeHtml(b)}</span>`).join('');
        return `
        <div class="message">
          <span class="ts">${escapeHtml(m.timestampLabel)}</span>
          <span class="author">${escapeHtml(m.author)}</span>
          ${badgesHtml}
          <span class="content">${escapeHtml(m.content)}</span>
        </div>`.trim();
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Chat Log — ${escapeHtml(session.channel)} (${escapeHtml(platformLabel)})</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0e0f16; color: #d1d5db; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 13px; line-height: 1.5; }
  .header { background: #161822; border-bottom: 1px solid #2a2d3e; padding: 16px 24px; display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
  .header h1 { font-size: 16px; font-weight: 600; color: #f3f4f6; }
  .meta { font-size: 12px; color: #6b7280; }
  .meta span { color: #9ca3af; }
  .messages { padding: 8px 0; max-width: 900px; margin: 0 auto; }
  .message { padding: 4px 24px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .message:hover { background: #161822; }
  .ts { font-size: 11px; color: #4b5563; flex-shrink: 0; }
  .author { font-weight: 600; color: #a78bfa; flex-shrink: 0; }
  .badge { font-size: 10px; background: #1f2937; color: #9ca3af; border-radius: 3px; padding: 1px 5px; }
  .content { color: #e5e7eb; }
</style>
</head>
<body>
<div class="header">
  <h1>${escapeHtml(session.channel)} — ${escapeHtml(platformLabel)}</h1>
  <div class="meta">
    <span>${startDate}</span> → <span>${endDate}</span>
    &nbsp;·&nbsp; <span>${messages.length.toLocaleString()}</span> messages
  </div>
</div>
<div class="messages">
${messagesHtml}
</div>
</body>
</html>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
