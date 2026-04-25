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
  private livechat: Awaited<ReturnType<InstanceType<typeof Innertube>['getInfo']>> extends { getLiveChat: () => infer T } ? T : never | null = null as any;
  private stopped = false;
  private isFirstUpdate = true;

  constructor(private readonly options: YTLiveClientOptions) {}

  async start(): Promise<void> {
    this.stopped = false;
    this.isFirstUpdate = true;

    const yt = await Innertube.create();
    const info = await yt.getInfo(this.options.videoId);
    const livechat = info.getLiveChat();
    this.livechat = livechat;

    livechat.on('chat-update', (action: any) => {
      if (this.stopped) return;
      const isHistory = this.isFirstUpdate;
      this.isFirstUpdate = false;
      try {
        const actions: any[] = action.actions ?? [];
        for (const a of actions) {
          if (a.type === 'AddChatItemAction' && a.item) {
            this.handleItem(a.item, isHistory);
          }
        }
      } catch (err) {
        this.options.onLog?.(`Chat update error: ${String(err)}`);
      }
    });

    livechat.on('error', (err: Error) => {
      this.options.onLog?.(`YouTube live chat error: ${err.message}`);
    });

    livechat.on('end', () => {
      this.options.onLog?.('YouTube live chat ended');
    });

    livechat.start();
    this.options.onLog?.(`YouTube live chat started for ${this.options.videoId}`);
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

  async sendMessage(content: string): Promise<void> {
    if (!this.livechat) {
      throw new Error('YouTube chat input not available (login or chat not ready)');
    }

    const cookies = await session.defaultSession.cookies.get({ url: 'https://www.youtube.com' });
    const hasCookies = cookies.some((c) => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID');
    if (!hasCookies) {
      throw new Error('Log in to YouTube in Platforms before sending messages.');
    }

    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const authedYt = await Innertube.create({ cookie: cookieStr });
    const info = await authedYt.getInfo(this.options.videoId);
    const authedChat = info.getLiveChat();
    await authedChat.sendMessage(content);
  }

  private handleItem(item: any, isHistory: boolean): void {
    const type: string = item.type ?? '';

    if (type === 'LiveChatTextMessage') {
      this.handleTextMessage(item, isHistory);
    } else if (type === 'LiveChatPaidMessage') {
      this.handleSuperChat(item);
    } else if (type === 'LiveChatMembershipItem') {
      this.handleMembership(item);
    } else if (type === 'LiveChatPaidSticker') {
      this.handlePaidSticker(item);
    }
  }

  private handleTextMessage(item: any, isHistory: boolean): void {
    const author = this.authorName(item.author);
    const content: string = item.message?.toString()?.trim() ?? '';
    if (!content) return;

    const badges = this.parseBadges(item.author);
    const avatarUrl: string | undefined = item.author?.thumbnails?.[0]?.url ?? undefined;

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
