import type { OAuth2Client } from 'google-auth-library';

import type {
  ChatMessage,
  PlatformId,
  StreamEvent,
  YouTubeChannelConfig,
  YouTubeDriver,
  YouTubeStreamInfo,
} from '../../shared/types.js';
import type { ModerationApi, PlatformCapabilities } from '../../shared/moderation.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';
import { YTLiveClient } from '../../main/youtube-client.js';
import { getLabelFromTitle, type LiveStreamInfo } from '../../main/youtube-helpers.js';
import type { YouTubeLiveClient, YouTubeLiveClientOptions } from './live-client.js';
import { YTApiClient } from './api-client.js';

/**
 * R6 (YouTube): adapter wrapping a pool of live-chat clients behind the
 * standard PlatformChatAdapter interface. YouTube is the only platform where
 * a single account/handle can produce multiple concurrent chat sources (the
 * regular live stream + a vertical Shorts live), so the adapter:
 *
 *   - Owns its own client map (keyed by videoId).
 *   - Periodically polls each monitored channel config for new live videos.
 *   - Spawns up to 2 clients, one per `YT_PLATFORMS` slot.
 *   - Polls per-video viewer counts on a separate timer.
 *
 * Each channel config picks a driver:
 *   - `scrape` (default): YTLiveClient via youtubei.js, cookie-authenticated.
 *   - `api`: YTApiClient via googleapis, OAuth-authenticated. Brings real
 *     moderation (delete / ban / timeout).
 *
 * The adapter intentionally pushes messages through the per-listener fan-out
 * (`onMessage` / `onEvent`) rather than `chatService.injectMessage`. Behavior
 * for end users is unchanged — same scraper, same polling cadences.
 */

const MONITOR_INTERVAL_MS = 120_000;
const MAX_CONCURRENT_STREAMS = 2;
const YT_PLATFORMS: ReadonlyArray<'youtube' | 'youtube-v'> = ['youtube', 'youtube-v'];

const YOUTUBE_API_CAPABILITIES: PlatformCapabilities = Object.freeze({
  ...READ_ONLY_CAPABILITIES,
  canDeleteMessage: true,
  canBanUser: true,
  canTimeoutUser: true,
});

export interface YouTubeAdapterDependencies {
  /** Returns the live streams currently active for `handle` via the scrape path, or `null` if the lookup failed. */
  checkYouTubeLive: (handle: string) => Promise<LiveStreamInfo[] | null>;
  /** Returns the live streams currently active for the OAuth-granting channel, or `null` if the lookup failed. */
  checkYouTubeLiveViaApi?: (channel: YouTubeChannelConfig) => Promise<LiveStreamInfo[] | null>;
  /** Returns the OAuth2Client primed with refresh-token credentials for the given channel config, or `null` if not connected. */
  getApiOAuth2Client?: (channelConfigId: string) => OAuth2Client | null;
  /** Backfill for the initial viewer count when a scraper first attaches —
   *  called once per new live; subsequent updates flow through YTLiveClient's
   *  metadata-update event (every ~5s) instead of polling here. */
  fetchYtLiveViewerCount: (videoId: string) => Promise<number | null>;
  /** Tells the host to open a chat-log session for the given platform (called when a new client starts). */
  openChatLogSession: (platform: 'youtube' | 'youtube-v', videoId: string) => void;
  /** Tells the host to close a chat-log session (called when a client stops). */
  closeChatLogSession: (platform: 'youtube' | 'youtube-v') => void;
  /** Called whenever the set of active streams or their metadata changes. */
  onStreamsChanged: (streams: YouTubeStreamInfo[]) => void;
  /** Optional callback for new client start (currently used to clear suggestion entries). */
  onScraperStart?: () => void;
  /** Logging hooks. */
  log?: { info?: (msg: string) => void; warn?: (msg: string) => void };
  /** Used by sendMessage to look up the YouTube channel page id for the chat session. */
  getChatChannelPageId: () => Promise<string | undefined>;
}

interface StreamData {
  label: string;
  viewerCount: number | null;
  subscriberCount: number | null;
  platform: 'youtube' | 'youtube-v';
  channelHandle: string | null;
  driver: YouTubeDriver;
  /** Filled when driver === 'api' so moderation can route messages to the right OAuth grant. */
  channelConfigId?: string;
}

