import { createRequire } from 'node:module';
import type { ChatMessage, StreamEvent, StreamEventType, TikTokConnectionStatus } from '../../shared/types.js';
import type { PlatformChatAdapter } from '../base.js';

export interface TikTokAdapterOptions {
  username: string;
  signApiKey?: string;
  onStatusChange?: (status: TikTokConnectionStatus) => void;
  onError?: (error: unknown) => void;
}

type TikTokConnection = {
  connect: () => Promise<{ roomId: string }>;
  disconnect: () => Promise<void> | void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  fetchIsLive: () => Promise<boolean>;
};

export function createTikTokChatAdapter(options: TikTokAdapterOptions): TikTokChatAdapter {
  return new TikTokChatAdapter(options);
}

export class TikTokChatAdapter implements PlatformChatAdapter {
  readonly platform = 'tiktok' as const;

  private connection: TikTokConnection | null = null;
  private readonly messageHandlers = new Set<(message: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(event: StreamEvent) => void>();
  private connected = false;

  constructor(private readonly options: TikTokAdapterOptions) {}

  async connect(): Promise<void> {
    if (this.connected) return;

    this.options.onStatusChange?.('connecting');

    const conn = await this.createConnection();
    if (!conn) {
      this.options.onError?.(new Error('Failed to create TikTokLiveConnection'));
      this.options.onStatusChange?.('error');
      return;
    }

    this.connection = conn;
    this.attachListeners(conn);

    try {
      await conn.connect();
      this.connected = true;
      this.options.onStatusChange?.('connected');
    } catch (cause) {
      this.connected = false;
      this.connection = null;
      this.options.onError?.(cause);
      this.options.onStatusChange?.('error');
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;

    if (this.connection) {
      try {
        await this.connection.disconnect();
      } catch {
        // Best effort cleanup.
      }
    }

    this.connection = null;
    this.options.onStatusChange?.('disconnected');
  }

  async sendMessage(_content: string): Promise<void> {
    throw new Error('TikTok adapter does not support sending messages (requires browser session authentication)');
  }

  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onEvent(handler: (event: StreamEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  async fetchIsLive(): Promise<boolean> {
    const conn = await this.createConnection();
    if (!conn) return false;
    try {
      return await conn.fetchIsLive();
    } catch {
      return false;
    }
  }

  private async createConnection(): Promise<TikTokConnection | null> {
    try {
      const require = createRequire(import.meta.url);
      const module = require('tiktok-live-connector') as {
        TikTokLiveConnection?: new (username: string, options?: Record<string, unknown>) => TikTokConnection;
        default?: { TikTokLiveConnection?: new (username: string, options?: Record<string, unknown>) => TikTokConnection };
      };
      const ConnectionCtor = module.TikTokLiveConnection ?? module.default?.TikTokLiveConnection;
      if (typeof ConnectionCtor !== 'function') {
        this.options.onError?.(new Error('tiktok-live-connector did not export TikTokLiveConnection'));
        return null;
      }

      const connectionOptions: Record<string, unknown> = {
        enableExtendedGiftInfo: true,
        processInitialData: false,
        disableEulerFallbacks: !this.options.signApiKey,
      };

      if (this.options.signApiKey) {
        connectionOptions.signApiKey = this.options.signApiKey;
      }

      return new ConnectionCtor(this.options.username, connectionOptions);
    } catch (cause) {
      this.options.onError?.(cause);
      return null;
    }
  }

  private attachListeners(conn: TikTokConnection): void {
    // Chat messages
    conn.on('chat', (data: any) => {
      const message = this.buildChatMessage(data);
      if (message) this.emitMessage(message);
    });

    // Gift events
    conn.on('gift', (data: any) => {
      // Streak gifts: only process when streak ends (repeatEnd === true)
      // or for non-streakable gifts (giftType !== 1)
      if (data.giftType === 1 && !data.repeatEnd) return;

      const event = this.buildStreamEvent('gift', data, {
        amount: data.repeatCount ?? data.diamondCount ?? 1,
        message: data.giftName ? `${data.giftName} x${data.repeatCount ?? 1}` : undefined,
      });
      if (event) this.emitEvent(event);
    });

    // Follow events
    conn.on('follow', (data: any) => {
      const event = this.buildStreamEvent('follow', data);
      if (event) this.emitEvent(event);
    });

    // Subscribe events
    conn.on('subscribe', (data: any) => {
      const event = this.buildStreamEvent('subscription', data);
      if (event) this.emitEvent(event);
    });

    // Disconnection
    conn.on('disconnected', () => {
      if (this.connected) {
        this.connected = false;
        this.connection = null;
        this.options.onStatusChange?.('disconnected');
      }
    });

    // Stream end
    conn.on('streamEnd', () => {
      if (this.connected) {
        this.connected = false;
        this.connection = null;
        this.options.onStatusChange?.('disconnected');
      }
    });

    // Error
    conn.on('error', (cause: unknown) => {
      this.options.onError?.(cause);
      // Don't disconnect on transient errors — only update status if fatal
    });
  }

  private buildChatMessage(data: any): ChatMessage | null {
    const author = data.uniqueId ?? data.user?.uniqueId ?? data.nickname ?? '';
    const content = data.comment ?? data.message ?? '';
    if (!author || !content) return null;

    const badges: string[] = [];
    if (data.isModerator) badges.push('moderator');
    if (data.isSubscriber) badges.push('subscriber');

    return {
      id: `tiktok-${data.msgId ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      platform: 'tiktok',
      author,
      content,
      badges,
      timestampLabel: this.formatTimestamp(),
      avatarUrl: data.profilePictureUrl ?? data.user?.profilePictureUrl ?? undefined,
    };
  }

  private buildStreamEvent(type: StreamEventType, data: any, extra?: { amount?: number; message?: string }): StreamEvent | null {
    const author = data.uniqueId ?? data.user?.uniqueId ?? data.nickname ?? 'TikTok user';

    return {
      id: `tiktok-event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      platform: 'tiktok',
      type,
      author,
      amount: extra?.amount,
      message: extra?.message,
      timestampLabel: this.formatTimestamp(),
    };
  }

  private formatTimestamp(): string {
    return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date());
  }

  private emitMessage(message: ChatMessage): void {
    for (const handler of this.messageHandlers) {
      try { handler(message); } catch { /* ignore */ }
    }
  }

  private emitEvent(event: StreamEvent): void {
    for (const handler of this.eventHandlers) {
      try { handler(event); } catch { /* ignore */ }
    }
  }
}
