import type { ChatMessage, PlatformId, StreamEvent } from '../../shared/types.js';
import type { PlatformRole } from '../../shared/platform.js';
import type { PlatformCapabilities } from '../../shared/moderation.js';
import { resolveFromRole } from '../../modules/commands/permission-utils.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';

type YouTubeMessagePart = {
  snippet?: {
    displayMessage?: string;
    publishedAt?: string;
    type?: string;
    textMessageDetails?: { messageText?: string };
    superChatDetails?: {
      amountMicros?: string | number;
      currency?: string;
      userComment?: string;
    };
    superStickerDetails?: {
      amountMicros?: string | number;
      currency?: string;
    };
    memberMilestoneChatDetails?: {
      memberMonth?: number;
      memberLevelName?: string;
      userComment?: string;
    };
    newSponsorDetails?: {
      memberMonth?: number;
      memberLevelName?: string;
      userComment?: string;
    };
  };
  authorDetails?: {
    channelId?: string;
    displayName?: string;
    isChatModerator?: boolean;
    isChatOwner?: boolean;
    isChatSponsor?: boolean;
    isChatMember?: boolean;
  };
  id?: string;
};

type YouTubeListResponse = {
  items?: YouTubeMessagePart[];
  nextPageToken?: string;
  pollingIntervalMillis?: number;
};

interface YouTubeLiveChatClient {
  listMessages: (input: { liveChatId: string; pageToken?: string | null }) => Promise<YouTubeListResponse>;
  sendMessage: (input: { liveChatId: string; messageText: string }) => Promise<void>;
}

export interface YouTubeAdapterOptions {
  liveChatId?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  mockAuthor?: string;
  mockChannel?: string;
  pollingIntervalMillis?: number;
  client?: YouTubeLiveChatClient;
  fetchImpl?: typeof fetch;
}

const DEFAULT_MOCK_AUTHOR = 'Streamer';
const DEFAULT_POLLING_INTERVAL_MILLIS = 5000;
const MAX_POLLING_INTERVAL_MILLIS = 30000;

export class YouTubeChatAdapter implements PlatformChatAdapter {
  readonly platform: PlatformId = 'youtube';
  readonly capabilities: PlatformCapabilities = READ_ONLY_CAPABILITIES;

