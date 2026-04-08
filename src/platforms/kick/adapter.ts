import type { ChatBadge, ChatMessage, StreamEvent } from '../../shared/types.js';
import type { PlatformChatAdapter } from '../base.js';

type KickPayloadRecord = Record<string, unknown>;
type PusherRuntime = {
  subscribe: (channelName: string) => SubscribedChannelHandle;
  unsubscribe: (channelName: string) => void;
  disconnect: () => void;
};

export interface KickChatAdapterOptions {
  channelSlug?: string;
  chatroomId?: number | string;
  apiBaseUrl?: string;
  pusherAppKey?: string;
  pusherCluster?: string;
  fetchFn?: typeof fetch;
}

interface KickUserPayload {
  username?: string;
  role?: string | null;
  verified?: boolean;
  is_subscribed?: boolean;
  months_subscribed?: number | null;
  follower_badges?: unknown[];
  profile_picture?: string | null;
}

interface KickMessagePayload {
  id?: string | number;
  message?: string;
  content?: string;
  created_at?: number | string | null;
  chatroom_id?: string | number | null;
  type?: string | null;
  action?: string | null;
  optional_message?: string | null;
  replied_to?: unknown;
}

interface KickChatEventPayload {
  message?: KickMessagePayload;
  user?: KickUserPayload;
  sender?: KickUserPayload;
  broadcaster?: KickUserPayload;
  data?: KickChatEventPayload;
}

interface SubscribedChannel {
  name: string;
  channel: SubscribedChannelHandle;
}

interface SubscribedChannelHandle {
  bind_global?: (handler: (eventName: string, data: unknown) => void) => void;
  bind: (eventName: string, handler: (data: unknown) => void) => void;
  unbind_global?: () => void;
  unbind?: (eventName?: string) => void;
}

const DEFAULT_PUSHER_APP_KEY = '32cbd69e4b950bf97679';
const DEFAULT_PUSHER_CLUSTER = 'us2';
const DEFAULT_API_BASE_URL = 'https://kick.com/api/v2';

export class KickChatAdapter implements PlatformChatAdapter {
  readonly platform = 'kick' as const;

