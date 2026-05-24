import { session } from 'electron';
import { Innertube, Log } from 'youtubei.js';
import type { ChatMessage, ChatBadge, ChatMessageContentPart, StreamEvent } from '../shared/types.js';
import type { PlatformRole } from '../shared/platform.js';
import type { YouTubeLiveClient, YouTubeLiveClientOptions } from '../platforms/youtube/live-client.js';

// Silence youtubei.js's INFO/WARN console output (extractor warnings, deprecation
// notes, polling traces). It defaults to passing WARNING through `console.warn`,
// which clutters the dev console while we're tailing real app logs. ERRORs still
// surface so we don't miss actual scraper failures.
Log.setLevel(Log.Level.ERROR);

export type YTLiveClientOptions = YouTubeLiveClientOptions;

export class YTLiveClient implements YouTubeLiveClient {
  private livechat: any = null;
  private stopped = false;
  private startedAt = 0;

  constructor(private readonly options: YTLiveClientOptions) {}

  get videoId(): string {
    return this.options.videoId;
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.startedAt = Date.now();

    const yt = await Innertube.create();
    const info = await yt.getInfo(this.options.videoId);
    const livechat = info.getLiveChat();
    this.livechat = livechat;

    livechat.on('start', () => {
      // chat is ready, polling begins
    });

    livechat.on('chat-update', (action: any) => {
      if (this.stopped) return;
      try {
        if (action.type === 'AddChatItemAction' && action.item) {
          this.handleItem(action.item);
        }
      } catch (err) {
        this.options.onLog?.(`[YT] chat update error: ${String(err)}`);
      }
    });

    livechat.on('error', (err: Error) => {
      this.options.onLog?.(`[YT] error: ${err.message}`);
    });

    livechat.on('end', () => {
      this.options.onLog?.('[YT] live chat ended');
    });

    livechat.on('metadata-update', (metadata: any) => {
      if (this.stopped || !this.options.onViewerCount) return;
      const node = metadata?.views?.view_count_node;
      if (!node || node.is_live !== true) return;
      // VideoViewCount.original_view_count is the raw concurrent count
      // ("24"), already a number after youtubei.js parses it. Fall back to
      // unlabeled_view_count_value text for safety.
      const fromOriginal = typeof node.original_view_count === 'number' ? node.original_view_count : null;
      const fallbackText: string = node.unlabeled_view_count_value?.toString?.() ?? node.view_count?.toString?.() ?? '';
      const fromText = fallbackText ? parseInt(fallbackText.replace(/[^0-9]/g, ''), 10) : NaN;
      const count = fromOriginal ?? (Number.isFinite(fromText) ? fromText : null);
      if (count !== null && count >= 0) this.options.onViewerCount(count);
    });

    livechat.start();
    this.options.onLog?.(`[YT] started for ${this.options.videoId} — is_replay: ${livechat.is_replay}`);
  }

  stop(): void {
    this.stopped = true;
    try {
      (this.livechat as any)?.stop?.();
    } catch {
      // ignore
    }
    this.livechat = null as any;
  }