  private readonly messageHandlers = new Set<(message: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(event: StreamEvent) => void>();
  private readonly options: YouTubeAdapterOptions;
  private readonly fetchImpl: typeof fetch | null;
  private client: YouTubeLiveChatClient | null = null;
  private connected = false;
  private mockMode = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private nextPageToken: string | null = null;
  private currentPollingIntervalMillis = DEFAULT_POLLING_INTERVAL_MILLIS;
  private isFirstPoll = true;

  constructor(options: YouTubeAdapterOptions = {}) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
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

    const config = this.resolveConfig();
    if (!config.liveChatId || !this.hasAuth(config)) {
      this.mockMode = true;
      this.connected = true;
      return;
    }

    try {
      this.client = this.options.client ?? (await this.createClient(config));
      if (!this.client) {
        this.mockMode = true;
        this.connected = true;
        return;
      }

      this.mockMode = false;
      this.connected = true;
      this.nextPageToken = null;
      this.isFirstPoll = true;
      this.currentPollingIntervalMillis = this.options.pollingIntervalMillis ?? DEFAULT_POLLING_INTERVAL_MILLIS;
      void this.pollOnce(config.liveChatId);
    } catch (err) {
      console.warn('[youtube] Connection failed, entering mock mode:', err instanceof Error ? err.message : String(err));
      this.client = null;
      this.mockMode = true;
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.mockMode = false;
    this.nextPageToken = null;
    this.client = null;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async sendMessage(content: string): Promise<void> {
    const config = this.resolveConfig();
    if (!this.connected || this.mockMode || !this.client || !config.liveChatId) {
      throw new Error('YouTube adapter is not connected to an active live chat');
    }

    await this.client.sendMessage({ liveChatId: config.liveChatId, messageText: content });
  }

  private resolveConfig(): Required<Pick<YouTubeAdapterOptions, 'mockAuthor' | 'mockChannel'>> &
    YouTubeAdapterOptions & { channelTitle: string | null } {
    return {
      ...this.options,
      mockAuthor: this.options.mockAuthor ?? DEFAULT_MOCK_AUTHOR,
      mockChannel: this.options.mockChannel ?? 'YouTube',
      channelTitle: this.options.mockChannel ?? null,
    };
  }

  private hasAuth(config: YouTubeAdapterOptions): boolean {
    return Boolean(config.accessToken || config.refreshToken || config.clientId || config.clientSecret);
  }

  private async createClient(config: YouTubeAdapterOptions): Promise<YouTubeLiveChatClient | null> {
    if (config.client) return config.client;
    if (!config.liveChatId || !this.hasAuth(config)) return null;

    const oauth = await this.createOAuthClient(config);
    if (!oauth) return null;

    const api = await this.loadGoogleApis();
    if (api?.google?.youtube) {
      const youtube = api.google.youtube({ version: 'v3', auth: oauth });
      return {
        listMessages: async ({ liveChatId, pageToken }) => {
          const response = await youtube.liveChatMessages.list({
            liveChatId,
            part: ['snippet', 'authorDetails'],
            pageToken: pageToken ?? undefined,
            maxResults: 200,
          });
          return {
            items: (response.data.items as YouTubeMessagePart[] | undefined) ?? [],
            nextPageToken: response.data.nextPageToken ?? undefined,
            pollingIntervalMillis: response.data.pollingIntervalMillis ?? undefined,
          };
        },
        sendMessage: async ({ liveChatId, messageText }) => {
          await youtube.liveChatMessages.insert({
            part: ['snippet'],
            requestBody: {
              snippet: {
                liveChatId,
                type: 'textMessageEvent',
                textMessageDetails: { messageText },
              },
            },
          });
        },
      };
    }

    const accessToken = this.resolveAccessToken(config);
    if (!accessToken || !this.fetchImpl) return null;

    return {
      listMessages: async ({ liveChatId, pageToken }) => {
        const url = new URL('https://www.googleapis.com/youtube/v3/liveChat/messages');
        url.searchParams.set('liveChatId', liveChatId);
        url.searchParams.set('part', 'snippet,authorDetails');
        url.searchParams.set('maxResults', '200');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        if (config.apiKey) url.searchParams.set('key', config.apiKey);

        const response = await this.fetchImpl!(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`YouTube live chat polling failed: ${response.status} ${response.statusText}`);
        }

        const json = (await response.json()) as YouTubeListResponse;
        return {
          items: json.items ?? [],
          nextPageToken: json.nextPageToken ?? undefined,
          pollingIntervalMillis: json.pollingIntervalMillis ?? undefined,
        };
      },
      sendMessage: async ({ liveChatId, messageText }) => {
        const url = new URL('https://www.googleapis.com/youtube/v3/liveChat/messages');
        url.searchParams.set('part', 'snippet');
        if (config.apiKey) url.searchParams.set('key', config.apiKey);

        const response = await this.fetchImpl!(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            snippet: {
              liveChatId,
              type: 'textMessageEvent',
              textMessageDetails: { messageText },
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`YouTube live chat send failed: ${response.status} ${response.statusText}`);
        }
      },
    };
  }

  private async createOAuthClient(config: YouTubeAdapterOptions): Promise<unknown | null> {
    const api = await this.loadGoogleApis();
    if (!api?.google?.auth?.OAuth2) return null;
    if (!config.clientId || !config.clientSecret) return null;

    const oauth2 = new api.google.auth.OAuth2(config.clientId, config.clientSecret, 'http://127.0.0.1');
    const credentials: Record<string, string> = {};
    if (config.accessToken) credentials.access_token = config.accessToken;
    if (config.refreshToken) credentials.refresh_token = config.refreshToken;
    oauth2.setCredentials(credentials);
    return oauth2;
  }

  private async loadGoogleApis(): Promise<{ google: any } | null> {
    try {
      const importer = new Function('return import("googleapis")') as () => Promise<{ google: any }>;
      return await importer();
    } catch {
      return null;
    }
  }

  private resolveAccessToken(config: YouTubeAdapterOptions): string | null {
    return config.accessToken ?? null;
  }

  private async pollOnce(liveChatId: string): Promise<void> {
    if (!this.connected || this.mockMode || !this.client) return;

    const isHistory = this.isFirstPoll;
    this.isFirstPoll = false;

    try {
      const response = await this.client.listMessages({
        liveChatId,
        pageToken: this.nextPageToken,
      });

      this.nextPageToken = response.nextPageToken ?? null;
      this.currentPollingIntervalMillis = this.clampPollingInterval(
        response.pollingIntervalMillis ?? this.options.pollingIntervalMillis ?? DEFAULT_POLLING_INTERVAL_MILLIS,
      );
      this.emitApiResponse(response.items ?? [], isHistory);
      this.scheduleNextPoll(liveChatId, this.currentPollingIntervalMillis);
    } catch {
      this.scheduleNextPoll(liveChatId, this.clampPollingInterval(this.currentPollingIntervalMillis * 2));
    }
  }

  private scheduleNextPoll(liveChatId: string, delayMillis: number): void {
    if (!this.connected || this.mockMode) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);

    this.pollTimer = setTimeout(() => {
      void this.pollOnce(liveChatId);
    }, delayMillis);
  }

