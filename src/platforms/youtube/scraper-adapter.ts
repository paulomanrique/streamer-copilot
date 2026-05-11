import type { ChatMessage, PlatformId, StreamEvent, YouTubeStreamInfo } from '../../shared/types.js';
import type { PlatformCapabilities } from '../../shared/moderation.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';
import { YTLiveClient } from '../../main/youtube-client.js';
import { computeYouTubeStreamLabels, type LiveStreamInfo } from '../../main/youtube-helpers.js';

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
 * The API-driven flavor lives in a sibling module (`youtube-api/api-adapter.ts`):
 * it's a separate platform id (`youtube-api`) and a separate adapter so its
 * capabilities (real moderation) can be expressed cleanly without per-message
 * routing inside this scraper-only path.
 */

const MONITOR_INTERVAL_MS = 120_000;
/** Cap for auto-monitored streams: a typical streamer has at most a horizontal
 *  + vertical broadcast at the same time, so the auto-monitor only attaches
 *  to the first two it finds. Manual adds (testing panel) bypass this cap. */
const MAX_AUTO_STREAMS = 2;
/** Hard ceiling across auto + manual scrapers so we don't accidentally light
 *  up a dozen YT chat WebSockets. Loose enough for multi-stream label testing. */
const MAX_TOTAL_STREAMS = 8;
/** Slot assignment for the legacy `platform` field. Slots beyond index 1
 *  reuse 'youtube' — streamLabel handles per-stream disambiguation now, so
 *  the platform color is only meaningful for the primary H/V pair. */
