import { google, type youtube_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

import type { ChatBadge } from '../../shared/types.js';
import type {
  YouTubeLiveClient,
  YouTubeLiveClientOptions,
  YouTubeLiveModerationApi,
} from './live-client.js';

export interface YTApiClientOptions extends YouTubeLiveClientOptions {
  auth: OAuth2Client;
  /** Lower bound for the polling interval; YouTube usually returns 2–5s. */
  minPollIntervalMs?: number;
  /** Update concurrent-viewer count via `videos.list` at this cadence. 0 disables. */
  viewerPollIntervalMs?: number;
}

const DEFAULT_MIN_POLL_INTERVAL_MS = 2_000;
const DEFAULT_VIEWER_POLL_INTERVAL_MS = 30_000;

/**
 * YouTube live-chat client backed by the public Data API v3 (`googleapis`).
 *
 * Trade-offs vs. the scrape-based YTLiveClient:
 *  - Stable contractual API; less likely to break.
 *  - Real moderation surface (delete/ban/timeout).
 *  - Requires a Google Cloud project + OAuth consent from the user.
 *  - Subject to the daily 10k-quota; respects `pollingIntervalMillis` to stay
 *    well below it (≈5u every 2–5s ≈ 3.5–8.6k units/day for liveChatMessages).
 */
export class YTApiClient implements YouTubeLiveClient {
  readonly videoId: string;
  readonly moderation: YouTubeLiveModerationApi;

  private readonly youtube: youtube_v3.Youtube;
  private readonly minPollIntervalMs: number;
  private readonly viewerPollIntervalMs: number;
  private readonly startedAt = Date.now();

  private liveChatId: string | null = null;
  private nextPageToken: string | undefined = undefined;
  private chatTimer: ReturnType<typeof setTimeout> | null = null;
  private viewerTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(private readonly options: YTApiClientOptions) {
    this.videoId = options.videoId;
    this.minPollIntervalMs = options.minPollIntervalMs ?? DEFAULT_MIN_POLL_INTERVAL_MS;
    this.viewerPollIntervalMs = options.viewerPollIntervalMs ?? DEFAULT_VIEWER_POLL_INTERVAL_MS;
    this.youtube = google.youtube({ version: 'v3', auth: options.auth });
    this.moderation = {
      deleteMessage: (messageId) => this.deleteMessage(messageId),
      banUser: (channelId) => this.banUser(channelId),
      timeoutUser: (channelId, durationSec) => this.timeoutUser(channelId, durationSec),
    };
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.liveChatId = await this.resolveLiveChatId();
    if (!this.liveChatId) {
      throw new Error(`No active liveChatId for video ${this.videoId}`);
    }
    this.options.onLog?.(`[YT-API] started for ${this.videoId} (liveChatId=${this.liveChatId})`);
    void this.pollChat();
    if (this.viewerPollIntervalMs > 0) {
      this.viewerTimer = setInterval(() => void this.pollViewerCount(), this.viewerPollIntervalMs);
      void this.pollViewerCount();
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.chatTimer !== null) { clearTimeout(this.chatTimer); this.chatTimer = null; }
    if (this.viewerTimer !== null) { clearInterval(this.viewerTimer); this.viewerTimer = null; }
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.liveChatId) throw new Error('YouTube API client not started');
    await this.youtube.liveChatMessages.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: this.liveChatId,
          type: 'textMessageEvent',
          textMessageDetails: { messageText: content },
        },
      },
    });
  }

  private async deleteMessage(messageId: string): Promise<void> {
    await this.youtube.liveChatMessages.delete({ id: messageId });
  }

  private async banUser(channelId: string): Promise<void> {
    if (!this.liveChatId) throw new Error('YouTube API client not started');
    await this.youtube.liveChatBans.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: this.liveChatId,
          type: 'permanent',
          bannedUserDetails: { channelId },
        },
      },
    });
  }

  private async timeoutUser(channelId: string, durationSec: number): Promise<void> {
    if (!this.liveChatId) throw new Error('YouTube API client not started');
    // YouTube clamps to [10s, 300s] server-side; mirror it locally for a clearer error.
    const clamped = Math.max(10, Math.min(300, Math.round(durationSec)));
    await this.youtube.liveChatBans.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: this.liveChatId,
          type: 'temporary',
          banDurationSeconds: String(clamped),
          bannedUserDetails: { channelId },
        },
      },
    });
  }

  private async resolveLiveChatId(): Promise<string | null> {
    const res = await this.youtube.videos.list({
      part: ['liveStreamingDetails'],
      id: [this.videoId],
    });
    const item = res.data.items?.[0];
    return item?.liveStreamingDetails?.activeLiveChatId ?? null;
  }

  private async pollChat(): Promise<void> {
    if (this.stopped || !this.liveChatId) return;

    let nextDelayMs = this.minPollIntervalMs;
    try {
      const res = await this.youtube.liveChatMessages.list({
        liveChatId: this.liveChatId,
        part: ['snippet', 'authorDetails'],
        pageToken: this.nextPageToken,
      });

      const items = res.data.items ?? [];
      for (const item of items) {
        try {
          this.handleItem(item);
        } catch (err) {
          this.options.onLog?.(`[YT-API] item handler error: ${String(err)}`);
        }
      }

      this.nextPageToken = res.data.nextPageToken ?? undefined;
      const serverInterval = res.data.pollingIntervalMillis ?? 0;
      nextDelayMs = Math.max(this.minPollIntervalMs, serverInterval);
    } catch (err) {
      this.options.onLog?.(`[YT-API] poll error: ${String(err)}`);
      // Back off a bit on errors so we don't burn quota tight-looping.
      nextDelayMs = Math.max(this.minPollIntervalMs * 2, 5_000);
    }

    if (this.stopped) return;
    this.chatTimer = setTimeout(() => void this.pollChat(), nextDelayMs);
  }

  private async pollViewerCount(): Promise<void> {
    if (this.stopped || !this.options.onViewerCount) return;
    try {
      const res = await this.youtube.videos.list({
        part: ['liveStreamingDetails'],
        id: [this.videoId],
      });
      const raw = res.data.items?.[0]?.liveStreamingDetails?.concurrentViewers;
      if (!raw) return;
      const count = parseInt(String(raw), 10);
      if (Number.isFinite(count) && count >= 0) this.options.onViewerCount(count);
    } catch (err) {
      this.options.onLog?.(`[YT-API] viewer poll error: ${String(err)}`);
    }
  }

  private handleItem(item: youtube_v3.Schema$LiveChatMessage): void {
    const snippet = item.snippet;
    const author = item.authorDetails;
    if (!snippet || !author) return;

    const type = snippet.type ?? '';
    if (type === 'textMessageEvent') {
      this.emitTextMessage(item, snippet, author);
    } else if (type === 'superChatEvent') {
      this.emitSuperChat(snippet, author);
    } else if (type === 'superStickerEvent') {
      this.emitSuperSticker(snippet, author);
    } else if (type === 'newSponsorEvent') {
      this.emitNewSponsor(snippet, author);
    } else if (type === 'memberMilestoneChatEvent') {
      this.emitMilestone(snippet, author);
    } else if (type === 'chatEndedEvent') {
      this.options.onLog?.('[YT-API] live chat ended');
    }
    // messageDeletedEvent / messageRetractedEvent intentionally ignored in v1
    // to match scraper behavior; can surface deletions later.
  }

  private emitTextMessage(
    item: youtube_v3.Schema$LiveChatMessage,
    snippet: youtube_v3.Schema$LiveChatMessageSnippet,
    author: youtube_v3.Schema$LiveChatMessageAuthorDetails,
  ): void {
    const content = snippet.textMessageDetails?.messageText?.trim() ?? '';
    if (!content) return;
    const publishedAt = snippet.publishedAt ? Date.parse(snippet.publishedAt) : Date.now();
    const isHistory = Number.isFinite(publishedAt) && publishedAt < this.startedAt;

    this.options.onMessage({
      platform: 'youtube',
      author: this.authorName(author),
      content,
      badges: this.badges(author),
      avatarUrl: author.profileImageUrl ?? undefined,
      ...(author.channelId ? { userId: author.channelId } : {}),
      ...(isHistory ? { isHistory: true } : {}),
      ...(item.id ? { platformMessageId: item.id } : {}),
    });
  }

  private emitSuperChat(
    snippet: youtube_v3.Schema$LiveChatMessageSnippet,
    author: youtube_v3.Schema$LiveChatMessageAuthorDetails,
  ): void {
    const details = snippet.superChatDetails;
    const amountText = details?.amountDisplayString ?? '';
    const messageText = details?.userComment?.trim() ?? '';
    const amount = this.parseMicros(details?.amountMicros) ?? this.parseAmountText(amountText);
    const display = messageText
      ? `${messageText} (${amountText})`
      : amountText ? `Super Chat: ${amountText}` : 'Super Chat';

    this.options.onEvent?.({
      platform: 'youtube',
      type: 'superchat',
      author: this.authorName(author),
      amount,
      message: display,
    });
  }

  private emitSuperSticker(
    snippet: youtube_v3.Schema$LiveChatMessageSnippet,
    author: youtube_v3.Schema$LiveChatMessageAuthorDetails,
  ): void {
    const details = snippet.superStickerDetails;
    const amountText = details?.amountDisplayString ?? '';
    const amount = this.parseMicros(details?.amountMicros) ?? this.parseAmountText(amountText);

    this.options.onEvent?.({
      platform: 'youtube',
      type: 'superchat',
      author: this.authorName(author),
      amount,
      message: amountText ? `Super Sticker: ${amountText}` : 'Super Sticker',
    });
  }

  private emitNewSponsor(
    snippet: youtube_v3.Schema$LiveChatMessageSnippet,
    author: youtube_v3.Schema$LiveChatMessageAuthorDetails,
  ): void {
    const details = snippet.newSponsorDetails;
    const tier = details?.memberLevelName ?? '';
    const message = tier ? `Novo membro: ${tier}` : 'Novo membro';
    this.options.onEvent?.({
      platform: 'youtube',
      type: 'subscription',
      author: this.authorName(author),
      amount: 0,
      message,
    });
  }

  private emitMilestone(
    snippet: youtube_v3.Schema$LiveChatMessageSnippet,
    author: youtube_v3.Schema$LiveChatMessageAuthorDetails,
  ): void {
    const details = snippet.memberMilestoneChatDetails;
    const months = details?.memberMonth ?? 0;
    const userMessage = details?.userComment?.trim() ?? '';
    const tier = details?.memberLevelName ?? '';
    const monthsLabel = months ? `${months} meses` : 'membro';
    const base = tier ? `${tier} • ${monthsLabel}` : monthsLabel;
    const message = userMessage ? `${base}: ${userMessage}` : base;

    this.options.onEvent?.({
      platform: 'youtube',
      type: 'subscription',
      author: this.authorName(author),
      amount: 0,
      message,
    });
  }

  private authorName(author: youtube_v3.Schema$LiveChatMessageAuthorDetails): string {
    const raw = author.displayName ?? 'Anonymous';
    return raw.startsWith('@') ? raw.slice(1) : raw;
  }

  private badges(author: youtube_v3.Schema$LiveChatMessageAuthorDetails): ChatBadge[] {
    const out: ChatBadge[] = [];
    if (author.isChatModerator) out.push('moderator');
    if (author.isChatSponsor && !author.isChatModerator) out.push('member');
    return out;
  }

  private parseMicros(micros: string | null | undefined): number | null {
    if (!micros) return null;
    const n = parseInt(micros, 10);
    if (!Number.isFinite(n)) return null;
    return n / 1_000_000;
  }

  private parseAmountText(raw: string): number {
    if (!raw) return 0;
    const cleaned = raw.replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
    if (!cleaned) return 0;
    const comma = cleaned.lastIndexOf(',');
    const dot = cleaned.lastIndexOf('.');
    const sep = Math.max(comma, dot);
    const normalized =
      sep >= 0
        ? cleaned.slice(0, sep).replace(/[^0-9-]/g, '') + '.' + cleaned.slice(sep + 1).replace(/[^0-9]/g, '')
        : cleaned.replace(/[^0-9-]/g, '');
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
  }
}
