import type { OAuth2Client } from 'google-auth-library';

import type { ChatMessage, PlatformId, StreamEvent, YouTubeStreamInfo } from '../../shared/types.js';
import type { ModerationApi, PlatformCapabilities } from '../../shared/moderation.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';
import type { LiveStreamInfo } from '../../main/youtube-helpers.js';
import { YTApiClient } from './api-client.js';
import { checkYouTubeLiveViaApi } from './api-monitor.js';

/**
 * YouTube API driver — sibling to YouTubeChatAdapter. Treats the API path as
 * its own platform (`youtube-api`) so the UI and capability layer don't have
 * to special-case which YouTube messages can be moderated.
 *
 * Per-account model: each `YouTubeApiAccount` owns its own OAuth2Client (built
 * from credentials stored in the PlatformAccount.providerData). Live monitoring
 * is `liveBroadcasts.list?mine=true` — there's no third-party channel monitor
 * (that would burn 100u/call on `search.list`).
 */

/** Polling cadence for `liveBroadcasts.list?mine=true`. At ~3 quota units per
 *  call this is ~4.3k units/day per account — comfortable under the 10k/day
 *  default with up to two accounts on the same OAuth client. */
const MONITOR_INTERVAL_MS = 60_000;
const MAX_CONCURRENT_STREAMS_PER_ACCOUNT = 2;

const YOUTUBE_API_CAPABILITIES: PlatformCapabilities = Object.freeze({
  ...READ_ONLY_CAPABILITIES,
  canDeleteMessage: true,
  canBanUser: true,
  canTimeoutUser: true,
});

export interface YouTubeApiAccount {
  /** PlatformAccount.id — opaque to the adapter, used for stream labels and scoping. */
  accountId: string;
  /** YouTube channel id (UC…) for `mine=true` filtering and labels. */
  channelId: string;
  /** Display title for the account (channel name). */
  label: string;
  /** OAuth2Client primed with refresh-token credentials; googleapis auto-refreshes access tokens. */
  oauth: OAuth2Client;
}

export interface YouTubeApiAdapterDependencies {
  /** Returns the currently-enabled accounts. Re-read on every monitor cycle so
   *  account list changes (connect/disconnect) take effect without restarts. */
  getActiveAccounts: () => readonly YouTubeApiAccount[];
  /** Tells the host to open a chat-log session for a stream. */
  openChatLogSession: (platform: PlatformId, videoId: string) => void;
  /** Tells the host to close a chat-log session. */
  closeChatLogSession: (platform: PlatformId) => void;
  /** Optional callback for a new client start (used by the scrape adapter to clear suggestion entries). */
  onClientStart?: () => void;
  /** Called whenever the set of active API streams (or their metadata) changes.
   *  The host typically merges this with the scrape adapter's streams and
   *  forwards both to the renderer so cards / live-links / filter chips show
   *  the API-driven streams too. */
  onStreamsChanged?: () => void;
  /** Logging hooks. */
  log?: { info?: (msg: string) => void; warn?: (msg: string) => void };
}

interface StreamData {
  accountId: string;
  label: string;
  viewerCount: number | null;
  subscriberCount: number | null;
  oauth: OAuth2Client;
}

export class YouTubeApiChatAdapter implements PlatformChatAdapter {
  readonly platform: PlatformId = 'youtube-api';
  readonly capabilities: PlatformCapabilities = YOUTUBE_API_CAPABILITIES;
  readonly moderation: ModerationApi;

