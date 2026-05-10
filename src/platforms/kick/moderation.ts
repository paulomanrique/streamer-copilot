import type { ModerationApi } from '../../shared/moderation.js';

const PUBLIC_API = 'https://api.kick.com/public/v1';

export interface KickModerationOptions {
  accessToken: string;
  /** Numeric Kick broadcaster user id (channel owner). */
  broadcasterUserId: number;
  /** Optional fetch override for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Kick public-API moderation surface.
 *
 * Required token scopes: `chat:write`, `moderation:read`, `moderation:write`.
 * Endpoints below follow the public REST surface documented at
 * https://docs.kick.com/apis/v1 — when an endpoint is missing the method is
 * intentionally omitted so capabilities can declare it unsupported.
 */
export class KickModerationApi implements ModerationApi {
  constructor(private readonly options: KickModerationOptions) {}

  async deleteMessage(messageId: string): Promise<void> {
    await this.request('DELETE', `/chat/messages/${encodeURIComponent(messageId)}?broadcaster_user_id=${this.bid()}`);
  }

  async banUser(userId: string, reason?: string): Promise<void> {
    await this.request('POST', '/moderation/bans', {
      broadcaster_user_id: this.options.broadcasterUserId,
      user_id: Number(userId),
      reason,
    });
  }

  async unbanUser(userId: string): Promise<void> {
    await this.request('DELETE', `/moderation/bans?broadcaster_user_id=${this.bid()}&user_id=${encodeURIComponent(userId)}`);
  }

  async timeoutUser(userId: string, durationSeconds: number, reason?: string): Promise<void> {
    await this.request('POST', '/moderation/timeouts', {
      broadcaster_user_id: this.options.broadcasterUserId,
      user_id: Number(userId),
      duration_seconds: durationSeconds,
      reason,
    });
  }

  async setSlowMode(enabled: boolean, seconds = 30): Promise<void> {
    await this.request('PATCH', '/chat/settings', {
      broadcaster_user_id: this.options.broadcasterUserId,
      slow_mode: enabled,
      slow_mode_seconds: enabled ? seconds : null,
    });
  }

  async setSubscribersOnly(enabled: boolean): Promise<void> {
    await this.request('PATCH', '/chat/settings', {
      broadcaster_user_id: this.options.broadcasterUserId,
      subscribers_only: enabled,
    });
  }

  async setFollowersOnly(enabled: boolean, minDurationMinutes?: number): Promise<void> {
    await this.request('PATCH', '/chat/settings', {
      broadcaster_user_id: this.options.broadcasterUserId,
      followers_only: enabled,
      followers_only_minutes: enabled ? (minDurationMinutes ?? 0) : null,
    });
  }

  async setEmoteOnly(enabled: boolean): Promise<void> {
    await this.request('PATCH', '/chat/settings', {
      broadcaster_user_id: this.options.broadcasterUserId,
      emotes_only: enabled,
    });
  }

  async clearChat(): Promise<void> {
    await this.request('POST', '/moderation/clear-chat', {
      broadcaster_user_id: this.options.broadcasterUserId,
    });
  }

  async addMod(userId: string): Promise<void> {
    await this.request('POST', '/moderation/moderators', {
      broadcaster_user_id: this.options.broadcasterUserId,
      user_id: Number(userId),
    });
  }

  async removeMod(userId: string): Promise<void> {
    await this.request('DELETE', `/moderation/moderators?broadcaster_user_id=${this.bid()}&user_id=${encodeURIComponent(userId)}`);
  }

  async addVip(userId: string): Promise<void> {
    await this.request('POST', '/moderation/vips', {
      broadcaster_user_id: this.options.broadcasterUserId,
      user_id: Number(userId),
    });
  }

  async removeVip(userId: string): Promise<void> {
    await this.request('DELETE', `/moderation/vips?broadcaster_user_id=${this.bid()}&user_id=${encodeURIComponent(userId)}`);
  }

  private bid(): string { return String(this.options.broadcasterUserId); }

  private async request(method: string, pathSuffix: string, body?: unknown): Promise<unknown> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.accessToken}`,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetchImpl(`${PUBLIC_API}${pathSuffix}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Kick ${method} ${pathSuffix} failed: ${response.status} ${response.statusText} ${text}`.trim());
    }
    if (response.status === 204) return null;
    try { return await response.json(); } catch { return null; }
  }
}

export const KICK_MODERATION_CAPABILITIES = Object.freeze({
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
  canRaid: false,
  canShoutout: false,
});