  private emitApiResponse(items: YouTubeMessagePart[], isHistory = false): void {
    for (const item of items) {
      const type = item.snippet?.type ?? '';
      if (type === 'textMessageEvent') {
        const message = this.toChatMessage(item);
        if (message) this.emitMessage(message, item.snippet?.publishedAt, isHistory);
        continue;
      }

      const event = this.toStreamEvent(item);
      if (event) this.emitEvent(event, item.snippet?.publishedAt);
    }
  }

  private toChatMessage(item: YouTubeMessagePart): Omit<ChatMessage, 'id' | 'timestampLabel'> | null {
    const snippet = item.snippet;
    const authorDetails = item.authorDetails;
    const content = snippet?.textMessageDetails?.messageText ?? snippet?.displayMessage ?? '';
    if (!content.trim()) return null;

    const role = this.resolveRole(authorDetails);
    return {
      platform: 'youtube',
      author: authorDetails?.displayName ?? this.options.mockAuthor ?? DEFAULT_MOCK_AUTHOR,
      content,
      badges: this.resolveBadges(authorDetails),
      role,
      unifiedLevel: resolveFromRole(role),
    };
  }

  private toStreamEvent(item: YouTubeMessagePart): Omit<StreamEvent, 'id' | 'timestampLabel'> | null {
    const snippet = item.snippet;
    const author = item.authorDetails?.displayName ?? this.options.mockAuthor ?? DEFAULT_MOCK_AUTHOR;
    const type = snippet?.type ?? '';

    if (type === 'superChatEvent' || type === 'superStickerEvent' || type === 'fanFundingEvent') {
      const stickerMessage = snippet?.superStickerDetails ? 'Super Sticker' : undefined;
      return {
        platform: 'youtube',
        type: 'superchat',
        author,
        amount: this.resolveMicros(snippet?.superChatDetails?.amountMicros)
          ?? this.resolveMicros(snippet?.superStickerDetails?.amountMicros)
          ?? 0,
        message: snippet?.superChatDetails?.userComment ?? stickerMessage,
      };
    }

    if (type === 'memberMilestoneEvent' || type === 'newSponsorEvent') {
      const details = snippet?.memberMilestoneChatDetails ?? snippet?.newSponsorDetails ?? {};
      return {
        platform: 'youtube',
        type: 'subscription',
        author,
        amount: details.memberMonth ?? 1,
        message: details.userComment ?? details.memberLevelName ?? (type === 'newSponsorEvent' ? 'New sponsor' : 'Member milestone'),
      };
    }

    return null;
  }

  private resolveBadges(authorDetails?: YouTubeMessagePart['authorDetails']): ChatMessage['badges'] {
    const badges: ChatMessage['badges'] = [];
    if (authorDetails?.isChatModerator || authorDetails?.isChatOwner) badges.push('moderator');
    if (authorDetails?.isChatMember || authorDetails?.isChatSponsor) badges.push('member');
    return badges;
  }

  private resolveRole(authorDetails?: YouTubeMessagePart['authorDetails']): PlatformRole {
    return {
      broadcaster: Boolean(authorDetails?.isChatOwner),
      moderator: Boolean(authorDetails?.isChatModerator),
      subscriber: Boolean(authorDetails?.isChatMember || authorDetails?.isChatSponsor),
    };
  }

  private resolveMicros(value: string | number | undefined): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value / 1_000_000);
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Math.round(Number(value) / 1_000_000);
    }
    return null;
  }

  private emitMessage(message: Omit<ChatMessage, 'id' | 'timestampLabel'>, timestampSource?: string, isHistory = false): void {
    const payload: ChatMessage = {
      id: this.buildId(),
      timestampLabel: this.formatTimestamp(timestampSource),
      ...message,
      ...(isHistory ? { isHistory: true } : {}),
    };

    for (const handler of this.messageHandlers) {
      handler(payload);
    }
  }

  private emitEvent(event: Omit<StreamEvent, 'id' | 'timestampLabel'>, timestampSource?: string): void {
    const payload: StreamEvent = {
      id: this.buildId(),
      timestampLabel: this.formatTimestamp(timestampSource),
      ...event,
    };

    for (const handler of this.eventHandlers) {
      handler(payload);
    }
  }

  private formatTimestamp(raw?: string): string {
    const date = raw ? new Date(raw) : new Date();
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private buildId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private clampPollingInterval(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return DEFAULT_POLLING_INTERVAL_MILLIS;
    return Math.min(Math.max(Math.round(value), DEFAULT_POLLING_INTERVAL_MILLIS), MAX_POLLING_INTERVAL_MILLIS);
  }
}

export function createYouTubeChatAdapter(options: YouTubeAdapterOptions = {}): YouTubeChatAdapter {
  return new YouTubeChatAdapter(options);
}
