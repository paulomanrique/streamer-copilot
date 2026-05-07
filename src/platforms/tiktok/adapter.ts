import { createRequire } from 'node:module';

import type { ChatBadge, ChatMessage, StreamEvent, TikTokConnectionStatus } from '../../shared/types.js';
import type { PlatformRole } from '../../shared/platform.js';
import type { PlatformCapabilities } from '../../shared/moderation.js';
import { resolveFromRole } from '../../modules/commands/permission-utils.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';

// ─── Lib types (shape we depend on, kept loose to avoid hard-coupling) ─────

interface TikTokUser {
  uniqueId?: string;
  nickname?: string;
  profilePicture?: { urls?: string[] } | undefined;
  profilePictureMedium?: { urls?: string[] } | undefined;
}

interface TikTokUserIdentity {
  isSubscriberOfAnchor?: boolean;
  isModeratorOfAnchor?: boolean;
  isFollowerOfAnchor?: boolean;
  isMutualFollowingWithAnchor?: boolean;
  isAnchor?: boolean;
}

interface TikTokChatPayload {
  user?: TikTokUser;
  comment?: string;
  userIdentity?: TikTokUserIdentity;
  common?: { msgId?: string };
}

interface TikTokGiftPayload {
  user?: TikTokUser;
  giftId?: number;
  giftDetails?: { giftName?: string; diamondCount?: number };
  repeatCount?: number;
  repeatEnd?: number;
  common?: { msgId?: string };
}

interface TikTokSocialPayload {
  user?: TikTokUser;
  common?: { msgId?: string };
}

interface TikTokMemberPayload {
  user?: TikTokUser;
  common?: { msgId?: string };
}

interface TikTokRoomUserPayload {
  totalUser?: number;
  total?: number;
}

