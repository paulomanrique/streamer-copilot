import type { ModerationApi } from '../../shared/moderation.js';

export interface YouTubeModerationOptions {
  /** OAuth bearer token authorized for `youtube.force-ssl` scope. */
  accessToken: string;
  /** Currently active liveChatId for the broadcast. */
  liveChatId: string;
  /** Optional fetch override for tests. */
  fetchImpl?: typeof fetch;
}

const API = 'https://www.googleapis.com/youtube/v3/liveChat';

/**
 * Minimal YouTube Live Chat moderation surface used by ModerationPanel.
 *
 * Implements:
 *  - deleteMessage  → liveChatMessages.delete
 *  - banUser        → liveChatBans.insert (permanent)
 *  - unbanUser      → liveChatBans.delete (requires the original ban id; see note below)
 *  - timeoutUser    → liveChatBans.insert (type=temporary)
 *  - addMod/removeMod → liveChatModerators.insert/delete
 *
 * NOTE on unbanUser: YouTube returns a ban id when you create a ban; to unban you
 * must store that id. The caller (app-context) caches the ban id keyed by user id;
 * the API here just deletes whatever id you hand in.
 */
export class YouTubeModerationApi implements ModerationApi {
  constructor(private readonly options: YouTubeModerationOptions) {}

  async deleteMessage(messageId: string): Promise<void> {
    await this.request('DELETE', `/messages?id=${encodeURIComponent(messageId)}`);
  }

  async banUser(userId: string): Promise<void> {
    await this.request('POST', '/bans?part=snippet', {
      snippet: {
        liveChatId: this.options.liveChatId,
        type: 'permanent',
        bannedUserDetails: { channelId: userId },
      },
    });
  }

  async unbanUser(banId: string): Promise<void> {
    await this.request('DELETE', `/bans?id=${encodeURIComponent(banId)}`);
  }

  async timeoutUser(userId: string, durationSeconds: number): Promise<void> {
    await this.request('POST', '/bans?part=snippet', {
      snippet: {
        liveChatId: this.options.liveChatId,
        type: 'temporary',
        banDurationSeconds: durationSeconds,
        bannedUserDetails: { channelId: userId },
      },
    });
  }

  async addMod(userId: string): Promise<void> {
    await this.request('POST', '/moderators?part=snippet', {
      snippet: {
        liveChatId: this.options.liveChatId,
        moderatorDetails: { channelId: userId },
      },
    });
  }

  async removeMod(moderatorRecordId: string): Promise<void> {
    await this.request('DELETE', `/moderators?id=${encodeURIComponent(moderatorRecordId)}`);
  }

  private async request(method: string, pathSuffix: string, body?: unknown): Promise<unknown> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.accessToken}`,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetchImpl(`${API}${pathSuffix}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`YouTube ${method} ${pathSuffix} failed: ${response.status} ${response.statusText} ${text}`.trim());
    }
    if (response.status === 204) return null;
    try { return await response.json(); } catch { return null; }
  }
}

export const YOUTUBE_MODERATION_CAPABILITIES = Object.freeze({
  canDeleteMessage: true,
  canBanUser: true,
  canTimeoutUser: true,
  canSetSlowMode: false,
  canSetSubscribersOnly: false,
  canSetMembersOnly: false,
  canSetFollowersOnly: false,
  canSetEmoteOnly: false,
  canSetUniqueChat: false,
  canClearChat: false,
  canManageMods: true,
  canManageVips: false,
  canRaid: false,
  canShoutout: false,
});
