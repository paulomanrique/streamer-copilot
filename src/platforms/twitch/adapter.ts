import { createRequire } from 'node:module';
import type { ChatMessage, PlatformId, StreamEvent, TwitchConnectionStatus } from '../../shared/types.js';
import type { PlatformRole } from '../../shared/platform.js';
import type { PlatformCapabilities } from '../../shared/moderation.js';
import { resolveFromRole } from '../../modules/commands/permission-utils.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';

/**
 * Subset of tmi.js IRC tags. Covers fields used by this adapter.
 * Values are string | boolean | number for simple tags, or
 * Record<string, string> for composite tags like `badges`.
 */
type TmiTags = Record<string, string | boolean | number | Record<string, string> | undefined>;

type TmiLikeClient = {
  connect: () => Promise<unknown>;
  disconnect: () => Promise<unknown>;
  say: (channel: string, message: string) => Promise<unknown> | unknown;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export interface TwitchAdapterOptions {
  channels?: string[];
  username?: string;
  password?: string;
  secure?: boolean;
  reconnect?: boolean;
  mockAuthor?: string;
  mockChannel?: string;
  onStatusChange?: (status: TwitchConnectionStatus) => void;
  resolveBadgeUrls?: (rawBadges: string | Record<string, string>) => string[];
}

const DEFAULT_MOCK_AUTHOR = 'Streamer';

export class TwitchChatAdapter implements PlatformChatAdapter {
  readonly platform: PlatformId = 'twitch';

  // Capabilities upgrade from READ_ONLY to TWITCH_MODERATION_CAPABILITIES once
  // setModeration() is wired in by app-context (after broadcaster id is known).
  capabilities: PlatformCapabilities = READ_ONLY_CAPABILITIES;
  moderation?: import('../../shared/moderation.js').ModerationApi;

  setModeration(api: import('../../shared/moderation.js').ModerationApi, capabilities: PlatformCapabilities): void {
    this.moderation = api;
    this.capabilities = capabilities;
  }

  private readonly messageHandlers = new Set<(message: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(event: StreamEvent) => void>();
  private readonly options: Required<Pick<TwitchAdapterOptions, 'secure' | 'reconnect'>> & TwitchAdapterOptions;
  private client: TmiLikeClient | null = null;
  private connected = false;
  private mockMode = false;
  private readonly channel: string | null;

  constructor(options: TwitchAdapterOptions = {}) {
    this.options = {
      secure: options.secure ?? true,
      reconnect: options.reconnect ?? true,
      ...options,
    };
    this.channel = this.resolvePrimaryChannel(this.options.channels);
  }

  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  onEvent(handler: (event: StreamEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    this.options.onStatusChange?.('connecting');

    const client = await this.createClient();
    if (!client) {
      this.mockMode = true;
      this.connected = true;
      this.options.onStatusChange?.('disconnected');
      return;
    }

    this.client = client;
    this.attachTmiListeners(client);

    try {
      await client.connect();
      this.connected = true;
      this.mockMode = false;
      this.options.onStatusChange?.('connected');
    } catch (err) {
      console.warn('[twitch] Connection failed, entering mock mode:', err instanceof Error ? err.message : String(err));
      this.mockMode = true;
      this.connected = true;
      this.client = null;
      this.options.onStatusChange?.('error');
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;

    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (err) {
        console.warn('[twitch] Disconnect error:', err instanceof Error ? err.message : String(err));
      }
    }

    this.client = null;
    this.options.onStatusChange?.('disconnected');
  }

  async sendMessage(content: string): Promise<void> {
    const channel = this.channel;
    if (this.client && channel && !this.mockMode) {
      await this.client.say(channel, content);
      return;
    }
    throw new Error('Twitch adapter is not connected with send-capable credentials');
  }

  private async createClient(): Promise<TmiLikeClient | null> {
    if (!this.channel) return null;

    const credentials = this.resolveCredentials();
    if (!credentials.username || !credentials.password) return null;

    try {
      const module = await this.loadTmiModule();
      if (!module) return null;

      const mod = module as Record<string, unknown>;
      const defaultExport = mod.default as Record<string, unknown> | undefined;
      const ClientCandidate = mod.Client ?? defaultExport?.Client ?? mod.default ?? mod;
      if (typeof ClientCandidate !== 'function') return null;
      const Client = ClientCandidate as new (options: Record<string, unknown>) => TmiLikeClient;

      return new Client({
        channels: this.options.channels ?? [this.channel],
        identity: {
          username: credentials.username,
          password: credentials.password,
        },
        connection: {
          secure: this.options.secure,
          reconnect: this.options.reconnect,
        },
      });
    } catch (err) {
      console.warn('[twitch] Failed to create tmi.js client:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  private attachTmiListeners(client: TmiLikeClient): void {
    client.on('message', (...args: unknown[]) => {
      const [channel, tags, message, self] = args as [string, TmiTags, string, boolean];
      if (self) return;
      const role = this.resolveRole(tags, channel);
      const normalizedChannel = this.normalizeChannelName(channel) ?? undefined;
      this.emitMessage({
        platform: 'twitch',
        author: this.resolveAuthor(tags, channel),
        content: message,
        badges: this.resolveBadges(tags),
        color: typeof tags.color === 'string' && tags.color ? tags.color : undefined,
        badgeUrls: this.options.resolveBadgeUrls ? this.options.resolveBadgeUrls((tags.badges as string | Record<string, string>) ?? '') : undefined,
        role,
        unifiedLevel: resolveFromRole(role),
        // Per-channel hint so the chat feed can label multi-channel Twitch
        // setups with the source channel instead of a generic "Twitch" badge.
        streamLabel: normalizedChannel,
        // Routes the chat-log to the right (platform, channel) session
        // when multiple Twitch accounts are connected concurrently.
        channelId: normalizedChannel,
      }, tags);
    });

    // Per-channel hint used by the chat feed and activity log to disambiguate
    // multi-channel Twitch setups. Each event handler receives the channel as
    // its first argument (with a leading '#'); we strip the '#' and forward.
    const labelOf = (channel: string | null | undefined): string | undefined =>
      this.normalizeChannelName(channel) ?? undefined;

    client.on('cheer', (...args: unknown[]) => {
      const [channel, tags, message] = args as [string, TmiTags, string];
      this.emitEvent({
        platform: 'twitch',
        type: 'cheer',
        author: this.resolveAuthor(tags, channel),
        amount: this.firstNumber(tags.bits) ?? 0,
        message: message || undefined,
        streamLabel: labelOf(channel),
      });
    });

    // New subscription
    client.on('subscription', (...args: unknown[]) => {
      const [channel, username, , message, tags] = args as [string, string, unknown, string, TmiTags];
      this.emitEvent({
        platform: 'twitch',
        type: 'subscription',
        author: String(username ?? this.resolveAuthor(tags ?? {}, channel)),
        amount: 1,
        message: message || undefined,
        streamLabel: labelOf(channel),
      });
    });

    // Resub — amount = months
    client.on('resub', (...args: unknown[]) => {
      const [channel, username, months, message, tags] = args as [string, string, number, string, TmiTags];
      this.emitEvent({
        platform: 'twitch',
        type: 'subscription',
        author: String(username ?? this.resolveAuthor(tags ?? {}, channel)),
        amount: this.firstNumber(months) ?? 1,
        message: message || undefined,
        streamLabel: labelOf(channel),
      });
    });

    // Single gift sub
    client.on('subgift', (...args: unknown[]) => {
      const [channel, gifter, , recipient, , tags] = args as [string, string, unknown, string, unknown, TmiTags];
      this.emitEvent({
        platform: 'twitch',
        type: 'gift',
        author: String(gifter ?? this.resolveAuthor(tags ?? {}, channel)),
        amount: 1,
        message: `to @${String(recipient ?? '')}`,
        streamLabel: labelOf(channel),
      });
    });

    // Anonymous gift sub
    client.on('anonsubgift', (...args: unknown[]) => {
      const [channel, , recipient] = args as [string, unknown, string];
      this.emitEvent({
        platform: 'twitch',
        type: 'gift',
        author: 'Anonymous',
        amount: 1,
        message: `to @${String(recipient ?? '')}`,
        streamLabel: labelOf(channel),
      });
    });

    // Mass gift subs (community gift)
    client.on('submysterygift', (...args: unknown[]) => {
      const [channel, gifter, count, , tags] = args as [string, string, number, unknown, TmiTags];
      this.emitEvent({
        platform: 'twitch',
        type: 'gift',
        author: String(gifter ?? this.resolveAuthor(tags ?? {}, channel)),
        amount: this.firstNumber(count) ?? 1,
        message: undefined,
        streamLabel: labelOf(channel),
      });
    });

    // Anonymous mass gift
    client.on('anonsubmysterygift', (...args: unknown[]) => {
      const [channel, count] = args as [string, number];
      this.emitEvent({
        platform: 'twitch',
        type: 'gift',
        author: 'Anonymous',
        amount: this.firstNumber(count) ?? 1,
        message: undefined,
        streamLabel: labelOf(channel),
      });
    });

    // Gift → paid upgrade (counts as subscription)
    client.on('giftpaidupgrade', (...args: unknown[]) => {
      const [channel, username, , tags] = args as [string, string, unknown, TmiTags];
      this.emitEvent({
        platform: 'twitch',
        type: 'subscription',
        author: String(username ?? this.resolveAuthor(tags ?? {}, channel)),
        amount: 1,
        message: undefined,
        streamLabel: labelOf(channel),
      });
    });

    client.on('anongiftpaidupgrade', (...args: unknown[]) => {
      const [channel, username, tags] = args as [string, string, TmiTags];
      this.emitEvent({
        platform: 'twitch',
        type: 'subscription',
        author: String(username ?? this.resolveAuthor(tags ?? {}, channel)),
        amount: 1,
        message: undefined,
        streamLabel: labelOf(channel),
      });
    });

    client.on('raided', (...args: unknown[]) => {
      const [channel, user, viewers] = args as [string, string, number];
      const tags = this.extractTags(args) ?? {};
      this.emitEvent({
        platform: 'twitch',
        type: 'raid',
        author: this.resolveEventAuthor(user, tags, channel),
        amount: this.firstNumber(viewers) ?? 0,
        message: undefined,
        streamLabel: labelOf(channel),
      });
    });

    client.on('connected', () => {
      this.connected = true;
      this.mockMode = false;
      this.options.onStatusChange?.('connected');
    });

    client.on('disconnected', () => {
      this.connected = false;
      this.options.onStatusChange?.('disconnected');
    });
  }

  private emitMessage(message: Omit<ChatMessage, 'id' | 'timestampLabel'> & { color?: string }, tags?: TmiTags): void {
    const userId = tags?.['user-id'];
    const payload: ChatMessage = {
      id: tags?.['id']?.toString?.() ?? this.buildId(),
      timestampLabel: this.formatTimestamp(tags?.['tmi-sent-ts']),
      ...message,
      userId: typeof userId === 'string' && userId ? userId : (typeof userId === 'number' ? String(userId) : message.userId),
    };

    for (const handler of this.messageHandlers) {
      handler(payload);
    }
  }

  private emitEvent(event: Omit<StreamEvent, 'id' | 'timestampLabel'>): void {
    const payload: StreamEvent = {
      id: this.buildId(),
      timestampLabel: this.formatTimestamp(),
      ...event,
    };

    for (const handler of this.eventHandlers) {
      handler(payload);
    }
  }

  private resolveCredentials(): { username: string | null; password: string | null } {
    const username = this.options.username ?? process.env.TWITCH_USERNAME ?? process.env.TWITCH_BOT_USERNAME ?? null;
    const password = this.options.password ?? process.env.TWITCH_OAUTH_TOKEN ?? process.env.TWITCH_PASSWORD ?? null;
    return { username, password };
  }

  private resolvePrimaryChannel(channels?: string[]): string | null {
    const fromOptions = channels?.find((channel) => Boolean(channel?.trim()));
    if (fromOptions) return this.normalizeChannelName(fromOptions);

    const envChannels = process.env.TWITCH_CHANNELS?.split(',').map((channel) => channel.trim()).filter(Boolean);
    if (envChannels?.length) return this.normalizeChannelName(envChannels[0]);

    const envChannel = process.env.TWITCH_CHANNEL ?? null;
    if (envChannel) return this.normalizeChannelName(envChannel);

    return this.options.mockChannel ? this.normalizeChannelName(this.options.mockChannel) : null;
  }

  private normalizeChannelName(channel: string | null | undefined): string | null {
    if (typeof channel !== 'string') return null;
    const normalized = channel.trim().replace(/^#/, '').toLowerCase();
    return normalized || null;
  }

  private resolveAuthor(tags: TmiTags, channel: string | null | undefined): string {
    return String(tags['display-name'] ?? tags.username ?? this.normalizeChannelName(channel) ?? this.options.mockAuthor ?? DEFAULT_MOCK_AUTHOR);
  }

  private resolveRole(tags: TmiTags, channel: string | null | undefined): PlatformRole {
    const rawBadges = tags.badges;
    const badgeMap: Record<string, string> = (rawBadges && typeof rawBadges === 'object')
      ? (rawBadges as Record<string, string>)
      : {};
    const badgeInfo = (tags['badge-info'] && typeof tags['badge-info'] === 'object')
      ? (tags['badge-info'] as Record<string, string>)
      : {};
    const username = typeof tags.username === 'string' ? tags.username.toLowerCase() : '';
    const channelLower = this.normalizeChannelName(channel);

    const broadcaster = Boolean(badgeMap.broadcaster) || (Boolean(username) && Boolean(channelLower) && username === channelLower);
    const moderator = this.isTruthy(tags.mod) || Boolean(badgeMap.moderator);
    const vip = Boolean(badgeMap.vip);
    const subscriberTierRaw = badgeMap.subscriber;
    const subscriber = this.isTruthy(tags.subscriber) || Boolean(subscriberTierRaw);
    const subTier: 1 | 2 | 3 | undefined = subscriberTierRaw
      ? (Number(subscriberTierRaw) >= 3000 ? 3 : Number(subscriberTierRaw) >= 2000 ? 2 : 1)
      : undefined;
    const subMonths = badgeInfo.subscriber ? Number(badgeInfo.subscriber) : undefined;
    const isFounder = Boolean(badgeMap.founder);
    const isArtist = Boolean(badgeMap['artist-badge']);
    const verified = Boolean(badgeMap.verified) || Boolean(badgeMap.partner);

    const extras: Record<string, unknown> = {};
    if (subTier !== undefined) extras.subTier = subTier;
    if (subMonths !== undefined && Number.isFinite(subMonths)) extras.subMonths = subMonths;
    if (isFounder) extras.isFounder = true;
    if (isArtist) extras.isArtist = true;
    if (verified) extras.verified = true;

    return {
      broadcaster,
      moderator,
      vip,
      subscriber,
      // Twitch follower status requires a Helix call; left for app-context to hydrate.
      extras: Object.keys(extras).length > 0 ? extras : undefined,
    };
  }

  private resolveBadges(tags: TmiTags): ChatMessage['badges'] {
    const badges: ChatMessage['badges'] = [];
    const rawBadges = tags.badges;
    if (rawBadges && typeof rawBadges === 'object') {
      for (const [name, version] of Object.entries(rawBadges as Record<string, string>)) {
        badges.push(`${name}/${version}`);
      }
    } else {
      // Fallback for some clients or scenarios
      if (this.isTruthy(tags.mod)) badges.push('moderator/1');
      if (this.isTruthy(tags.subscriber)) badges.push('subscriber/1');
    }
    return badges;
  }

  private hasBadge(rawBadges: unknown, badge: string): boolean {
    if (typeof rawBadges !== 'string' || !rawBadges) return false;
    return rawBadges.split(',').some((entry) => entry.trim().startsWith(`${badge}/`));
  }

  private extractTags(args: unknown[]): TmiTags | null {
    for (const value of args) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as TmiTags;
      }
    }
    return null;
  }

  private resolveEventAuthor(first: unknown, tags: TmiTags, channel: string | null | undefined): string {
    if (typeof first === 'string' && first.trim()) return first;
    return this.resolveAuthor(tags, channel);
  }

  private resolveEventAmount(first: unknown, second: unknown, third: unknown, tags: TmiTags): number | null {
    return this.firstNumber(first) ?? this.firstNumber(second) ?? this.firstNumber(third) ?? this.firstNumber(tags['msg-param-months']) ?? this.firstNumber(tags.bits);
  }

  private resolveEventMessage(first: unknown, second: unknown, third: unknown, tags: TmiTags): string | undefined {
    const values = [second, third, tags.message, tags['system-msg']];
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value;
    }
    return undefined;
  }

  private firstNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
    return null;
  }

  private isTruthy(value: unknown): boolean {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  private formatTimestamp(raw?: unknown): string {
    const timestamp = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : Date.now();
    const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private buildId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private async loadTmiModule(): Promise<unknown | null> {
    try {
      const require = createRequire(import.meta.url);
      return require('tmi.js');
    } catch {
      return null;
    }
  }
}

export function createTwitchChatAdapter(options: TwitchAdapterOptions = {}): TwitchChatAdapter {
  return new TwitchChatAdapter(options);
}