const YT_PLATFORMS: ReadonlyArray<'youtube' | 'youtube-v'> = ['youtube', 'youtube-v'];
const slotPlatform = (idx: number): 'youtube' | 'youtube-v' => YT_PLATFORMS[idx] ?? 'youtube';

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
  /** Resolved display label, recomputed whenever the set of active streams
   *  changes. Driven by `computeYouTubeStreamLabels`. Messages and viewer
   *  cards read it dynamically via `streamData`, so changes propagate to
   *  already-running scrapers without reconnecting. */
  label: string;
  /** Original broadcast title — needed for the H/V keyword heuristic in
   *  `computeYouTubeStreamLabels`. */
  title: string;
  viewerCount: number | null;
  subscriberCount: number | null;
  platform: 'youtube' | 'youtube-v';
  channelHandle: string | null;
  /** True if this scraper was added via `addManualVideo` (test panel or
   *  legacy `youtube:connect` IPC). The auto-monitor leaves manual entries
   *  alone — it neither tears them down when they aren't in the latest
   *  poll, nor counts them against the auto cap. */
  manual: boolean;
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

  /** Manual connect by videoId (used by the test panel and legacy IPC). Slot
   *  is auto-assigned. Bypasses the auto-monitor cap and is preserved across
   *  auto-monitor cycles (`manual: true`). */
  async addManualVideo(videoId: string): Promise<void> {
    if (this.scrapers.has(videoId)) return;
    const slotIdx = this.scrapers.size;
    if (slotIdx >= MAX_TOTAL_STREAMS) {
      throw new Error(`Cannot start another scraper — ${MAX_TOTAL_STREAMS} concurrent streams already running`);
    }
    const platform = slotPlatform(slotIdx);
    this.streamData.set(videoId, {
      label: 'YouTube',
      title: '',
      viewerCount: null,
      subscriberCount: null,
      platform,
      channelHandle: null,
      manual: true,
    });
    this.recomputeLabels();
    this.deps.openChatLogSession(platform, videoId);
    this.deps.onScraperStart?.();
    await this.startScraper(videoId, platform);
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
    return Array.from(this.scrapers.keys()).map((videoId) => {
      const data = this.streamData.get(videoId);
      return {
        videoId,
        platform: data?.platform ?? 'youtube',
        channelHandle: data?.channelHandle ?? null,
        label: data?.label ?? 'YouTube',
        viewerCount: data?.viewerCount ?? null,
        subscriberCount: data?.subscriberCount ?? null,
        liveUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    });
  }

  /** Recomputes the display label for every active stream. Call after the
   *  set of active scrapers changes (new stream detected, one stopped, manual
   *  add) so the chat badge and viewer cards stay in sync. */
  private recomputeLabels(): void {
    const inputs = Array.from(this.streamData.entries()).map(([videoId, data]) => ({
      videoId,
      title: data.title,
      channelHandle: data.channelHandle,
    }));
    const labels = computeYouTubeStreamLabels(inputs);
    for (const [videoId, label] of labels) {
      const data = this.streamData.get(videoId);
      if (data) this.streamData.set(videoId, { ...data, label });
    }
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

    // Update existing scrapers; stop any that are no longer live. Manual entries
    // (added via `addManualVideo`) are immune — the auto-monitor only owns the
    // scrapers it started itself.
    let removed = 0;
    for (const [videoId, scraper] of this.scrapers) {
      const stale = this.streamData.get(videoId);
      if (stale?.manual) continue;
      const updated = allLive.find((s) => s.videoId === videoId);
      if (!updated) {
        if (anyCheckFailed) {
          this.deps.log?.info?.(`Keeping scraper for ${videoId} alive (channel check failed this cycle)`);
          continue;
        }
        if (stale) this.deps.closeChatLogSession(stale.platform);
        scraper.stop();
        this.scrapers.delete(videoId);
        this.streamData.delete(videoId);
        removed++;
        this.deps.log?.info?.(`Stopped scraper for ${videoId} (no longer live)`);
      } else {
        const data = this.streamData.get(videoId);
        if (data) {
          this.streamData.set(videoId, {
            ...data,
            viewerCount: updated.viewCount ?? data.viewerCount,
            subscriberCount: updated.subscriberCount ?? data.subscriberCount,
            // Channel handle / title can fill in late on the first poll cycle
            // when the initial probe missed them. Refresh so the labeler has
            // up-to-date inputs.
            title: updated.title || data.title,
            channelHandle: updated.channelHandle ?? data.channelHandle,
          });
        }
      }
    }
    if (removed > 0) this.recomputeLabels();

    // Start scrapers for newly detected streams. Auto-monitor obeys
    // MAX_AUTO_STREAMS (typical H+V pair) and the global MAX_TOTAL_STREAMS so
    // it never crowds out manually-added test scrapers.
    let added = 0;
    const autoActive = Array.from(this.streamData.values()).filter((d) => !d.manual).length;
    for (let i = 0; i < allLive.length; i++) {
      if (autoActive + added >= MAX_AUTO_STREAMS) break;
      if (this.scrapers.size >= MAX_TOTAL_STREAMS) break;
      const { videoId, title, viewCount, subscriberCount, channelHandle } = allLive[i];
      if (this.scrapers.has(videoId)) continue;
      const platform = slotPlatform(this.scrapers.size);
      this.streamData.set(videoId, {
        label: 'YouTube',
        title,
        viewerCount: viewCount,
        subscriberCount,
        platform,
        channelHandle: channelHandle ?? null,
        manual: false,
      });
      this.deps.log?.info?.(`Auto-detected live (${platform}): ${videoId} — "${title}"`);
      this.deps.openChatLogSession(platform, videoId);
      this.deps.onScraperStart?.();
      await this.startScraper(videoId, platform);
      added++;
    }

    if (added > 0) this.recomputeLabels();
    this.emitStreamsChanged();
  }

  private async startScraper(videoId: string, platform: 'youtube' | 'youtube-v'): Promise<void> {
    const fmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });
    // Look up the latest label per emit so when a second stream goes live and
    // labels get recomputed, already-running scrapers immediately switch over.
    const currentLabel = (): string => this.streamData.get(videoId)?.label ?? 'YouTube';
    const scraper = new YTLiveClient({
      videoId,
      onMessage: (message) => {
        const payload: ChatMessage = {
          id: `yt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestampLabel: fmt.format(new Date()),
          ...message,
          platform,
          streamLabel: currentLabel(),
        };
        for (const handler of this.messageHandlers) handler(payload);
      },
      onEvent: (event) => {
        const payload: StreamEvent = {
          id: `yt-event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestampLabel: fmt.format(new Date()),
          ...event,
          platform,
          streamLabel: currentLabel(),
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
