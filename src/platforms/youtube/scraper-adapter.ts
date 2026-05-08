import type { ChatMessage, PlatformId, StreamEvent, YouTubeStreamInfo } from '../../shared/types.js';
import type { PlatformCapabilities } from '../../shared/moderation.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';
import { YTLiveClient } from '../../main/youtube-client.js';
import { getLabelFromTitle, type LiveStreamInfo } from '../../main/youtube-helpers.js';

/**
 * R6 (YouTube): adapter wrapping a pool of YTLiveClient scrapers behind the
 * standard PlatformChatAdapter interface. YouTube is the only platform where
 * a single account/handle can produce multiple concurrent chat sources (the
 * regular live stream + a vertical Shorts live), so the adapter:
 *
 *   - Owns its own scraper map (keyed by videoId).
 *   - Periodically polls each monitored channel handle for new live videos.
 *   - Spawns up to 2 scrapers, one per `YT_PLATFORMS` slot.
 *   - Polls per-video viewer counts on a separate timer.
 *
 * The adapter intentionally pushes messages through the per-listener fan-out
 * (`onMessage` / `onEvent`) rather than `chatService.injectMessage`. Behavior
 * for end users is unchanged — same scraper, same polling cadences.
 */

const MONITOR_INTERVAL_MS = 120_000;
const MAX_CONCURRENT_STREAMS = 2;
const YT_PLATFORMS: ReadonlyArray<'youtube' | 'youtube-v'> = ['youtube', 'youtube-v'];

export interface YouTubeAdapterDependencies {
  /** Returns the live streams currently active for `handle`, or `null` if the lookup failed. */
  checkYouTubeLive: (handle: string) => Promise<LiveStreamInfo[] | null>;
  /** Backfill for the initial viewer count when a scraper first attaches —
   *  called once per new live; subsequent updates flow through YTLiveClient's
   *  metadata-update event (every ~5s) instead of polling here. */
  fetchYtLiveViewerCount: (videoId: string) => Promise<number | null>;
  /** Tells the host to open a chat-log session for the given platform (called when a new scraper starts). */
  openChatLogSession: (platform: 'youtube' | 'youtube-v', videoId: string) => void;
  /** Tells the host to close a chat-log session (called when a scraper stops). */
  closeChatLogSession: (platform: 'youtube' | 'youtube-v') => void;
  /** Called whenever the set of active streams or their metadata changes. */
  onStreamsChanged: (streams: YouTubeStreamInfo[]) => void;
  /** Optional callback for new scraper start (currently used to clear suggestion entries). */
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
}

export class YouTubeChatAdapter implements PlatformChatAdapter {
  readonly platform: PlatformId = 'youtube';
  readonly capabilities: PlatformCapabilities = READ_ONLY_CAPABILITIES;

