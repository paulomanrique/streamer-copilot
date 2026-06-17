import type { ChatBadge, ChatMessage, PlatformLinkStatus, StreamEvent } from '../../shared/types.js';
import type { PlatformRole } from '../../shared/platform.js';
import type { PlatformCapabilities } from '../../shared/moderation.js';
import { resolveFromRole } from '../../modules/commands/permission-utils.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';
import {
  activateGuestToken,
  bootstrapChat,
  connectLiveChat,
  fetchHistory,
  normalizeHandle,
  parseBroadcastId,
  resolveLiveBroadcastId,
  type XChatBootstrap,
  type XChatMessage,
} from './x-chat-client.js';

export interface XAdapterOptions {
  /** Streamer's @handle (used for auto-detect + the per-stream label). */
  handle: string;
  /** Optional pasted broadcast URL/id — the reliable fallback when auto-detect
   *  can't resolve the live broadcast from the handle. */
  broadcastUrl?: string;
  onStatusChange?: (status: PlatformLinkStatus) => void;
  onError?: (error: unknown) => void;
  onLiveStats?: (stats: { viewerCount: number }) => void;
  log?: (msg: string) => void;
}

/**
 * Read-only adapter for X (Twitter) broadcast chat. One adapter = one broadcast.
 * `connect()` resolves the live broadcast (auto-detect from handle, else the
 * pasted URL), loads history, and opens the live WebSocket. It throws when no
 * live broadcast can be resolved — the host's watching/retry loop (app-context)
 * keeps trying until the streamer goes live, mirroring the TikTok adapter.
 */
export class XChatAdapter implements PlatformChatAdapter {
  readonly platform = 'x' as const;
  readonly capabilities: PlatformCapabilities = READ_ONLY_CAPABILITIES;

  private connected = false;
  private stopLive: (() => void) | null = null;
  private bootstrap: XChatBootstrap | null = null;
  private readonly messageHandlers = new Set<(msg: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(ev: StreamEvent) => void>();

  constructor(private readonly options: XAdapterOptions) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    this.options.onStatusChange?.('connecting');
    try {
      const guestToken = await activateGuestToken();
      const broadcastId =
        (await resolveLiveBroadcastId(this.options.handle, guestToken, this.options.log))
        ?? parseBroadcastId(this.options.broadcastUrl);
      if (!broadcastId) {
        throw new Error(
          `X broadcast not found for "@${normalizeHandle(this.options.handle)}". The user must be live, or paste the broadcast URL.`,
        );
      }

      const bootstrap = await bootstrapChat(broadcastId, guestToken);
      this.bootstrap = bootstrap;
      // The live + viewer count work for any public broadcast, but anonymous
      // guests can only read the chat when it's public. Surface friends-only /
      // restricted chats explicitly so an empty feed isn't a silent mystery.
      if (!bootstrap.chatReadable) {
        this.options.log?.(
          `X broadcast for "@${normalizeHandle(this.options.handle)}" is live, but its chat is restricted ` +
          `(${bootstrap.chatPermissionType ?? 'non-public'}) — messages can't be read anonymously. ` +
          `Live status and viewer count still work.`,
        );
      }
      const streamLabel = normalizeHandle(this.options.handle) || bootstrap.host || undefined;
      const hostLower = bootstrap.host?.toLowerCase() ?? null;

      // Backfill recent history so the feed isn't empty on connect.
      try {
        const history = await fetchHistory(bootstrap);
        for (const msg of history) this.emitMsg(this.toChatMessage(msg, bootstrap, streamLabel, hostLower, true));
      } catch (cause) {
        this.options.log?.(`X history fetch failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }

      this.stopLive = connectLiveChat(
        bootstrap,
        (msg) => this.emitMsg(this.toChatMessage(msg, bootstrap, streamLabel, hostLower, false)),
        (err) => this.options.onError?.(err),
        () => {
          // Broadcast ended / socket closed.
          this.connected = false;
          this.options.onStatusChange?.('disconnected');
        },
      );

      this.connected = true;
      this.options.onLiveStats?.({ viewerCount: bootstrap.viewerCount });
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
    if (this.stopLive) {
      try { this.stopLive(); } catch { /* ignore */ }
      this.stopLive = null;
    }
    this.bootstrap = null;
    this.options.onStatusChange?.('disconnected');
  }

  async sendMessage(_content: string): Promise<void> {
    throw new Error('X broadcast chat is read-only — sending is not supported');
  }

  onMessage(handler: (msg: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onEvent(handler: (ev: StreamEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private toChatMessage(
    msg: XChatMessage,
    bootstrap: XChatBootstrap,
    streamLabel: string | undefined,
    hostLower: string | null,
    isHistory: boolean,
  ): ChatMessage {
    const isBroadcaster = hostLower !== null && msg.username.toLowerCase() === hostLower;
    const role: PlatformRole = { broadcaster: isBroadcaster };
    const badges: ChatBadge[] = isBroadcaster ? ['broadcaster'] : [];
    return {
      id: `x-${msg.uuid}`,
      platform: 'x',
      author: msg.displayName || msg.username,
      content: msg.text,
      badges,
      timestampLabel: tsFromMs(msg.timestampMs),
      role,
      unifiedLevel: resolveFromRole(role),
      streamLabel,
      // Routes the chat-log session to this broadcast.
      channelId: bootstrap.broadcastId,
      userId: msg.username,
      ...(isHistory ? { isHistory: true } : {}),
    };
  }

  private emitMsg(msg: ChatMessage): void {
    for (const h of this.messageHandlers) { try { h(msg); } catch { /* ignore */ } }
  }
}

function tsFromMs(ms: number): string {
  const d = Number.isFinite(ms) ? new Date(ms) : new Date();
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(d);
}
