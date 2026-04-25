import { session } from 'electron';
import { Innertube } from 'youtubei.js';
import type { ChatMessage, ChatBadge, StreamEvent } from '../shared/types.js';

export interface YTLiveClientOptions {
  videoId: string;
  onMessage: (message: Omit<ChatMessage, 'id' | 'timestampLabel'>) => void;
  onEvent?: (event: Omit<StreamEvent, 'id' | 'timestampLabel'>) => void;
  onLog?: (message: string) => void;
}

export class YTLiveClient {
  private livechat: any = null;
  private stopped = false;
  private startedAt = 0;

  constructor(private readonly options: YTLiveClientOptions) {}

  async start(): Promise<void> {
    this.stopped = false;
    this.startedAt = Date.now();

    const yt = await Innertube.create();
    const info = await yt.getInfo(this.options.videoId);
    const livechat = info.getLiveChat();
    this.livechat = livechat;

    livechat.on('start', (initial: any) => {
      this.options.onLog?.(`[YT] live chat ready — initial actions: ${initial?.actions?.length ?? 0}`);
    });

    // chat-update fires once per action (individual nodes, not a batch container)
    livechat.on('chat-update', (action: any) => {
      if (this.stopped) return;
      this.options.onLog?.(`[YT] action: ${action?.type ?? 'unknown'}`);
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
        const endpointName: string = item.endpoint?.name ?? '';
        const payload = item.endpoint?.payload ?? {};
        // InnerTube selectActiveIdentityEndpoint uses `obou` for the page ID
        const pageId: string = payload.obou ?? payload.pageId ?? payload.delegatedSessionId ?? '';
        const name: string = item.account_name?.text ?? item.account_name?.toString?.() ?? '';
        const handle: string = item.channel_handle?.text ?? item.channel_handle?.toString?.() ?? '';
        console.log('[YT getChatChannels] item:', { name, handle, endpointName, payloadKeys: Object.keys(payload), pageId });
        return { pageId, name, handle, isSelected: !!item.is_selected };
      })
      .filter((ch) => ch.name || ch.handle);
  }

  private handleItem(item: any): void {
    const type: string = item.type ?? '';
    this.options.onLog?.(`[YT] item type: ${type}`);

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
    const content: string = item.message?.toString()?.trim() ?? '';
    if (!content) return;

    const badges = this.parseBadges(item.author);
    const avatarUrl: string | undefined = item.author?.thumbnails?.[0]?.url ?? undefined;
    // item.timestamp is in milliseconds (timestampUsec / 1000)
    const isHistory = (item.timestamp ?? 0) < this.startedAt;

    this.options.onMessage({
      platform: 'youtube',
      author,
      content,
      badges,
      avatarUrl,
      ...(isHistory ? { isHistory: true } : {}),
    });
  }

  private handleSuperChat(item: any): void {
    const author = this.authorName(item.author);
    const amountText: string = item.purchase_amount ?? '';
    const messageText: string = item.message?.toString()?.trim() ?? '';
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
