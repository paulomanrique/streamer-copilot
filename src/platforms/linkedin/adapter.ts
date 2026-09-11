import type { ChatBadge, ChatMessage, PlatformLinkStatus, StreamEvent } from '../../shared/types.js';
import type { PlatformRole } from '../../shared/platform.js';
import type { PlatformCapabilities } from '../../shared/moderation.js';
import { linkedInLivePageUrl, parseLinkedInLiveRef } from '../../shared/linkedin-live.js';
import { resolveFromRole } from '../../modules/commands/permission-utils.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';
import {
  LinkedInDomChatScraper,
  type LinkedInDomComment,
  type LinkedInDomSender,
  type LinkedInPageState,
} from './dom-chat-scraper.js';

export interface LinkedInAdapterOptions {
  /** Profile (`slug`) or page (`company/slug`) the account represents. */
  channel: string;
  /** Event or post URL of the live. Required — LinkedIn has no way to find a
   *  member's current live without it. */
  liveUrl?: string;
  onStatusChange?: (status: PlatformLinkStatus) => void;
  onError?: (error: unknown) => void;
  onLiveStats?: (stats: { viewerCount: number | null; isLive: boolean; liveUrl: string }) => void;
  onLiveResolved?: (liveId: string) => void;
  onSenderResolved?: (sender: LinkedInDomSender) => void;
  log?: (msg: string) => void;
}

/** Comments posted this long before connecting are backfill, not live chat
 *  (absorbs clock skew between LinkedIn's id timestamps and this machine). */
const HISTORY_GRACE_MS = 15_000;

/**
 * Adapter for LinkedIn Live comments. One adapter = one live (event). Reads
 * and sends through a hidden signed-in theater page. `connect()` throws while
 * the page has no live comments panel; the host's watching/retry loop
 * (app-context) keeps trying, like the X and TikTok adapters.
 */
export class LinkedInChatAdapter implements PlatformChatAdapter {
  readonly platform = 'linkedin' as const;
  readonly capabilities: PlatformCapabilities = READ_ONLY_CAPABILITIES;

  private connected = false;
  private scraper: LinkedInDomChatScraper | null = null;
  private liveId: string | null = null;
  private liveUrl = '';
  private selfName: string | null = null;
  private connectStartedAt = 0;
  private lastStatsKey = '';
  /** Comments rendered before connect() settles the live id. */
  private pendingComments: LinkedInDomComment[] = [];
  /** The page is reloaded to recover from network drops and re-renders every
   *  comment it still lists; only the ones not seen yet go out. */
  private readonly seenCommentIds = new Set<string>();
  private readonly messageHandlers = new Set<(msg: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(ev: StreamEvent) => void>();

  constructor(private readonly options: LinkedInAdapterOptions) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    this.options.onStatusChange?.('connecting');
    try {
      const ref = parseLinkedInLiveRef(this.options.liveUrl);
      if (!ref) {
        throw new Error('Paste the LinkedIn Live URL (event or post link) in Connections → LinkedIn → Live URL.');
      }
      this.connectStartedAt = Date.now();
      const scraper = new LinkedInDomChatScraper(
        (comment) => this.handleComment(comment),
        (state) => this.handleState(state),
        this.options.log,
      );
      this.scraper = scraper;
      const state = await scraper.start(linkedInLivePageUrl(ref));
      // Post links redirect to the event theater; key the session by the
      // event id when available so both link shapes share one chat log.
      const landed = parseLinkedInLiveRef(`https://www.linkedin.com${state.path}`);
      this.liveId = landed?.id ?? ref.id;
      this.liveUrl = landed ? linkedInLivePageUrl(landed) : linkedInLivePageUrl(ref);
      this.options.onLiveResolved?.(this.liveId);
      this.connected = true;
      this.handleState(state);
      const pending = this.pendingComments;
      this.pendingComments = [];
      for (const comment of pending) this.handleComment(comment);
      this.options.onStatusChange?.('connected');
    } catch (cause) {
      this.scraper?.stop();
      this.scraper = null;
      this.connected = false;
      this.pendingComments = [];
      this.options.onError?.(cause);
      this.options.onStatusChange?.('error');
      throw cause;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.scraper?.stop();
    this.scraper = null;
    this.liveId = null;
    this.lastStatsKey = '';
    this.pendingComments = [];
    this.seenCommentIds.clear();
    this.options.onStatusChange?.('disconnected');
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.connected || !this.scraper) {
      throw new Error('LinkedIn adapter is not connected to a live');
    }
    const sender = await this.scraper.sendMessage(content);
    if (sender) this.options.onSenderResolved?.(sender);
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

  private handleState(state: LinkedInPageState): void {
    if (state.selfName && state.selfName !== this.selfName) {
      this.selfName = state.selfName;
      // The signed-in member is who sends; knowing the name up front labels
      // the local echo and keeps welcome messages off the streamer's own rows.
      this.options.onSenderResolved?.({ name: state.selfName, profilePath: '' });
    }
    if (!this.connected) return;
    const key = `${state.isLive}:${state.viewerCount}`;
    if (key === this.lastStatsKey) return;
    this.lastStatsKey = key;
    this.options.onLiveStats?.({ viewerCount: state.viewerCount, isLive: state.isLive, liveUrl: this.liveUrl });
  }

  private handleComment(comment: LinkedInDomComment): void {
    const liveId = this.liveId;
    if (!this.connected || !liveId) {
      this.pendingComments.push(comment);
      return;
    }
    if (this.seenCommentIds.has(comment.commentId)) return;
    this.seenCommentIds.add(comment.commentId);
    const isHistory = comment.isInitial && comment.timestampMs < this.connectStartedAt - HISTORY_GRACE_MS;
    const isBroadcaster = this.selfName !== null && comment.name === this.selfName;
    const role: PlatformRole = { broadcaster: isBroadcaster };
    const badges: ChatBadge[] = isBroadcaster ? ['broadcaster'] : [];
    const message: ChatMessage = {
      id: `linkedin-${comment.commentId}`,
      platform: 'linkedin',
      author: comment.name,
      content: comment.text,
      badges,
      timestampLabel: tsFromMs(comment.timestampMs),
      role,
      unifiedLevel: resolveFromRole(role),
      streamLabel: this.options.channel || undefined,
      // Routes the chat-log session to this live.
      channelId: liveId,
      userId: comment.profilePath || comment.name,
      ...(isHistory ? { isHistory: true } : {}),
    };
    for (const handler of this.messageHandlers) { try { handler(message); } catch { /* ignore */ } }
  }
}

function tsFromMs(ms: number): string {
  const d = Number.isFinite(ms) ? new Date(ms) : new Date();
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(d);
}
