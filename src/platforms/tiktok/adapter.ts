import { createRequire } from 'node:module';

import type { ChatBadge, ChatMessage, ChatMessageContentPart, StreamEvent, TikTokConnectionStatus } from '../../shared/types.js';
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
  /** TikTok ships subscriber/custom emojis as a parallel array — `comment`
   *  keeps the literal shortcodes (e.g. "[laughcry]") and `emotes` carries
   *  the image URL to render in their place. Without this, the renderer
   *  shows raw bracket text. */
  emotes?: TikTokEmoteRef[];
}

interface TikTokEmoteRef {
  placeInComment?: number;
  emote?: { emoteId?: string; image?: { imageUrl?: string } };
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
        // `enableExtendedGiftInfo` makes the lib hit TikTok's gift-catalog
        // endpoint during connect; that endpoint returns 403 in many regions
        // and on rate-limit, blocking the entire connect. Gift events still
        // include the inline `giftDetails` payload, which is what we display.
        enableExtendedGiftInfo: false,
      });
      this.attachListeners(this.connection, lib.WebcastEvent ?? DEFAULT_EVENT_NAMES);
      await this.connection.connect();
      this.connected = true;
      this.options.onStatusChange?.('connected');
    } catch (cause) {
      this.connected = false;
      this.options.onError?.(cause);
      this.options.onStatusChange?.('error');
      // The lib often throws Errors with empty messages when fetchRoomId
      // fails (typo, banned account, or — most commonly — the user is not
      // currently live). Surface a clearer hint instead of bubbling up a
      // bare "Error".
      const stack = cause instanceof Error ? cause.stack ?? '' : '';
      const message = cause instanceof Error ? cause.message?.trim() ?? '' : '';
      if (!message && stack.includes('fetchRoomId')) {
        throw new Error(
          `TikTok room not found for "${this.options.username}". Make sure the user is currently live and the handle is correct (no @, no URL).`,
        );
      }
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

    // Per-stream label so the chat feed and activity log can disambiguate
    // multi-account TikTok setups. There's only one host per adapter, so
    // every emit gets the same label.
    const streamLabel = this.options.username || undefined;

    connection.on(ev('CHAT', 'chat'), (...args: unknown[]) => {
      const payload = args[0] as TikTokChatPayload | undefined;
      if (!payload?.comment) return;
      const author = resolveAuthor(payload.user);
      if (!author) return;
      const role = roleFromIdentity(payload.userIdentity);
      const contentParts = buildContentParts(payload.comment, payload.emotes);
      this.emitMsg({
        id: `tiktok-${payload.common?.msgId ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        platform: 'tiktok',
        author,
        content: payload.comment,
        ...(contentParts ? { contentParts } : {}),
        badges: badgesFromRole(role),
        timestampLabel: ts(),
        avatarUrl: avatarUrlFor(payload.user),
        role,
        unifiedLevel: resolveFromRole(role),
        streamLabel,
        // Routes the chat-log session to this TikTok host.
        channelId: streamLabel,
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
        streamLabel,
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
        streamLabel,
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
        streamLabel,
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

/**
 * TikTok renders its built-in emojis (the ones every viewer can use:
 * [laughcry], [heart], [rose], etc.) client-side from a known table —
 * the server only ships the literal shortcode in `comment`, never an
 * image URL in `emotes`. The map below covers the ~80 stock shortcodes
 * with their closest Unicode equivalents, so we can substitute them
 * inline without depending on TikTok's CDN.
 *
 * Subscriber/custom emojis still come through the `emotes` array with
 * a real `imageUrl` — those are handled in the emotes branch of
 * `buildContentParts` and take priority over this table.
 */
const TIKTOK_BUILTIN_EMOJI: Record<string, string> = {
  smile: '😊', happy: '😊', smileface: '😀', joyful: '😄', laugh: '😄',
  laughcry: '😂', hehe: '😁', blink: '😉', smileeyes: '😌', proud: '😎',
  cool: '😎', funnyface: '😜', evil: '😈', angel: '😇', witty: '😏',
  loveface: '🥰', lovely: '🥰', heart: '❤️', kiss: '😚', poh: '😘',
  yummy: '😋', drool: '🤤', greedy: '🤑', excited: '🤩', wow: '😮',
  shock: '😱', scream: '😱', astonish: '😲', stun: '😵', speechless: '😐',
  confused: '😕', embarrassed: '😅', sweat: '😓', thinking: '🤔',
  sad: '😞', tears: '😢', cry: '😭', angry: '😠', rage: '😡',
  sleep: '😴', nap: '😪', dizzy: '😵', sick: '🤢', vomit: '🤮',
  fever: '🤒', hurt: '🤕', mask: '😷', nerd: '🤓', monocle: '🧐',
  cowboy: '🤠', clown: '🤡', party: '🥳', hot: '🥵', cold: '🥶',
  pleading: '🥺', hush: '🤫', zip: '🤐', shh: '🤫', yawn: '🥱',
  hi: '👋', wave: '👋', thumbsup: '👍', thumbsdown: '👎', clap: '👏',
  ok: '👌', pray: '🙏', muscle: '💪', rose: '🌹', flower: '🌸',
  fire: '🔥', star: '⭐', sparkles: '✨', sun: '☀️', moon: '🌙',
  cake: '🎂', gift: '🎁', balloon: '🎈', music: '🎵', notes: '🎶',
  rocket: '🚀', cool2: '😎', kissing: '😘', wink: '😉', tongue: '😛',
  innocent: '😇', smirk: '😏', sunglasses: '😎',
};

/**
 * Turn TikTok's parallel (comment, emotes) channels into the unified
 * `ChatMessageContentPart[]` the chat overlay + ChatFeed already render
 * (chatOverlayJs's appendContent / ChatFeed's renderMessageContent).
 *
 * Two emoji sources to merge:
 *   1. `emotes` array — subscriber/custom emotes from the live, each with
 *      a real `imageUrl` we can render as an <img>.
 *   2. `TIKTOK_BUILTIN_EMOJI` — built-in stock emojis the server only
 *      references by shortcode (no URL); we substitute Unicode.
 *
 * Walk the comment scanning every `[name]` run; the Nth bracketed run
 * pulls the Nth entry from `emotes` if present and gives it priority,
 * otherwise we try the built-in map, otherwise we keep the literal text.
 *
 * Returns null when the comment carries no brackets — the renderer then
 * falls back to plain `content` and behaves exactly as before.
 */
function buildContentParts(
  comment: string | undefined,
  emotes: TikTokEmoteRef[] | undefined,
): ChatMessageContentPart[] | null {
  if (!comment) return null;
  const parts: ChatMessageContentPart[] = [];
  const regex = /\[([^\]\s]+)\]/g;
  const emoteList = emotes ?? [];
  let lastIndex = 0;
  let emoteIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(comment)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: comment.slice(lastIndex, match.index) });
    }
    const name = match[1];
    const ref = emoteList[emoteIdx];
    const imageUrl = ref?.emote?.image?.imageUrl;
    if (imageUrl) {
      parts.push({ type: 'emote', name, imageUrl });
      emoteIdx += 1;
    } else {
      const unicode = TIKTOK_BUILTIN_EMOJI[name.toLowerCase()];
      if (unicode) {
        parts.push({ type: 'text', text: unicode });
      } else {
        // Unknown shortcode — keep the bracket text intact so nothing
        // silently vanishes.
        parts.push({ type: 'text', text: match[0] });
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex === 0) return null; // no shortcodes found; nothing to enrich
  if (lastIndex < comment.length) {
    parts.push({ type: 'text', text: comment.slice(lastIndex) });
  }
  return parts;
}