  async sendMessage(content: string, onBehalfOfUser?: string): Promise<void> {
    if (!this.livechat) {
      throw new Error('YouTube chat input not available (login or chat not ready)');
    }

    const cookies = await session.defaultSession.cookies.get({ url: 'https://www.youtube.com' });
    const hasCookies = cookies.some((c) => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID');
    if (!hasCookies) {
      throw new Error('Log in to YouTube in Platforms before sending messages.');
    }

    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const authedYt = await Innertube.create({
      cookie: cookieStr,
      ...(onBehalfOfUser ? { on_behalf_of_user: onBehalfOfUser } : {}),
    });
    const info = await authedYt.getInfo(this.options.videoId);
    const authedChat = info.getLiveChat();
    await authedChat.sendMessage(content);
  }

  static async getChatChannels(): Promise<Array<{ pageId: string; name: string; handle: string; isSelected: boolean }>> {
    const cookies = await session.defaultSession.cookies.get({ url: 'https://www.youtube.com' });
    const hasCookies = cookies.some((c) => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID');
    if (!hasCookies) throw new Error('Log in to YouTube in Platforms first.');

    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const yt = await Innertube.create({ cookie: cookieStr });
    const items: any[] = await yt.account.getInfo(true) as any[];
    if (!Array.isArray(items) || items.length === 0) throw new Error('No channels found. Make sure you are logged in to YouTube.');

    return items
      .filter((item: any) => item.has_channel || item.channel_handle?.text)
      .map((item: any) => {
        const name: string = item.account_name?.text ?? item.account_name?.toString?.() ?? '';
        const handle: string = item.channel_handle?.text ?? item.channel_handle?.toString?.() ?? '';
        // Deep-search the endpoint for any 'obou' field regardless of nesting
        const payload = item.endpoint?.payload ?? {};
        // InnerTube returns pageId inside supportedTokens[].pageIdToken.pageId
        const pageId: string =
          (payload.supportedTokens as any[])?.find((t: any) => t?.pageIdToken?.pageId)?.pageIdToken?.pageId
          ?? YTLiveClient.findObou(item.endpoint)
          ?? '';
        return { pageId, name, handle, isSelected: !!item.is_selected };
      })
      .filter((ch) => ch.name || ch.handle);
  }

  /**
   * Walks a youtubei.js `Text` and produces:
   *   - `content`: a string with custom channel emojis collapsed to their
   *     first shortcut (e.g. `:yk:`) for command parsing / chat logs.
   *   - `contentParts`: the structured representation consumed by ChatFeed,
   *     where custom emojis carry their thumbnail URL so they can render as
   *     `<img>`. Unicode emojis stay as text — they render natively.
   * `Text.toString()` cannot be used because for custom emojis it produces
   * the raw `channelId/assetId` instead of the shortcut.
   */
  private static renderMessage(message: any): { content: string; contentParts: ChatMessageContentPart[] } {
    if (!message) return { content: '', contentParts: [] };
    const runs: any[] | undefined = Array.isArray(message.runs) ? message.runs : undefined;
    if (!runs || runs.length === 0) {
      const text = typeof message.text === 'string' ? message.text : (message.toString?.() ?? '');
      return { content: text, contentParts: text ? [{ type: 'text', text }] : [] };
    }
    const parts: ChatMessageContentPart[] = [];
    let content = '';
    for (const run of runs) {
      const emoji = run?.emoji;
      if (emoji && (emoji.is_custom || YTLiveClient.findEmojiImageUrl(emoji))) {
        const shortcut = Array.isArray(emoji.shortcuts)
          ? emoji.shortcuts.find((s: unknown) => typeof s === 'string' && s)
          : undefined;
        const name = typeof shortcut === 'string' && shortcut
          ? shortcut.replace(/^:|:$/g, '')
          : (typeof emoji.emoji_id === 'string' ? emoji.emoji_id.split('/').pop() ?? '' : '');
        if (!name) continue;
        const imageUrl = YTLiveClient.findEmojiImageUrl(emoji);
        parts.push({ type: 'emote', name, ...(imageUrl ? { imageUrl } : {}) });
        content += `:${name}:`;
        continue;
      }
      const text = typeof run?.text === 'string' ? run.text : '';
      if (!text) continue;
      const last = parts[parts.length - 1];
      if (last && last.type === 'text') last.text += text;
      else parts.push({ type: 'text', text });
      content += text;
    }
    return { content, contentParts: parts };
  }

  /**
   * Extracts the best-quality thumbnail URL for a youtubei.js emoji object.
   * The library parses raw YouTube responses into a `Thumbnail[]` on
   * `emoji.image`, but for YouTube's built-in reaction emojis the raw shape
   * occasionally bypasses `Thumbnail.fromResponse` (so `.image` ends up as
   * the raw `{ thumbnails: [...] }` instead of the parsed array). Probe both
   * shapes so we always render `<img>` for emojis that have an image.
   */
  private static findEmojiImageUrl(emoji: any): string | undefined {
    if (!emoji) return undefined;
    const direct = emoji.image;
    if (Array.isArray(direct)) {
      const hit = direct.find((t: any) => t && typeof t.url === 'string' && t.url);
      if (hit) return hit.url;
    }
    if (direct && typeof direct === 'object') {
      const thumbs = (direct.thumbnails ?? direct.sources) as Array<{ url?: string }> | undefined;
      if (Array.isArray(thumbs)) {
        const hit = thumbs.find((t) => t && typeof t.url === 'string' && t.url);
        if (hit?.url) return hit.url;
      }
    }
    return undefined;
  }

  private static findObou(obj: unknown, depth = 0): string | undefined {
    if (depth > 8 || obj === null || obj === undefined) return undefined;
    if (typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      if (typeof record['obou'] === 'string' && record['obou']) return record['obou'];
      for (const val of Object.values(record)) {
        const found = YTLiveClient.findObou(val, depth + 1);
        if (found) return found;
      }
    }
    return undefined;
  }

  private handleItem(item: any): void {
    const type: string = item.type ?? '';

    if (type === 'LiveChatTextMessage') {
      this.handleTextMessage(item);
    } else if (type === 'LiveChatPaidMessage') {
      this.handleSuperChat(item);
    } else if (type === 'LiveChatMembershipItem') {
      this.handleMembership(item);
    } else if (type === 'LiveChatPaidSticker') {
      this.handlePaidSticker(item);
    }
  }

  private handleTextMessage(item: any): void {
    const author = this.authorName(item.author);
    const { content: rawContent, contentParts } = YTLiveClient.renderMessage(item.message);
    const content = rawContent.trim();
    if (!content) return;

    const badges = this.parseBadges(item.author);
    const role = YTLiveClient.buildRole(item.author);
    const avatarUrl: string | undefined = item.author?.thumbnails?.[0]?.url ?? undefined;
    const userId: string | undefined = typeof item.author?.id === 'string' && item.author.id ? item.author.id : undefined;
    // item.timestamp is in milliseconds (timestampUsec / 1000)
    const isHistory = (item.timestamp ?? 0) < this.startedAt;

    this.options.onMessage({
      platform: 'youtube',
      author,
      content,
      ...(contentParts.length > 0 ? { contentParts } : {}),
      badges,
      avatarUrl,
      ...(userId ? { userId } : {}),
      ...(isHistory ? { isHistory: true } : {}),
      ...(role ? { role } : {}),
    });
  }

  private handleSuperChat(item: any): void {
    const author = this.authorName(item.author);
    const amountText: string = item.purchase_amount ?? '';
    const messageText = YTLiveClient.renderMessage(item.message).content.trim();
    const amount = this.parseAmount(amountText);
    const displayMessage = messageText
      ? `${messageText} (${amountText})`
      : amountText ? `Super Chat: ${amountText}` : 'Super Chat';

    this.options.onEvent?.({
      platform: 'youtube',
      type: 'superchat',
      author,
      amount,
      message: displayMessage,
    });
  }

  private handleMembership(item: any): void {
    const author = this.authorName(item.author);
    const subtext: string = item.header_subtext?.toString()?.trim() ?? 'Novo membro';

    this.options.onEvent?.({
      platform: 'youtube',
      type: 'subscription',
      author,
      amount: 0,
      message: subtext,
    });
  }

  private handlePaidSticker(item: any): void {
    const author = this.authorName(item.author);
    const amountText: string = item.purchase_amount ?? '';
    const amount = this.parseAmount(amountText);

    this.options.onEvent?.({
      platform: 'youtube',
      type: 'superchat',
      author,
      amount,
      message: amountText ? `Super Sticker: ${amountText}` : 'Super Sticker',
    });
  }

  private authorName(author: any): string {
    const raw: string = author?.name ?? 'Anonymous';
    return raw.startsWith('@') ? raw.slice(1) : raw;
  }

  private parseBadges(author: any): ChatBadge[] {
    const badges: ChatBadge[] = [];
    if (author?.is_moderator) badges.push('moderator');
    // Any non-moderator badge indicates a channel member
    if ((author?.badges?.length ?? 0) > 0 && !author?.is_moderator) badges.push('member');
    return badges;
  }

  /**
   * Resolve o `PlatformRole` a partir das flags + badges do autor.
   *
   * `subscriberTier` vem do tooltip do badge de membro (youtubei.js expõe esse
   * texto). Os tooltips do YouTube têm o formato `"<Nível> (<duração>)"` —
   * "Member (2 months)", "Apoiador (1 year, 3 months)", etc. Extraímos o
   * trecho antes do parêntese. Sem tooltip → sem tier (degradação graciosa,
   * o gate por tier simplesmente nega).
   */
  private static buildRole(author: any): PlatformRole | undefined {
    const moderator = Boolean(author?.is_moderator);
    const sponsorBadge = YTLiveClient.findMemberBadge(author);
    const subscriber = Boolean(sponsorBadge) || Boolean(author?.is_chat_sponsor);
    if (!moderator && !subscriber) return undefined;
    const tier = sponsorBadge ? YTLiveClient.extractTierFromBadge(sponsorBadge) : undefined;
    return {
      ...(moderator ? { moderator: true } : {}),
      ...(subscriber ? { subscriber: true } : {}),
      ...(tier ? { subscriberTier: tier } : {}),
    };
  }

  private static findMemberBadge(author: any): unknown | null {
    const list = Array.isArray(author?.badges) ? author.badges : [];
    for (const b of list) {
      const iconType: string = String(b?.icon_type ?? '').toUpperCase();
      if (iconType === 'MODERATOR' || iconType === 'OWNER' || iconType === 'VERIFIED') continue;
      // Custom emoji badges (membership) frequently lack icon_type; the
      // presence of a custom_thumbnail is the strong signal.
      if (b?.custom_thumbnail || iconType === 'MEMBER' || b?.tooltip) return b;
    }
    return null;
  }

  private static extractTierFromBadge(badge: any): string | undefined {
    const tooltip: string = typeof badge?.tooltip === 'string'
      ? badge.tooltip
      : (typeof badge?.tooltip?.text === 'string' ? badge.tooltip.text : '');
    if (!tooltip) return undefined;
    // "Apoiador (2 months)" → "Apoiador"; "Member" → "Member".
    const parenIdx = tooltip.indexOf('(');
    const label = (parenIdx >= 0 ? tooltip.slice(0, parenIdx) : tooltip).trim();
    return label || undefined;
  }

  private parseAmount(raw: string): number {
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