  private pusher: PusherRuntime | null = null;
  private readonly subscribedChannels: SubscribedChannel[] = [];
  private readonly messageHandlers = new Set<(message: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(event: StreamEvent) => void>();
  private readonly seenMessageKeys = new Set<string>();
  private chatroomId: number | null = null;
  private connected = false;

  constructor(private readonly options: KickChatAdapterOptions = {}) {}

  async connect(): Promise<void> {
    if (this.connected) return;

    const chatroomId = await this.resolveChatroomId();
    if (!chatroomId) {
      return;
    }

    this.chatroomId = chatroomId;
    this.pusher = await this.createPusherClient();
    if (!this.pusher) {
      return;
    }

    for (const channelName of this.getChannelNames(chatroomId)) {
      const subscribedChannel = this.pusher.subscribe(channelName);
      subscribedChannel.bind_global?.((eventName: string, data: unknown) =>
        this.handleChannelEvent(channelName, eventName, data),
      );
      subscribedChannel.bind('App\\Events\\ChatMessageSentEvent', (data: unknown) =>
        this.handleChannelEvent(channelName, 'App\\Events\\ChatMessageSentEvent', data),
      );
      subscribedChannel.bind('ChatMessageSentEvent', (data: unknown) =>
        this.handleChannelEvent(channelName, 'ChatMessageSentEvent', data),
      );
      subscribedChannel.bind('chat.message.sent', (data: unknown) =>
        this.handleChannelEvent(channelName, 'chat.message.sent', data),
      );
      this.subscribedChannels.push({ name: channelName, channel: subscribedChannel });
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.chatroomId = null;
    this.seenMessageKeys.clear();

    for (const { channel, name } of this.subscribedChannels.splice(0)) {
      try {
        channel.unbind_global?.();
        channel.unbind?.('App\\Events\\ChatMessageSentEvent');
        channel.unbind?.('ChatMessageSentEvent');
        channel.unbind?.('chat.message.sent');
        this.pusher?.unsubscribe(name);
      } catch {
        // Best effort cleanup.
      }
    }

    this.pusher?.disconnect();
    this.pusher = null;
  }

  async sendMessage(_content: string): Promise<void> {
    throw new Error('Kick adapter sendMessage is not implemented yet');
  }

  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onEvent(handler: (event: StreamEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private async createPusherClient(): Promise<PusherRuntime | null> {
    try {
      const importer = new Function('return import("pusher-js")') as () => Promise<{
        default?: new (key: string, options: Record<string, unknown>) => PusherRuntime;
      }>;
      const module = await importer();
      const PusherCtor = module.default;
      if (typeof PusherCtor !== 'function') return null;
      return new PusherCtor(this.options.pusherAppKey ?? DEFAULT_PUSHER_APP_KEY, {
        cluster: this.options.pusherCluster ?? DEFAULT_PUSHER_CLUSTER,
        forceTLS: true,
        enableStats: false,
      });
    } catch {
      return null;
    }
  }

  private async resolveChatroomId(): Promise<number | null> {
    if (this.chatroomId !== null) return this.chatroomId;
    if (this.options.chatroomId !== undefined) {
      const parsed = Number(this.options.chatroomId);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (!this.options.channelSlug) return null;

    const fetchFn = this.options.fetchFn ?? fetch;
    const response = await fetchFn(`${this.options.apiBaseUrl ?? DEFAULT_API_BASE_URL}/channels/${encodeURIComponent(this.options.channelSlug)}/chatroom`, {
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as KickPayloadRecord;
    const candidates = [
      payload.id,
      payload.chatroom_id,
      payload.chatroomId,
      payload?.data && typeof payload.data === 'object' ? (payload.data as KickPayloadRecord).id : undefined,
      payload?.data && typeof payload.data === 'object' ? (payload.data as KickPayloadRecord).chatroom_id : undefined,
    ];

    for (const candidate of candidates) {
      const parsed = this.parseNumericId(candidate);
      if (parsed !== null) return parsed;
    }

    return null;
  }

  private getChannelNames(chatroomId: number): string[] {
    const base = String(chatroomId);
    return [`chatrooms.${base}.v2`, `chatroom_${base}`, `chatrooms.${base}`];
  }

  private handleChannelEvent(channelName: string, eventName: string, rawData: unknown): void {
    if (eventName.startsWith('pusher:') || eventName.startsWith('pusher_internal:')) {
      return;
    }

    const payload = this.unwrapPayload(rawData);
    const message = this.buildChatMessage(channelName, eventName, payload);
    if (message) {
      const messageKey = message.id ?? `${message.author}:${message.content}:${message.timestampLabel}`;
      if (this.seenMessageKeys.has(messageKey)) return;
      this.seenMessageKeys.add(messageKey);
      this.emitMessage(message);
      return;
    }

    const event = this.buildStreamEvent(channelName, eventName, payload);
    if (event) {
      this.emitEvent(event);
    }
  }

  private buildChatMessage(channelName: string, eventName: string, payload: KickPayloadRecord): ChatMessage | null {
    const eventPayload = this.extractChatEventPayload(payload);
    const messagePayload = this.getObject(payload.message ?? eventPayload.message ?? payload);
    const userPayload = this.getObject(payload.user ?? payload.sender ?? eventPayload.user ?? eventPayload.sender ?? eventPayload.broadcaster);

    const content = this.extractMessageText(messagePayload, payload, eventPayload);
    if (!content.trim()) return null;

    const author = this.extractAuthor(userPayload);
    const timestamp = this.extractTimestamp(messagePayload, payload);
    const badges = this.extractBadges(userPayload);
    const id = this.extractMessageId(messagePayload, payload, channelName, eventName, author, content, timestamp);

    return {
      id,
      platform: 'kick',
      author,
      content,
      badges,
      timestampLabel: this.formatTimestamp(timestamp),
    };
  }

  private buildStreamEvent(_channelName: string, eventName: string, payload: KickPayloadRecord): StreamEvent | null {
    const eventType = this.mapEventType(eventName, payload);
    if (!eventType) return null;

    const author = this.extractAuthor(this.getObject(payload.user ?? payload.sender ?? payload.broadcaster));
    const timestamp = this.extractTimestamp(this.getObject(payload.message ?? payload), payload);
    const amount = this.extractAmount(payload);
    const message = this.extractMessageText(this.getObject(payload.message ?? payload), payload, this.extractChatEventPayload(payload));

    return {
      id: this.extractMessageId(this.getObject(payload.message ?? payload), payload, eventName, eventType, author, message, timestamp),
      platform: 'kick',
      type: eventType,
      author,
      amount,
      message: message || undefined,
      timestampLabel: this.formatTimestamp(timestamp),
    };
  }

  private mapEventType(eventName: string, payload: KickPayloadRecord): StreamEvent['type'] | null {
    const normalized = eventName.toLowerCase();
    const typeValue = typeof payload.type === 'string' ? payload.type.toLowerCase() : '';
    const actionValue = typeof payload.action === 'string' ? payload.action.toLowerCase() : '';

    if (normalized.includes('follow') || typeValue.includes('follow')) return 'follow';
    if (normalized.includes('gift') || typeValue.includes('gift')) return 'gift';
    if (normalized.includes('subscription') || typeValue.includes('subscription') || actionValue.includes('sub')) return 'subscription';
    if (normalized.includes('raid') || typeValue.includes('raid')) return 'raid';
    if (normalized.includes('cheer') || typeValue.includes('cheer') || normalized.includes('bit')) return 'cheer';
    if (normalized.includes('superchat') || normalized.includes('super_chat') || typeValue.includes('superchat')) return 'superchat';

    return null;
  }

  private extractChatEventPayload(payload: KickPayloadRecord): KickChatEventPayload {
    const nested = this.getObject(payload.data);
    return {
      message: this.getObject(nested.message ?? payload.message) as KickMessagePayload | undefined,
      user: this.getObject(nested.user ?? payload.user) as KickUserPayload | undefined,
      sender: this.getObject(nested.sender ?? payload.sender) as KickUserPayload | undefined,
      broadcaster: this.getObject(nested.broadcaster ?? payload.broadcaster) as KickUserPayload | undefined,
      data: nested as KickChatEventPayload | undefined,
    };
  }

  private extractAuthor(userPayload: KickPayloadRecord): string {
    const username = userPayload.username;
    if (typeof username === 'string' && username.trim()) return username.trim();
    return 'Kick user';
  }

  private extractMessageText(messagePayload: KickPayloadRecord, payload: KickPayloadRecord, eventPayload: KickChatEventPayload): string {
    const candidates = [
      messagePayload.message,
      messagePayload.content,
      payload.message,
      payload.content,
      eventPayload?.message && typeof eventPayload.message.message === 'string' ? eventPayload.message.message : undefined,
      payload.optional_message,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return '';
  }

  private extractBadges(userPayload: KickPayloadRecord): ChatBadge[] {
    const badges: ChatBadge[] = [];
    const role = typeof userPayload.role === 'string' ? userPayload.role.toLowerCase() : '';
    const isSubscribed = userPayload.is_subscribed === true || (typeof userPayload.months_subscribed === 'number' && userPayload.months_subscribed > 0);
    const hasFollowerBadge = Array.isArray(userPayload.follower_badges) && userPayload.follower_badges.length > 0;

    if (role.includes('mod')) badges.push('moderator');
    if (role.includes('broadcaster')) {
      badges.push('subscriber');
    } else if (isSubscribed || hasFollowerBadge) {
      badges.push('subscriber');
    }

    return [...new Set(badges)];
  }

  private extractTimestamp(messagePayload: KickPayloadRecord, payload: KickPayloadRecord): Date {
    const raw = messagePayload.created_at ?? payload.created_at ?? payload.timestamp;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return new Date(raw < 1_000_000_000_000 ? raw * 1000 : raw);
    }
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return new Date(parsed < 1_000_000_000_000 ? parsed * 1000 : parsed);
      }
      const asDate = new Date(raw);
      if (!Number.isNaN(asDate.getTime())) return asDate;
    }
    return new Date();
  }

  private extractAmount(payload: KickPayloadRecord): number | undefined {
    const candidates = [
      payload.amount,
      payload.bits,
      payload.total,
      payload.value,
      payload.message && typeof payload.message === 'object' ? (payload.message as KickPayloadRecord).amount : undefined,
    ];

    for (const candidate of candidates) {
      const parsed = this.parseNumericId(candidate);
      if (parsed !== null) return parsed;
    }
    return undefined;
  }

  private extractMessageId(
    messagePayload: KickPayloadRecord,
    payload: KickPayloadRecord,
    scopeA: string,
    scopeB: string,
    author: string,
    content: string,
    timestamp: Date,
  ): string {
    const candidates = [
      messagePayload.id,
      payload.message_id,
      payload.id,
      payload.uuid,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
    }

    return `${scopeA}:${scopeB}:${author}:${content}:${timestamp.getTime()}`;
  }

  private emitMessage(message: ChatMessage): void {
    for (const handler of this.messageHandlers) {
      handler(message);
    }
  }

  private emitEvent(event: StreamEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  private unwrapPayload(rawData: unknown): KickPayloadRecord {
    if (typeof rawData !== 'object' || rawData === null) return {};
    const record = rawData as KickPayloadRecord;
    return this.getObject(record.data ?? record);
  }

  private getObject(value: unknown): KickPayloadRecord {
    return typeof value === 'object' && value !== null ? (value as KickPayloadRecord) : {};
  }

  private parseNumericId(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private formatTimestamp(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

export function createKickChatAdapter(options: KickChatAdapterOptions = {}): KickChatAdapter {
  return new KickChatAdapter(options);
}