interface TikTokConnectionLike {
  connect(): Promise<unknown>;
  disconnect(): Promise<unknown> | unknown;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface TikTokModule {
  TikTokLiveConnection: new (uniqueId: string, options?: Record<string, unknown>) => TikTokConnectionLike;
  WebcastEvent?: Record<string, string>;
  ConnectState?: Record<string, string>;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

export interface TikTokAdapterOptions {
  username: string;
  onStatusChange?: (status: TikTokConnectionStatus) => void;
  onError?: (error: unknown) => void;
  onLiveStats?: (stats: { viewerCount: number }) => void;
  onCaptchaDetected?: () => void;
}

export function createTikTokChatAdapter(options: TikTokAdapterOptions): TikTokChatAdapter {
  return new TikTokChatAdapter(options);
}

export class TikTokChatAdapter implements PlatformChatAdapter {
  readonly platform = 'tiktok' as const;
  readonly capabilities: PlatformCapabilities = READ_ONLY_CAPABILITIES;

  private connection: TikTokConnectionLike | null = null;
  private connected = false;
  private readonly messageHandlers = new Set<(msg: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(ev: StreamEvent) => void>();

  constructor(private readonly options: TikTokAdapterOptions) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    this.options.onStatusChange?.('connecting');
    try {
      const requireFn = createRequire(import.meta.url);
      const lib = requireFn('tiktok-live-connector') as TikTokModule;
      this.connection = new lib.TikTokLiveConnection(this.options.username, {
        enableExtendedGiftInfo: true,
      });
      this.attachListeners(this.connection, lib.WebcastEvent ?? DEFAULT_EVENT_NAMES);
      await this.connection.connect();
      this.connected = true;
      this.options.onStatusChange?.('connected');
    } catch (cause) {
      this.connected = false;
      this.options.onError?.(cause);
      this.options.onStatusChange?.('error');
      throw cause;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.connection) {
      try { await this.connection.disconnect(); } catch { /* ignore */ }
      this.connection = null;
    }
    this.options.onStatusChange?.('disconnected');
  }

  async sendMessage(_content: string): Promise<void> {
    throw new Error('TikTok does not support sending messages from this adapter (read-only)');
  }

  onMessage(handler: (msg: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onEvent(handler: (ev: StreamEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  async fetchIsLive(): Promise<boolean> {
    // The new lib resolves room info on connect; if connect succeeds the user is live.
    return this.connected;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private attachListeners(connection: TikTokConnectionLike, events: Record<string, string>): void {
    const ev = (key: string, fallback: string) => events[key] ?? fallback;

    connection.on(ev('CHAT', 'chat'), (...args: unknown[]) => {
      const payload = args[0] as TikTokChatPayload | undefined;
      if (!payload?.comment) return;
      const author = resolveAuthor(payload.user);
      if (!author) return;
      const role = roleFromIdentity(payload.userIdentity);
      this.emitMsg({
        id: `tiktok-${payload.common?.msgId ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        platform: 'tiktok',
        author,
        content: payload.comment,
        badges: badgesFromRole(role),
        timestampLabel: ts(),
        avatarUrl: avatarUrlFor(payload.user),
        role,
        unifiedLevel: resolveFromRole(role),
        ...(payload.user?.uniqueId ? { userId: payload.user.uniqueId } : {}),
      });
    });

    connection.on(ev('GIFT', 'gift'), (...args: unknown[]) => {
      const payload = args[0] as TikTokGiftPayload | undefined;
      if (!payload?.user) return;
      // Streak-gift: only emit when streak ends; one-shot gifts (giftType !== 1) emit immediately.
      const giftType = payload.giftDetails ? 1 : 0; // crude — lib already aggregates streaks via repeatEnd
      if (giftType === 1 && !payload.repeatEnd) return;
      const author = resolveAuthor(payload.user) ?? 'TikTok user';
      this.emitEv({
        id: `tiktok-ev-${payload.common?.msgId ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        platform: 'tiktok',
        type: 'gift',
        author,
        amount: payload.repeatCount || payload.giftDetails?.diamondCount || 1,
        message: payload.giftDetails?.giftName
          ? `${payload.giftDetails.giftName} x${payload.repeatCount ?? 1}`
          : undefined,
        timestampLabel: ts(),
      });
    });

    connection.on(ev('FOLLOW', 'follow'), (...args: unknown[]) => {
      const payload = args[0] as TikTokSocialPayload | undefined;
      const author = resolveAuthor(payload?.user) ?? 'TikTok user';
      this.emitEv({
        id: `tiktok-ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        platform: 'tiktok',
        type: 'follow',
        author,
        timestampLabel: ts(),
      });
    });

    connection.on(ev('SHARE', 'share'), (...args: unknown[]) => {
      const payload = args[0] as TikTokSocialPayload | undefined;
      const author = resolveAuthor(payload?.user) ?? 'TikTok user';
      this.emitEv({
        id: `tiktok-ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        platform: 'tiktok',
        type: 'follow', // closest enum we have for "engagement"
        author,
        message: 'shared the live',
        timestampLabel: ts(),
      });
    });

    connection.on(ev('MEMBER', 'member'), (...args: unknown[]) => {
      const payload = args[0] as TikTokMemberPayload | undefined;
      // MEMBER fires when a viewer joins — not a subscription. WelcomeService
      // can pick this up from the message stream when needed; nothing to emit.
      void payload;
    });

    connection.on(ev('ROOM_USER', 'roomUser'), (...args: unknown[]) => {
      const payload = args[0] as TikTokRoomUserPayload | undefined;
      const viewerCount = payload?.totalUser ?? payload?.total ?? 0;
      if (viewerCount > 0) this.options.onLiveStats?.({ viewerCount });
    });

    connection.on(ev('STREAM_END', 'streamEnd'), () => {
      this.connected = false;
      this.options.onStatusChange?.('disconnected');
    });
  }

  private emitMsg(msg: ChatMessage): void {
    for (const h of this.messageHandlers) { try { h(msg); } catch { /* ignore */ } }
  }

  private emitEv(ev: StreamEvent): void {
    for (const h of this.eventHandlers) { try { h(ev); } catch { /* ignore */ } }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const DEFAULT_EVENT_NAMES: Record<string, string> = {
  CHAT: 'chat', GIFT: 'gift', FOLLOW: 'follow', SHARE: 'share',
  MEMBER: 'member', ROOM_USER: 'roomUser', STREAM_END: 'streamEnd',
};

function resolveAuthor(user?: TikTokUser): string | null {
  if (!user) return null;
  return user.uniqueId || user.nickname || null;
}

function avatarUrlFor(user?: TikTokUser): string | undefined {
  return user?.profilePictureMedium?.urls?.[0] ?? user?.profilePicture?.urls?.[0];
}

function roleFromIdentity(identity?: TikTokUserIdentity): PlatformRole {
  const extras: Record<string, unknown> = {};
  if (identity?.isMutualFollowingWithAnchor) extras.friend = true;
  return {
    broadcaster: Boolean(identity?.isAnchor),
    moderator: Boolean(identity?.isModeratorOfAnchor),
    subscriber: Boolean(identity?.isSubscriberOfAnchor),
    follower: Boolean(identity?.isFollowerOfAnchor),
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  };
}

function badgesFromRole(role: PlatformRole): ChatBadge[] {
  const badges: ChatBadge[] = [];
  if (role.moderator) badges.push('moderator');
  if (role.subscriber) badges.push('subscriber');
  return badges;
}

function ts(): string {
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}