  private readonly messageHandlers = new Set<(message: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(event: StreamEvent) => void>();
  private readonly scrapers = new Map<string, YTLiveClient>();
  private readonly streamData = new Map<string, StreamData>();

  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private monitoredHandles: string[] = [];
  private autoMonitor = true;
  private connected = false;

  constructor(private readonly deps: YouTubeAdapterDependencies) {}

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
    for (const [, scraper] of this.scrapers) scraper.stop();
    for (const [, data] of this.streamData) this.deps.closeChatLogSession(data.platform);
    this.scrapers.clear();
    this.streamData.clear();
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

  /** Sends to whichever scraper is currently bound to `'youtube'`. */
  async sendMessage(content: string): Promise<void> {
    const scraper = this.getScraperByPlatform('youtube');
    if (!scraper) throw new Error('youtube: scraper not connected');
    const channelPageId = await this.deps.getChatChannelPageId();
    await scraper.sendMessage(content, channelPageId);
  }

  // ── YouTube-specific public API ─────────────────────────────────────────

  setMonitoredChannels(handles: readonly string[], options?: { autoMonitor?: boolean }): void {
    this.monitoredHandles = [...handles];
    if (options?.autoMonitor !== undefined) this.autoMonitor = options.autoMonitor;
    if (this.connected) void this.runMonitor();
  }

  /** Manual connect by videoId (used by the legacy panel). Slot is auto-assigned. */
  async addManualVideo(videoId: string): Promise<void> {
    if (this.scrapers.has(videoId)) return;
    const slotIdx = this.scrapers.size;
    if (slotIdx >= MAX_CONCURRENT_STREAMS) {
      throw new Error(`Cannot start a third scraper — only ${MAX_CONCURRENT_STREAMS} concurrent streams supported`);
    }
    const platform = YT_PLATFORMS[slotIdx];
    this.streamData.set(videoId, {
      label: String(slotIdx + 1),
      viewerCount: null,
      subscriberCount: null,
      platform,
      channelHandle: null,
    });
    this.deps.openChatLogSession(platform, videoId);
    this.deps.onScraperStart?.();
    await this.startScraper(videoId, platform, this.streamData.get(videoId)!.label);
    this.emitStreamsChanged();
  }

  /** Stops all scrapers (used by the legacy `youtube:disconnect` IPC). */
  stopAllScrapers(): void {
    for (const [, scraper] of this.scrapers) scraper.stop();
    for (const [, data] of this.streamData) this.deps.closeChatLogSession(data.platform);
    this.scrapers.clear();
    this.streamData.clear();
    this.emitStreamsChanged();
  }

  getCurrentStreams(): YouTubeStreamInfo[] {
    const totalStreams = this.scrapers.size;
    return Array.from(this.scrapers.keys()).map((videoId) => {
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
    for (const [videoId, scraper] of this.scrapers) {
      const data = this.streamData.get(videoId);
      if (data?.platform === platform) return scraper;
    }
    return null;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async runMonitor(): Promise<void> {
    if (!this.autoMonitor) {
      // Auto-monitor disabled but explicit scrapers might still be running
      // (e.g. legacy `youtube:connect` panel). Don't tear those down.
      this.emitStreamsChanged();
      return;
    }

    if (this.monitoredHandles.length === 0) {
      // No handles enabled (account disconnect or delete). Stop every scraper
      // we currently own so the chat actually goes quiet — without this the
      // pool keeps polling videos that nothing in the UI references.
      if (this.scrapers.size > 0) {
        for (const [, scraper] of this.scrapers) scraper.stop();
        for (const [, data] of this.streamData) this.deps.closeChatLogSession(data.platform);
        this.scrapers.clear();
        this.streamData.clear();
      }
      this.emitStreamsChanged();
      return;
    }

    const allLive: LiveStreamInfo[] = [];
    let anyCheckFailed = false;
    for (const handle of this.monitoredHandles) {
      const streams = await this.deps.checkYouTubeLive(handle);
      if (streams === null) { anyCheckFailed = true; continue; }
      for (const s of streams) {
        if (!allLive.find((x) => x.videoId === s.videoId)) allLive.push(s);
      }
    }

    // Backfill viewer count for streams where the scraping path didn't get one.
    for (let i = 0; i < allLive.length; i++) {
      if (allLive[i].viewCount === null) {
        const count = await this.deps.fetchYtLiveViewerCount(allLive[i].videoId);
        if (count !== null) allLive[i] = { ...allLive[i], viewCount: count };
      }
    }

    // Update existing scrapers; stop any that are no longer live.
    for (const [videoId, scraper] of this.scrapers) {
      const updated = allLive.find((s) => s.videoId === videoId);
      if (!updated) {
        if (anyCheckFailed) {
          this.deps.log?.info?.(`Keeping scraper for ${videoId} alive (channel check failed this cycle)`);
          continue;
        }
        const stale = this.streamData.get(videoId);
        if (stale) this.deps.closeChatLogSession(stale.platform);
        scraper.stop();
        this.scrapers.delete(videoId);
        this.streamData.delete(videoId);
        this.deps.log?.info?.(`Stopped scraper for ${videoId} (no longer live)`);
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

    // Start scrapers for newly detected streams (up to MAX_CONCURRENT_STREAMS).
    for (let i = 0; i < Math.min(allLive.length, MAX_CONCURRENT_STREAMS); i++) {
      const { videoId, title, viewCount, subscriberCount, channelHandle } = allLive[i];
      if (this.scrapers.has(videoId)) continue;
      const platform = YT_PLATFORMS[i];
      const label = getLabelFromTitle(title, i);
      this.streamData.set(videoId, {
        label,
        viewerCount: viewCount,
        subscriberCount,
        platform,
        channelHandle: channelHandle ?? null,
      });
      this.deps.log?.info?.(`Auto-detected live (${platform}, label=${label}): ${videoId} — "${title}"`);
      this.deps.openChatLogSession(platform, videoId);
      this.deps.onScraperStart?.();
      await this.startScraper(videoId, platform, label);
    }

    this.emitStreamsChanged();
  }

  private async startScraper(videoId: string, platform: 'youtube' | 'youtube-v', label: string): Promise<void> {
    const fmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });
    const scraper = new YTLiveClient({
      videoId,
      onMessage: (message) => {
        const payload: ChatMessage = {
          id: `yt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
    });
    this.scrapers.set(videoId, scraper);
    await scraper.start();
  }

  private emitStreamsChanged(): void {
    this.deps.onStreamsChanged(this.getCurrentStreams());
  }
}