  private readonly messageHandlers = new Set<(message: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(event: StreamEvent) => void>();
  private readonly clients = new Map<string, YTApiClient>();
  private readonly streamData = new Map<string, StreamData>();
  /** YouTube message id → videoId, populated on emission. Lets moderation
   *  route a delete to the right OAuth grant when there are multiple accounts. */
  private readonly messageOwners = new Map<string, string>();

  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;

  constructor(private readonly deps: YouTubeApiAdapterDependencies) {
    this.moderation = {
      deleteMessage: (messageId) => this.routeDeleteMessage(messageId),
      banUser: (userId) => this.routeBan(userId),
      unbanUser: () => Promise.reject(new Error('unbanUser is not supported by the YouTube API driver')),
      timeoutUser: (userId, durationSeconds) => this.routeTimeout(userId, durationSeconds),
    };
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.connected = true;
    await this.runMonitor();
    if (this.monitorTimer === null) {
      this.monitorTimer = setInterval(() => void this.runMonitor(), MONITOR_INTERVAL_MS);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.monitorTimer !== null) { clearInterval(this.monitorTimer); this.monitorTimer = null; }
    for (const [, client] of this.clients) client.stop();
    this.deps.closeChatLogSession(this.platform);
    this.clients.clear();
    this.streamData.clear();
    this.messageOwners.clear();
  }

  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onEvent(handler: (event: StreamEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /** Sends to whichever client started first. With multiple accounts the user
   *  has to address them individually — that's a UI concern (per-account send),
   *  not implemented here yet. */
  async sendMessage(content: string): Promise<void> {
    const client = this.clients.values().next().value;
    if (!client) throw new Error('youtube-api: no active client');
    await client.sendMessage(content);
  }

  hasActiveStreams(): boolean {
    return this.clients.size > 0;
  }

  /** Returns the active API streams in the same shape as the scrape adapter's
   *  output, so the host can merge both lists when pushing to the renderer.
   *  Labels follow the same rules as the scraper — single stream → "YouTube",
   *  multiple → the resolver kicks in via the host-side merge. */
  getCurrentStreams(): YouTubeStreamInfo[] {
    return Array.from(this.clients.keys()).map((videoId) => {
      const data = this.streamData.get(videoId);
      return {
        videoId,
        platform: 'youtube-api' as const,
        channelHandle: data?.label ?? null,
        label: data?.label ?? 'YouTube',
        viewerCount: data?.viewerCount ?? null,
        subscriberCount: data?.subscriberCount ?? null,
        liveUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    });
  }

  /** Triggered by the host when the account list changes (connect / disconnect). */
  refresh(): void {
    if (this.connected) void this.runMonitor();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async runMonitor(): Promise<void> {
    const accounts = this.deps.getActiveAccounts();
    const accountById = new Map(accounts.map((a) => [a.accountId, a] as const));

    if (accounts.length === 0) {
      // No accounts enabled; tear down any stragglers.
      if (this.clients.size > 0) {
        for (const [, client] of this.clients) client.stop();
        this.deps.closeChatLogSession(this.platform);
        this.clients.clear();
        this.streamData.clear();
        this.messageOwners.clear();
        this.deps.onStreamsChanged?.();
      }
      return;
    }

    // Discover live streams per account.
    interface DiscoveredStream extends LiveStreamInfo { accountId: string }
    const discovered: DiscoveredStream[] = [];
    let anyCheckFailed = false;
    for (const account of accounts) {
      const liveStreams = await checkYouTubeLiveViaApi(account.label, account.oauth, (cause) => {
        const message = cause instanceof Error ? (cause.message || cause.name) : String(cause);
        // The googleapis Error frequently carries `code` + a richer body in
        // `errors[0].reason` (e.g. quotaExceeded, authError, forbidden,
        // liveStreamingNotEnabled). Surface what we can find without leaking
        // the full payload.
        const errObj = cause as { code?: number; errors?: Array<{ reason?: string }> } | undefined;
        const reason = errObj?.errors?.[0]?.reason ?? null;
        const status = errObj?.code ?? null;
        this.deps.log?.warn?.(
          `[YT-API] live check failed for ${account.label}: ${message}`
          + (status ? ` (status=${status})` : '')
          + (reason ? ` (reason=${reason})` : ''),
        );
      });
      if (liveStreams === null) {
        anyCheckFailed = true;
        continue;
      }
      const limited = liveStreams.slice(0, MAX_CONCURRENT_STREAMS_PER_ACCOUNT);
      for (const stream of limited) {
        if (!discovered.find((x) => x.videoId === stream.videoId)) {
          discovered.push({ ...stream, accountId: account.accountId });
        }
      }
    }

    // Update existing clients; stop any that are no longer live.
    let removed = 0;
    for (const [videoId, client] of this.clients) {
      const updated = discovered.find((s) => s.videoId === videoId);
      if (!updated) {
        if (anyCheckFailed) continue;
        client.stop();
        this.clients.delete(videoId);
        this.streamData.delete(videoId);
        this.dropMessageOwners(videoId);
        removed++;
        this.deps.log?.info?.(`[YT-API] Stopped client for ${videoId} (no longer live)`);
      } else {
        const data = this.streamData.get(videoId);
        if (data) {
          this.streamData.set(videoId, {
            ...data,
            viewerCount: updated.viewCount ?? data.viewerCount,
            subscriberCount: updated.subscriberCount ?? data.subscriberCount,
          });
        }
      }
    }

    // Start clients for new live streams.
    let added = 0;
    for (const stream of discovered) {
      if (this.clients.has(stream.videoId)) continue;
      const account = accountById.get(stream.accountId);
      if (!account) continue;
      this.streamData.set(stream.videoId, {
        accountId: stream.accountId,
        label: account.label,
        viewerCount: stream.viewCount,
        subscriberCount: stream.subscriberCount,
        oauth: account.oauth,
      });
      this.deps.openChatLogSession(this.platform, stream.videoId);
      this.deps.onClientStart?.();
      this.deps.log?.info?.(`[YT-API] Auto-detected live: ${stream.videoId} — "${stream.title}" (account=${account.label})`);
      await this.startClient(stream.videoId, account);
      added++;
    }

    if (removed > 0 || added > 0) this.deps.onStreamsChanged?.();
  }

  private async startClient(videoId: string, account: YouTubeApiAccount): Promise<void> {
    const fmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });
    const client = new YTApiClient({
      videoId,
      auth: account.oauth,
      onMessage: (message) => {
        const platformMessageId = message.platformMessageId;
        const id = platformMessageId
          ?? `yt-api-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        if (platformMessageId) this.messageOwners.set(platformMessageId, videoId);
        const payload: ChatMessage = {
          id,
          timestampLabel: fmt.format(new Date()),
          ...message,
          platform: this.platform,
          streamLabel: account.label,
        };
        for (const handler of this.messageHandlers) handler(payload);
      },
      onEvent: (event) => {
        const payload: StreamEvent = {
          id: `yt-api-event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestampLabel: fmt.format(new Date()),
          ...event,
          platform: this.platform,
          streamLabel: account.label,
        };
        for (const handler of this.eventHandlers) handler(payload);
      },
      onLog: (msg) => this.deps.log?.info?.(msg),
      onViewerCount: (count) => {
        const data = this.streamData.get(videoId);
        if (!data || data.viewerCount === count) return;
        this.streamData.set(videoId, { ...data, viewerCount: count });
        this.deps.onStreamsChanged?.();
      },
    });
    this.clients.set(videoId, client);
    await client.start();
  }

  private dropMessageOwners(videoId: string): void {
    for (const [msgId, owner] of this.messageOwners) {
      if (owner === videoId) this.messageOwners.delete(msgId);
    }
  }

  // ── Moderation routing ──────────────────────────────────────────────────

  private async routeDeleteMessage(messageId: string): Promise<void> {
    const videoId = this.messageOwners.get(messageId);
    const client = videoId ? this.clients.get(videoId) : null;
    const target = client ?? this.clients.values().next().value;
    if (!target?.moderation) {
      throw new Error('No active YouTube API client to handle moderation');
    }
    await target.moderation.deleteMessage(messageId);
  }

  private async routeBan(userId: string): Promise<void> {
    const target = this.clients.values().next().value;
    if (!target?.moderation) throw new Error('No active YouTube API client to handle moderation');
    await target.moderation.banUser(userId);
  }

  private async routeTimeout(userId: string, durationSeconds: number): Promise<void> {
    const target = this.clients.values().next().value;
    if (!target?.moderation) throw new Error('No active YouTube API client to handle moderation');
    await target.moderation.timeoutUser(userId, durationSeconds);
  }
}
