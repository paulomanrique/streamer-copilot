import type { ChatMessage, PlatformId, StreamEvent } from '../../shared/types.js';
import type { PlatformChatAdapter } from '../base.js';

type TmiLikeClient = {
  connect: () => Promise<unknown>;
  disconnect: () => Promise<unknown>;
  say: (channel: string, message: string) => Promise<unknown> | unknown;
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  off?: (event: string, handler: (...args: any[]) => void) => void;
};

export interface TwitchAdapterOptions {
  channels?: string[];
  username?: string;
  password?: string;
  secure?: boolean;
  reconnect?: boolean;
  mockAuthor?: string;
  mockChannel?: string;
}

const DEFAULT_MOCK_AUTHOR = 'Streamer';

export class TwitchChatAdapter implements PlatformChatAdapter {
  readonly platform: PlatformId = 'twitch';

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

    const client = await this.createClient();
    if (!client) {
      this.mockMode = true;
      this.connected = true;
      return;
    }

    this.client = client;
    this.attachTmiListeners(client);

    try {
      await client.connect();
      this.connected = true;
      this.mockMode = false;
    } catch {
      this.mockMode = true;
      this.connected = true;
      this.client = null;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;

    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // Ignore disconnect errors in fallback mode.
      }
    }

    this.client = null;
  }

  async sendMessage(content: string): Promise<void> {
    const channel = this.channel;
    if (this.client && channel && !this.mockMode) {
      await this.client.say(channel, content);
      return;
    }

    this.emitMessage({
      platform: 'twitch',
      author: this.options.mockAuthor ?? this.options.username ?? DEFAULT_MOCK_AUTHOR,
      content,
      badges: [],
    });
  }

  private async createClient(): Promise<TmiLikeClient | null> {
    if (!this.channel) return null;

    const credentials = this.resolveCredentials();
    if (!credentials.username || !credentials.password) return null;

    try {
      const module = await this.loadTmiModule();
      if (!module) return null;

      const mod = module as any;
      const Client = mod.Client ?? mod.default?.Client ?? mod.default ?? mod;
      if (typeof Client !== 'function') return null;

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
      }) as TmiLikeClient;
    } catch {
      return null;
    }
  }

  private attachTmiListeners(client: TmiLikeClient): void {
    client.on('message', (channel: string, tags: Record<string, any>, message: string, self: boolean) => {
      if (self) return;
      this.emitMessage({
        platform: 'twitch',
        author: this.resolveAuthor(tags, channel),
        content: message,
        badges: this.resolveBadges(tags),
      }, tags);
    });

    client.on('cheer', (channel: string, tags: Record<string, any>, message: string) => {
      this.emitEvent({
        platform: 'twitch',
        type: 'cheer',
        author: this.resolveAuthor(tags, channel),
        amount: this.firstNumber(tags.bits) ?? 0,
        message: message || undefined,
      });
    });

    const subscriptionEvents = ['subscription', 'resub', 'subgift', 'anonsubgift', 'giftpaidupgrade', 'anongiftpaidupgrade'];
    for (const eventName of subscriptionEvents) {
      client.on(eventName, (...args: any[]) => {
        const [channel, first, second, third] = args;
        const tags = this.extractTags(args) ?? {};
        this.emitEvent({
          platform: 'twitch',
          type: 'subscription',
          author: this.resolveEventAuthor(first, tags, channel),
          amount: this.resolveEventAmount(first, second, third, tags) ?? 1,
          message: this.resolveEventMessage(first, second, third, tags),
        });
      });
    }

    client.on('raided', (...args: any[]) => {
      const [channel, user, viewers] = args;
      const tags = this.extractTags(args) ?? {};
      this.emitEvent({
        platform: 'twitch',
        type: 'raid',
        author: this.resolveEventAuthor(user, tags, channel),
        amount: this.firstNumber(viewers) ?? 0,
        message: undefined,
      });
    });

    client.on('connected', () => {
      this.connected = true;
      this.mockMode = false;
    });

    client.on('disconnected', () => {
      this.connected = false;
    });
  }

  private emitMessage(message: Omit<ChatMessage, 'id' | 'timestampLabel'>, tags?: Record<string, any>): void {
    const payload: ChatMessage = {
      id: tags?.['id']?.toString?.() ?? this.buildId(),
      timestampLabel: this.formatTimestamp(tags?.['tmi-sent-ts']),
      ...message,
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

  private resolveAuthor(tags: Record<string, any>, channel: string | null | undefined): string {
    return String(tags['display-name'] ?? tags.username ?? this.normalizeChannelName(channel) ?? this.options.mockAuthor ?? DEFAULT_MOCK_AUTHOR);
  }

  private resolveBadges(tags: Record<string, any>): ChatMessage['badges'] {
    const badges: ChatMessage['badges'] = [];
    if (this.isTruthy(tags.mod) || this.hasBadge(tags.badges, 'moderator')) badges.push('moderator');
    if (this.isTruthy(tags.subscriber) || this.hasBadge(tags.badges, 'subscriber')) badges.push('subscriber');
    return badges;
  }

  private hasBadge(rawBadges: unknown, badge: string): boolean {
    if (typeof rawBadges !== 'string' || !rawBadges) return false;
    return rawBadges.split(',').some((entry) => entry.trim().startsWith(`${badge}/`));
  }

  private extractTags(args: any[]): Record<string, any> | null {
    for (const value of args) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, any>;
      }
    }
    return null;
  }

  private resolveEventAuthor(first: unknown, tags: Record<string, any>, channel: string | null | undefined): string {
    if (typeof first === 'string' && first.trim()) return first;
    return this.resolveAuthor(tags, channel);
  }

  private resolveEventAmount(first: unknown, second: unknown, third: unknown, tags: Record<string, any>): number | null {
    return this.firstNumber(first) ?? this.firstNumber(second) ?? this.firstNumber(third) ?? this.firstNumber(tags['msg-param-months']) ?? this.firstNumber(tags.bits);
  }

  private resolveEventMessage(first: unknown, second: unknown, third: unknown, tags: Record<string, any>): string | undefined {
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
      const importer = new Function('return import("tmi.js")') as () => Promise<unknown>;
      return await importer();
    } catch {
      return null;
    }
  }
}

export function createTwitchChatAdapter(options: TwitchAdapterOptions = {}): TwitchChatAdapter {
  return new TwitchChatAdapter(options);
}
