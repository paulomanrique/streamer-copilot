import type { ModerationApi } from '../../shared/moderation.js';

const HELIX = 'https://api.twitch.tv/helix';

export interface TwitchModerationOptions {
  /** Bare OAuth token without the `oauth:` prefix (Helix expects the bare value). */
  accessToken: string;
  clientId: string;
  /** Twitch user_id of the broadcaster. Required for most moderation endpoints. */
  broadcasterUserId: string;
  /** Twitch user_id of the moderator running the action (often the broadcaster itself). */
  moderatorUserId: string;
  /** Optional fetch override for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Helix-backed implementation of ModerationApi for Twitch.
 *
 * Required token scopes:
 *   moderator:manage:banned_users
 *   moderator:manage:chat_messages
 *   moderator:manage:chat_settings
 *   moderator:manage:shoutouts
 *   channel:manage:raids
 *   channel:manage:moderators
 *   channel:manage:vips
 */
export class TwitchModerationApi implements ModerationApi {
  constructor(private readonly options: TwitchModerationOptions) {}

  async deleteMessage(messageId: string): Promise<void> {
    await this.request('DELETE', `/moderation/chat?broadcaster_id=${this.bid()}&moderator_id=${this.mid()}&message_id=${encodeURIComponent(messageId)}`);
  }

  async banUser(userId: string, reason?: string): Promise<void> {
    await this.request('POST', `/moderation/bans?broadcaster_id=${this.bid()}&moderator_id=${this.mid()}`, {
      data: { user_id: userId, reason },
    });
  }

  async unbanUser(userId: string): Promise<void> {
    await this.request('DELETE', `/moderation/bans?broadcaster_id=${this.bid()}&moderator_id=${this.mid()}&user_id=${encodeURIComponent(userId)}`);
  }

  async timeoutUser(userId: string, durationSeconds: number, reason?: string): Promise<void> {
    await this.request('POST', `/moderation/bans?broadcaster_id=${this.bid()}&moderator_id=${this.mid()}`, {
      data: { user_id: userId, duration: durationSeconds, reason },
    });
  }

  async setSlowMode(enabled: boolean, seconds = 30): Promise<void> {
    await this.patchSettings({ slow_mode: enabled, slow_mode_wait_time: enabled ? seconds : null });
  }

  async setSubscribersOnly(enabled: boolean): Promise<void> {
    await this.patchSettings({ subscriber_mode: enabled });
  }

  async setFollowersOnly(enabled: boolean, minDurationMinutes?: number): Promise<void> {
    await this.patchSettings({ follower_mode: enabled, follower_mode_duration: enabled ? (minDurationMinutes ?? 0) : null });
  }

  async setEmoteOnly(enabled: boolean): Promise<void> {
    await this.patchSettings({ emote_mode: enabled });
  }

  async clearChat(): Promise<void> {
    await this.request('DELETE', `/moderation/chat?broadcaster_id=${this.bid()}&moderator_id=${this.mid()}`);
  }

  async addMod(userId: string): Promise<void> {
    await this.request('POST', `/moderation/moderators?broadcaster_id=${this.bid()}&user_id=${encodeURIComponent(userId)}`);
  }

  async removeMod(userId: string): Promise<void> {
    await this.request('DELETE', `/moderation/moderators?broadcaster_id=${this.bid()}&user_id=${encodeURIComponent(userId)}`);
  }

  async addVip(userId: string): Promise<void> {
    await this.request('POST', `/channels/vips?broadcaster_id=${this.bid()}&user_id=${encodeURIComponent(userId)}`);
  }

  async removeVip(userId: string): Promise<void> {
    await this.request('DELETE', `/channels/vips?broadcaster_id=${this.bid()}&user_id=${encodeURIComponent(userId)}`);
  }

  async raid(targetChannel: string): Promise<void> {
    // targetChannel must already be a Twitch user_id; resolution happens in the caller.
    await this.request('POST', `/raids?from_broadcaster_id=${this.bid()}&to_broadcaster_id=${encodeURIComponent(targetChannel)}`);
  }

  async shoutout(userId: string): Promise<void> {
    await this.request('POST', `/chat/shoutouts?from_broadcaster_id=${this.bid()}&to_broadcaster_id=${encodeURIComponent(userId)}&moderator_id=${this.mid()}`);
  }

  private async patchSettings(settings: Record<string, unknown>): Promise<void> {
    await this.request('PATCH', `/chat/settings?broadcaster_id=${this.bid()}&moderator_id=${this.mid()}`, { data: settings });
  }

  private bid(): string { return encodeURIComponent(this.options.broadcasterUserId); }
  private mid(): string { return encodeURIComponent(this.options.moderatorUserId); }

  private async request(method: string, pathSuffix: string, body?: { data: unknown }): Promise<unknown> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.accessToken}`,
      'Client-Id': this.options.clientId,
    };
    if (body) headers['Content-Type'] = 'application/json';

    const response = await fetchImpl(`${HELIX}${pathSuffix}`, {
      method,
      headers,
      body: body ? JSON.stringify(body.data) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Twitch ${method} ${pathSuffix} failed: ${response.status} ${response.statusText} ${text}`.trim());
    }
    if (response.status === 204) return null;
    try { return await response.json(); } catch { return null; }
  }
}

export const TWITCH_MODERATION_CAPABILITIES = Object.freeze({
  canDeleteMessage: true,
  canBanUser: true,
  canTimeoutUser: true,
  canSetSlowMode: true,
  canSetSubscribersOnly: true,
  canSetMembersOnly: false,
  canSetFollowersOnly: true,
  canSetEmoteOnly: true,
  canSetUniqueChat: false,
  canClearChat: true,
  canManageMods: true,
  canManageVips: true,
  canRaid: true,
  canShoutout: true,
});