export class YouTubeChatAdapter implements PlatformChatAdapter {
  readonly platform: PlatformId = 'youtube';

  private readonly messageHandlers = new Set<(message: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(event: StreamEvent) => void>();
  private readonly clients = new Map<string, YouTubeLiveClient>();
  private readonly streamData = new Map<string, StreamData>();
  /** YouTube message id → videoId, populated on emission. Used by moderation
   *  to find which client owns a given message id. Cleared on stream stop. */
  private readonly messageOwners = new Map<string, string>();

  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private monitoredChannels: YouTubeChannelConfig[] = [];
  private autoMonitor = true;
  private connected = false;

  constructor(private readonly deps: YouTubeAdapterDependencies) {}

  get capabilities(): PlatformCapabilities {
    return this.hasAnyApiClient() ? YOUTUBE_API_CAPABILITIES : READ_ONLY_CAPABILITIES;
  }

  get moderation(): ModerationApi | undefined {
    if (!this.hasAnyApiClient()) return undefined;
    return {
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
    for (const [, data] of this.streamData) this.deps.closeChatLogSession(data.platform);
    this.clients.clear();
    this.streamData.clear();
    this.messageOwners.clear();
    this.deps.onStreamsChanged([]);
  }

  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onEvent(handler: (event: StreamEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /** Sends to whichever client is currently bound to `'youtube'`. */
  async sendMessage(content: string): Promise<void> {
    const client = this.getClientByPlatform('youtube');
    if (!client) throw new Error('youtube: client not connected');
    const channelPageId = await this.deps.getChatChannelPageId();
    await client.sendMessage(content, channelPageId);
  }

  // ── YouTube-specific public API ─────────────────────────────────────────

  setMonitoredChannels(
    channels: readonly YouTubeChannelConfig[],
    options?: { autoMonitor?: boolean },
  ): void {
    this.monitoredChannels = channels.map((c) => ({ ...c }));
    if (options?.autoMonitor !== undefined) this.autoMonitor = options.autoMonitor;
    if (this.connected) void this.runMonitor();
  }

  /** Manual connect by videoId (used by the legacy panel). Slot is auto-assigned.
   *  Always uses the scrape driver — manual flow doesn't have an API channel context. */
  async addManualVideo(videoId: string): Promise<void> {
    if (this.clients.has(videoId)) return;
    const slotIdx = this.clients.size;
    if (slotIdx >= MAX_CONCURRENT_STREAMS) {
      throw new Error(`Cannot start a third client — only ${MAX_CONCURRENT_STREAMS} concurrent streams supported`);
    }
    const platform = YT_PLATFORMS[slotIdx];
    this.streamData.set(videoId, {
      label: String(slotIdx + 1),
      viewerCount: null,
      subscriberCount: null,
      platform,
      channelHandle: null,
      driver: 'scrape',
    });
    this.deps.openChatLogSession(platform, videoId);
    this.deps.onScraperStart?.();
    await this.startLiveClient(videoId, platform, this.streamData.get(videoId)!.label, 'scrape');
    this.emitStreamsChanged();
  }

  /** Stops all clients (used by the legacy `youtube:disconnect` IPC). */
  stopAllScrapers(): void {
    for (const [, client] of this.clients) client.stop();
    for (const [, data] of this.streamData) this.deps.closeChatLogSession(data.platform);
    this.clients.clear();
    this.streamData.clear();
    this.messageOwners.clear();
    this.emitStreamsChanged();
  }

  getCurrentStreams(): YouTubeStreamInfo[] {
    const totalStreams = this.clients.size;
    return Array.from(this.clients.keys()).map((videoId) => {
      const data = this.streamData.get(videoId);
      const label = totalStreams > 1
        ? (data?.platform === 'youtube-v' ? 'Vertical' : 'Horizontal')
        : 'YouTube';
      return {
        videoId,
        platform: data?.platform ?? 'youtube',
        channelHandle: data?.channelHandle ?? null,
        label,
        viewerCount: data?.viewerCount ?? null,
        subscriberCount: data?.subscriberCount ?? null,
        liveUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    });
  }

  getScraperByPlatform(platform: 'youtube' | 'youtube-v'): YTLiveClient | null {
    const client = this.getClientByPlatform(platform);
    return client instanceof YTLiveClient ? client : null;
  }

  getClientByPlatform(platform: 'youtube' | 'youtube-v'): YouTubeLiveClient | null {
    for (const [videoId, client] of this.clients) {
      const data = this.streamData.get(videoId);
      if (data?.platform === platform) return client;
    }
    return null;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private hasAnyApiClient(): boolean {
    for (const data of this.streamData.values()) {
      if (data.driver === 'api') return true;
    }
    return false;
  }

  private async checkChannel(channel: YouTubeChannelConfig): Promise<LiveStreamInfo[] | null> {
    if ((channel.driver ?? 'scrape') === 'api') {
      if (!this.deps.checkYouTubeLiveViaApi) {
        this.deps.log?.warn?.(`Channel ${channel.handle} is configured for API driver but no API monitor is wired`);
        return null;
      }
      if (!channel.apiAuth?.channelId) {
        this.deps.log?.warn?.(`Channel ${channel.handle} is configured for API driver but is not connected via OAuth yet`);
        return [];
      }
      return this.deps.checkYouTubeLiveViaApi(channel);
    }
    return this.deps.checkYouTubeLive(channel.handle);
  }

  private async runMonitor(): Promise<void> {
    if (!this.autoMonitor) {
      // Auto-monitor disabled but explicit clients might still be running
      // (e.g. legacy `youtube:connect` panel). Don't tear those down.
      this.emitStreamsChanged();
      return;
    }

    if (this.monitoredChannels.length === 0) {
      // No channels enabled (account disconnect or delete). Stop every client
      // we currently own so the chat actually goes quiet — without this the
      // pool keeps polling videos that nothing in the UI references.
      if (this.clients.size > 0) {
        for (const [, client] of this.clients) client.stop();
        for (const [, data] of this.streamData) this.deps.closeChatLogSession(data.platform);
        this.clients.clear();
        this.streamData.clear();
        this.messageOwners.clear();
      }
      this.emitStreamsChanged();
      return;
    }

    const allLive: Array<LiveStreamInfo & { driver: YouTubeDriver; channelConfigId?: string }> = [];
    let anyCheckFailed = false;
    for (const channel of this.monitoredChannels) {
      const streams = await this.checkChannel(channel);
      if (streams === null) { anyCheckFailed = true; continue; }
      const driver = channel.driver ?? 'scrape';
      for (const s of streams) {
        if (!allLive.find((x) => x.videoId === s.videoId)) {
          allLive.push({ ...s, driver, channelConfigId: channel.id });
        }
      }
    }

    // Backfill viewer count for streams where the source didn't get one.
    for (let i = 0; i < allLive.length; i++) {
      if (allLive[i].viewCount === null) {
        const count = await this.deps.fetchYtLiveViewerCount(allLive[i].videoId);
        if (count !== null) allLive[i] = { ...allLive[i], viewCount: count };
      }
    }

    // Update existing clients; stop any that are no longer live.
    for (const [videoId, client] of this.clients) {
      const updated = allLive.find((s) => s.videoId === videoId);
      if (!updated) {
        if (anyCheckFailed) {
          this.deps.log?.info?.(`Keeping client for ${videoId} alive (channel check failed this cycle)`);
          continue;
        }
        const stale = this.streamData.get(videoId);
        if (stale) this.deps.closeChatLogSession(stale.platform);
        client.stop();
        this.clients.delete(videoId);
        this.streamData.delete(videoId);
        this.dropMessageOwners(videoId);
        this.deps.log?.info?.(`Stopped client for ${videoId} (no longer live)`);
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

    // Start clients for newly detected streams (up to MAX_CONCURRENT_STREAMS).
    for (let i = 0; i < Math.min(allLive.length, MAX_CONCURRENT_STREAMS); i++) {
      const { videoId, title, viewCount, subscriberCount, channelHandle, driver, channelConfigId } = allLive[i];
      if (this.clients.has(videoId)) continue;
      const platform = YT_PLATFORMS[i];
      const label = getLabelFromTitle(title, i);
      this.streamData.set(videoId, {
        label,
        viewerCount: viewCount,
        subscriberCount,
        platform,
        channelHandle: channelHandle ?? null,
        driver,
        channelConfigId,
      });
      this.deps.log?.info?.(`Auto-detected live (${platform}, driver=${driver}, label=${label}): ${videoId} — "${title}"`);
      this.deps.openChatLogSession(platform, videoId);
      this.deps.onScraperStart?.();
      await this.startLiveClient(videoId, platform, label, driver, channelConfigId);
    }

    this.emitStreamsChanged();
  }

  private async startLiveClient(
    videoId: string,
    platform: 'youtube' | 'youtube-v',
    label: string,
    driver: YouTubeDriver,
    channelConfigId?: string,
  ): Promise<void> {
    const fmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });
    const baseOptions: YouTubeLiveClientOptions = {
      videoId,
      onMessage: (message) => {
        const platformMessageId = message.platformMessageId;
        // Use the platform-native message id when available so moderation
        // (which receives `messageId = ChatMessage.id`) can hit YouTube's API.
        // Falls back to a synthetic id for the scrape driver, matching the
        // pre-refactor behavior.
        const id = platformMessageId
          ?? `yt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        if (platformMessageId) this.messageOwners.set(platformMessageId, videoId);
        const payload: ChatMessage = {
          id,
          timestampLabel: fmt.format(new Date()),
          ...message,
          platform,
          streamLabel: label,
        };
        for (const handler of this.messageHandlers) handler(payload);
      },
      onEvent: (event) => {
        const payload: StreamEvent = {
          id: `yt-event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestampLabel: fmt.format(new Date()),
          ...event,
          platform,
          streamLabel: label,
        };
        for (const handler of this.eventHandlers) handler(payload);
      },
      onLog: (msg) => this.deps.log?.info?.(msg),
      onViewerCount: (count) => {
        const data = this.streamData.get(videoId);
        if (!data || data.viewerCount === count) return;
        this.streamData.set(videoId, { ...data, viewerCount: count });
        this.emitStreamsChanged();
      },
    };

    let client: YouTubeLiveClient;
    if (driver === 'api') {
      if (!channelConfigId) throw new Error('API driver requires a channelConfigId');
      const auth = this.deps.getApiOAuth2Client?.(channelConfigId);
      if (!auth) {
        throw new Error(`No OAuth2 client available for YouTube channel ${channelConfigId}`);
      }
      client = new YTApiClient({ ...baseOptions, auth });
    } else {
      client = new YTLiveClient(baseOptions);
    }

    this.clients.set(videoId, client);
    await client.start();
  }

  private emitStreamsChanged(): void {
    this.deps.onStreamsChanged(this.getCurrentStreams());
  }

  private dropMessageOwners(videoId: string): void {
    for (const [msgId, owner] of this.messageOwners) {
      if (owner === videoId) this.messageOwners.delete(msgId);
    }
  }

  // ── Moderation routing ──────────────────────────────────────────────────

  private async routeDeleteMessage(messageId: string): Promise<void> {
    const videoId = this.messageOwners.get(messageId);
    const client = this.findApiClientForDelete(videoId);
    if (!client?.moderation) {
      throw new Error('Moderation requires the YouTube API driver to be active for this stream');
    }
    await client.moderation.deleteMessage(messageId);
  }

  private async routeBan(userId: string): Promise<void> {
    const client = this.findFirstApiClient();
    if (!client?.moderation) {
      throw new Error('Moderation requires the YouTube API driver to be active');
    }
    await client.moderation.banUser(userId);
  }

  private async routeTimeout(userId: string, durationSeconds: number): Promise<void> {
    const client = this.findFirstApiClient();
    if (!client?.moderation) {
      throw new Error('Moderation requires the YouTube API driver to be active');
    }
    await client.moderation.timeoutUser(userId, durationSeconds);
  }

  private findApiClientForDelete(videoId: string | undefined): YouTubeLiveClient | null {
    if (videoId) {
      const client = this.clients.get(videoId);
      const data = this.streamData.get(videoId);
      if (client && data?.driver === 'api') return client;
    }
    return this.findFirstApiClient();
  }

  private findFirstApiClient(): YouTubeLiveClient | null {
    for (const [videoId, client] of this.clients) {
      const data = this.streamData.get(videoId);
      if (data?.driver === 'api') return client;
    }
    return null;
  }
}
