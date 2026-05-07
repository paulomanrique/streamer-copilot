import type { ChatMessage, ChatMessageContentPart, StreamEvent } from '../../shared/types.js';
import type { PlatformRole } from '../../shared/platform.js';
import type { PlatformCapabilities } from '../../shared/moderation.js';
import { resolveFromRole } from '../../modules/commands/permission-utils.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';

type KickPayloadRecord = Record<string, unknown>;

type BrowserWindowRuntime = {
  destroy: () => void;
  isDestroyed: () => boolean;
  on?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  loadURL: (url: string, options?: { userAgent?: string }) => Promise<void>;
  webContents: {
    on: (eventName: string, listener: (...args: unknown[]) => void) => void;
    executeJavaScript: (script: string, userGesture?: boolean) => Promise<unknown>;
  };
};

export interface KickChatAdapterOptions {
  channelSlug?: string;
  chatroomId?: number | string;
  broadcasterUserId?: number | null;
  apiBaseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  oauthToken?: KickOAuthToken;
  fetchFn?: typeof fetch;
}

interface KickOAuthToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken?: string;
  scope?: string;
  expiresAt: number;
}

const DEFAULT_API_BASE_URL = 'https://kick.com/api/v2';
const DEFAULT_PUBLIC_API_BASE_URL = 'https://api.kick.com/public/v1';
const DEFAULT_OAUTH_BASE_URL = 'https://id.kick.com';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
export const KICK_SESSION_PARTITION = 'persist:streamer-copilot-kick';
export const KICK_BROWSER_USER_AGENT = DEFAULT_USER_AGENT;

export class KickChatAdapter implements PlatformChatAdapter {
  readonly platform = 'kick' as const;
  capabilities: PlatformCapabilities = READ_ONLY_CAPABILITIES;
  moderation?: import('../../shared/moderation.js').ModerationApi;

  setModeration(api: import('../../shared/moderation.js').ModerationApi, capabilities: PlatformCapabilities): void {
    this.moderation = api;
    this.capabilities = capabilities;
  }

  private readonly messageHandlers = new Set<(message: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(event: StreamEvent) => void>();
  private readonly seenMessageKeys = new Set<string>();
  private window: BrowserWindowRuntime | null = null;
  private chatroomId: number | null = null;
  private connected = false;

  constructor(private readonly options: KickChatAdapterOptions = {}) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    if (!this.options.channelSlug) {
      throw new Error('Kick channel slug is required to load the popout chat');
    }

    const browserWindow = await this.createBrowserWindow();
    if (!browserWindow) {
      throw new Error('Kick adapter could not create the scraper window');
    }

    this.window = browserWindow;
    browserWindow.webContents.on('console-message', (...args: unknown[]) => {
      const raw = args[2];
      const message = typeof raw === 'string' ? raw : '';
      this.handleConsoleMessage(message);
    });

    const kickUrl = `https://kick.com/popout/${encodeURIComponent(this.options.channelSlug)}/chat`;
    await browserWindow.loadURL(kickUrl, { userAgent: DEFAULT_USER_AGENT });
    await this.injectScraper();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.chatroomId = null;
    this.seenMessageKeys.clear();

    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Kick adapter is not connected to a live chatroom');
    }

    const sentViaDom = await this.sendMessageThroughPopout(content);
    if (sentViaDom) {
      return;
    }

    const client = await this.createSendClient();
    if (client) {
      await client.postMessage(content);
      return;
    }

    throw new Error('Kick chat sending requires Kick OAuth authorization with chat:write scope');
  }

  private async sendMessageThroughPopout(content: string): Promise<boolean> {
    if (!this.window || this.window.isDestroyed()) return false;

    const escaped = JSON.stringify(content);

    try {
      const sent = await this.window.webContents.executeJavaScript(
        `(async () => {
          const payload = ${escaped};
          const input = document.querySelector('[data-testid="chat-input"][contenteditable="true"]');
          const button = document.querySelector('#send-message-button');
          if (!(input instanceof HTMLElement) || !(button instanceof HTMLElement)) {
            return false;
          }

          const readValue = () => {
            if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
              return input.value.trim();
            }
            return (input.textContent || '').trim();
          };

          input.focus();
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(input);
          selection?.removeAllRanges();
          selection?.addRange(range);

          document.execCommand?.('insertText', false, payload);
          input.textContent = payload;
          input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            data: payload,
            inputType: 'insertText',
          }));

          if (button.matches(':disabled') || button.getAttribute('aria-disabled') === 'true') {
            return false;
          }

          button.click();

          return await new Promise((resolve) => {
            const startedAt = Date.now();
            const poll = () => {
              const current = readValue();
              if (!current || current !== payload) {
                resolve(true);
                return;
              }
              if (Date.now() - startedAt > 1500) {
                resolve(false);
                return;
              }
              setTimeout(poll, 100);
            };
            setTimeout(poll, 100);
          });
        })()`,
        true,
      );

      return sent === true;
    } catch (err) {
      console.warn('[kick] sendMessage failed:', err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onEvent(handler: (event: StreamEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private async createBrowserWindow(): Promise<BrowserWindowRuntime | null> {
    try {
      const importer = new Function('return import("electron")') as () => Promise<{
        BrowserWindow?: new (options: Record<string, unknown>) => BrowserWindowRuntime;
        default?: { BrowserWindow?: new (options: Record<string, unknown>) => BrowserWindowRuntime };
      }>;
      const module = await importer();
      const BrowserWindowCtor = module.BrowserWindow ?? module.default?.BrowserWindow;
      if (typeof BrowserWindowCtor !== 'function') return null;

      return new BrowserWindowCtor({
        width: 460,
        height: 760,
        show: false,
        autoHideMenuBar: true,
        title: 'Kick Chat (Debug)',
        webPreferences: {
          partition: KICK_SESSION_PARTITION,
          offscreen: true,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
      });
    } catch (err) {
      console.warn('[kick] Failed to create BrowserWindow:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  private handleConsoleMessage(message: string): void {
    if (!message) return;

    if (message.startsWith('COPILOT_CHAT:')) {
      try {
        const raw = JSON.parse(message.slice('COPILOT_CHAT:'.length)) as {
          id?: string;
          author?: string;
          content?: string;
          contentParts?: ChatMessageContentPart[];
          timestampLabel?: string;
          badges?: string[];
          isInitial?: boolean;
        };
        const author = typeof raw.author === 'string' && raw.author.trim() ? raw.author.trim() : 'Kick user';
        const content = typeof raw.content === 'string' ? raw.content.trim() : '';
        if (!content) return;
        const timestampLabel = typeof raw.timestampLabel === 'string' && raw.timestampLabel.trim()
          ? raw.timestampLabel.trim()
          : this.formatTimestamp(new Date());
        const id = typeof raw.id === 'string' && raw.id.trim()
          ? raw.id.trim()
          : `${author}:${content}:${timestampLabel}`;

        if (this.seenMessageKeys.has(id)) return;
        this.seenMessageKeys.add(id);
        const badges = Array.isArray(raw.badges) ? raw.badges.filter((b): b is string => typeof b === 'string') : [];
        const role = this.deriveRoleFromBadges(badges);
        this.emitMessage({
          id,
          platform: 'kick',
          author,
          content,
          contentParts: Array.isArray(raw.contentParts) ? raw.contentParts : undefined,
          badges,
          timestampLabel,
          role,
          unifiedLevel: resolveFromRole(role),
          ...(raw.isInitial ? { isHistory: true } : {}),
        });
      } catch {
        // Ignore malformed scraper logs.
      }
      return;
    }

    if (message.startsWith('COPILOT_EVENT:')) {
      try {
        const raw = JSON.parse(message.slice('COPILOT_EVENT:'.length)) as StreamEvent;
        this.emitEvent(raw);
      } catch {
        // Ignore malformed scraper logs.
      }
    }
  }

  /* eslint-disable no-useless-escape -- regex escapes (\s) inside template literal are needed at runtime */
  private async injectScraper(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;

    const script = `
      (() => {
        if (window.__COPILOT_KICK_SCRAPER__) {
          window.__COPILOT_KICK_SCRAPER__.scan?.();
          return true;
        }

        const state = {
          seen: new Set(),
          messageRoot: null,
          messageObserver: null,
          bodyObserver: null,
          connectionLogged: false,
          initialScanDone: false,
        };
        window.__COPILOT_KICK_SCRAPER__ = state;

        const normalizeText = (value) => (value || '').replace(/\s+/g, ' ').trim();

        const log = (value) => {
          console.log('COPILOT_LOG:' + value);
        };

        const emitChat = (payload) => {
          console.log('COPILOT_CHAT:' + JSON.stringify(payload));
        };

        const acceptCookies = () => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const button = buttons.find((candidate) => /accept all/i.test(candidate.textContent || ''));
          button?.click();
        };

        const compactParts = (parts) => {
          const next = [];
          for (const part of parts) {
            if (!part) continue;
            if (part.type === 'text') {
              const text = part.text.replace(/\s+/g, ' ');
              if (!text) continue;
              const previous = next[next.length - 1];
              if (previous && previous.type === 'text') {
                previous.text += text;
              } else {
                next.push({ type: 'text', text });
              }
              continue;
            }
            next.push(part);
          }

          if (next[0]?.type === 'text') next[0].text = next[0].text.replace(/^\s+/, '');
          const last = next[next.length - 1];
          if (last?.type === 'text') last.text = last.text.replace(/\s+$/, '');
          return next.filter((part) => part.type !== 'text' || part.text.length > 0);
        };

        const extractEmotePart = (element) => {
          if (!(element instanceof HTMLElement)) return null;
          const emote = element.matches('[data-emote-name]')
            ? element
            : element.querySelector('[data-emote-name]');
          const image = element instanceof HTMLImageElement
            ? element
            : element.querySelector('img');
          const name = normalizeText(emote?.dataset?.emoteName || (image instanceof HTMLImageElement ? image.alt : ''));
          if (!name) return null;
          return {
            type: 'emote',
            name,
            imageUrl: image instanceof HTMLImageElement ? (image.currentSrc || image.src || undefined) : undefined,
          };
        };

        const extractContentParts = (contentNode) => {
          if (!contentNode) return [];
          const parts = [];

          const visit = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              parts.push({ type: 'text', text: node.textContent || '' });
              return;
            }
            if (!(node instanceof HTMLElement)) return;

            const emotePart = extractEmotePart(node);
            if (emotePart) {
              parts.push(emotePart);
              return;
            }

            for (const child of node.childNodes) {
              visit(child);
            }
          };

          visit(contentNode);
          return compactParts(parts);
        };

        const stringifyContent = (parts) => {
          return normalizeText(parts.map((part) => part.type === 'text' ? part.text : ':' + part.name + ':').join(''));
        };

        const findMessageBody = (wrapper) => {
          const containers = Array.from(wrapper.querySelectorAll('div'));
          return containers.find((candidate) => candidate.querySelector('button.inline.font-bold[data-prevent-expand="true"]')) || null;
        };

        const extractBadges = (wrapper) => {
          const badges = [];
          const body = findMessageBody(wrapper) || wrapper;
          const imgs = body.querySelectorAll('img');
          for (const img of imgs) {
            const hint = (img.alt + ' ' + (img.getAttribute('title') || '') + ' ' + img.src).toLowerCase();
            if (/\\bmod(erator)?\\b/.test(hint)) { badges.push('moderator'); continue; }
            if (/\\bowner\\b|\\bbroadcaster\\b/.test(hint)) { badges.push('broadcaster'); continue; }
            if (/\\bvip\\b/.test(hint)) { badges.push('vip'); continue; }
            if (/\\bsub(scriber)?\\b/.test(hint)) { badges.push('subscriber'); continue; }
          }
          const svgBadges = body.querySelectorAll('[class*="badge"], [data-e2e*="badge"]');
          for (const el of svgBadges) {
            const hint = ((el.getAttribute('data-e2e') || '') + ' ' + el.className).toLowerCase();
            if (/mod/.test(hint) && !badges.includes('moderator')) badges.push('moderator');
            else if (/vip/.test(hint) && !badges.includes('vip')) badges.push('vip');
            else if (/sub/.test(hint) && !badges.includes('subscriber')) badges.push('subscriber');
          }
          return badges;
        };

        const processMessageNode = (node) => {
          if (!(node instanceof HTMLElement)) return;
          const wrapper = node.matches('[data-index]') ? node : node.closest('[data-index]');
          if (!(wrapper instanceof HTMLElement)) return;
          if (wrapper.dataset.index === '0') return;

          const body = findMessageBody(wrapper) || wrapper;
          const authorButton = body.querySelector('button.inline.font-bold[data-prevent-expand="true"]');
          if (!(authorButton instanceof HTMLButtonElement)) return;

          const timestampNode = body.querySelector('span.text-neutral');
          const contentNode = Array.from(body.querySelectorAll('span')).find((candidate) => {
            const className = typeof candidate.className === 'string' ? candidate.className : '';
            return className.includes('font-normal');
          });

          const author = normalizeText(authorButton.textContent);
          const contentParts = extractContentParts(contentNode);
          const content = stringifyContent(contentParts);
          const timestampLabel = normalizeText(timestampNode?.textContent) || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          if (!author || !content) return;

          const replyContext = body.querySelector('button.w-full.min-w-0.shrink-0.truncate');
          const replyText = normalizeText(replyContext?.textContent);
          const id = normalizeText([timestampLabel, author, content, replyText].filter(Boolean).join('|'));
          if (!id || state.seen.has(id)) return;
          state.seen.add(id);

          emitChat({ id, author, content, contentParts, timestampLabel, badges: extractBadges(wrapper), isInitial: !state.initialScanDone });
        };

        const scan = () => {
          acceptCookies();
          const footerText = normalizeText(document.querySelector('#chatroom-footer')?.textContent);
          if (footerText.includes('Connection to chat failed') && !state.connectionLogged) {
            state.connectionLogged = true;
            log('Kick popout reported a temporary chat connection failure.');
          }

          const root = document.querySelector('#chatroom-messages');
          if (!(root instanceof HTMLElement)) return;

          if (state.messageRoot !== root) {
            state.messageObserver?.disconnect?.();
            state.messageRoot = root;
            state.messageObserver = new MutationObserver((mutations) => {
              for (const mutation of mutations) {
                for (const addedNode of mutation.addedNodes) {
                  processMessageNode(addedNode);
                  if (addedNode instanceof HTMLElement) {
                    addedNode.querySelectorAll?.('[data-index]').forEach(processMessageNode);
                  }
                }
              }
            });
            state.messageObserver.observe(root, { childList: true, subtree: true });
          }

          root.querySelectorAll('[data-index]').forEach(processMessageNode);
        };

        state.scan = scan;
        state.bodyObserver = new MutationObserver(() => scan());
        state.bodyObserver.observe(document.body, { childList: true, subtree: true });

        scan();
        state.initialScanDone = true;
        setInterval(scan, 2000);
        log('Kick DOM scraper injected');
        return true;
      })();
    `;

    await this.window.webContents.executeJavaScript(script, true);
  }
  /* eslint-enable no-useless-escape */

  private async createSendClient(): Promise<{ postMessage: (content: string) => Promise<void> } | null> {
    if (!this.options.clientId || !this.options.clientSecret || !this.options.oauthToken || !this.options.broadcasterUserId) return null;

    try {
      const importer = new Function('return import("@nekiro/kick-api")') as () => Promise<{
        client?: new (options: { clientId: string; clientSecret: string }) => {
          setToken?: (token: KickOAuthToken) => void;
          chat: { postMessage: (input: { type: 'bot' | 'user'; content: string; broadcaster_user_id?: number }) => Promise<void> };
        };
      }>;
      const module = await importer();
      const KickClient = module.client;
      if (typeof KickClient !== 'function') return null;
      const kickClient = new KickClient({
        clientId: this.options.clientId,
        clientSecret: this.options.clientSecret,
      });
      kickClient.setToken?.(this.options.oauthToken);
      return {
        postMessage: async (content: string) => {
          await kickClient.chat.postMessage({
            type: 'user',
            broadcaster_user_id: this.options.broadcasterUserId ?? undefined,
            content,
          });
        },
      };
    } catch {
      return null;
    }
  }

  private async resolveChatroomId(): Promise<number | null> {
    if (this.chatroomId !== null) return this.chatroomId;
    if (this.options.chatroomId !== undefined) {
      const parsed = Number(this.options.chatroomId);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (!this.options.channelSlug) return null;

    const officialApiId = await this.resolveChannelIdFromOfficialApi();
    if (officialApiId !== null) {
      return officialApiId;
    }

    const fetchFn = this.options.fetchFn ?? fetch;
    const baseApi = this.options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    const slug = encodeURIComponent(this.options.channelSlug);
    const endpoints = [`${baseApi}/channels/${slug}/chatroom`, `${baseApi}/channels/${slug}`];

    for (const endpoint of endpoints) {
      let response: Response;
      try {
        response = await fetchFn(endpoint, {
          headers: {
            accept: 'application/json',
          },
        });
      } catch {
        continue;
      }

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as KickPayloadRecord;
      const chatroom = payload.chatroom && typeof payload.chatroom === 'object'
        ? (payload.chatroom as KickPayloadRecord)
        : undefined;
      const livestream = payload.livestream && typeof payload.livestream === 'object'
        ? (payload.livestream as KickPayloadRecord)
        : undefined;
      const data = payload.data && typeof payload.data === 'object'
        ? (payload.data as KickPayloadRecord)
        : undefined;

      const candidates = [
        payload.id,
        payload.chatroom_id,
        payload.chatroomId,
        chatroom?.id,
        chatroom?.chatroom_id,
        livestream?.chatroom_id,
        data?.id,
        data?.chatroom_id,
      ];

      for (const candidate of candidates) {
        const parsed = this.parseNumericId(candidate);
        if (parsed !== null) return parsed;
      }
    }

    return null;
  }

  private async resolveChannelIdFromOfficialApi(): Promise<number | null> {
    if (!this.options.channelSlug || !this.options.clientId || !this.options.clientSecret) {
      return null;
    }

    const fetchFn = this.options.fetchFn ?? fetch;
    const token = await this.fetchOfficialAccessToken(fetchFn);
    if (!token) return null;

    const slug = encodeURIComponent(this.options.channelSlug);
    let response: Response;
    try {
      response = await fetchFn(`${DEFAULT_PUBLIC_API_BASE_URL}/channels?slug=${slug}`, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
        },
      });
    } catch {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as KickPayloadRecord;
    const wrappedData = Array.isArray(payload.data) ? payload.data : [];
    const channel = wrappedData.find((entry) => typeof entry === 'object' && entry !== null);
    const channelRecord = (channel ?? payload) as KickPayloadRecord;

    return this.parseNumericId(channelRecord.broadcaster_user_id)
      ?? this.parseNumericId(channelRecord.id)
      ?? null;
  }

  private async fetchOfficialAccessToken(fetchFn: typeof fetch): Promise<string | null> {
    try {
      const response = await fetchFn(`${DEFAULT_OAUTH_BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.options.clientId ?? '',
          client_secret: this.options.clientSecret ?? '',
        }),
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as KickPayloadRecord;
      return typeof payload.access_token === 'string' && payload.access_token.trim()
        ? payload.access_token
        : null;
    } catch {
      return null;
    }
  }

  private emitMessage(message: ChatMessage): void {
    for (const handler of this.messageHandlers) {
      handler(message);
    }
  }

  private emitEvent(event: StreamEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  private deriveRoleFromBadges(badges: string[]): PlatformRole {
    const set = new Set(badges.map((b) => b.toLowerCase()));
    const extras: Record<string, unknown> = {};
    if (set.has('og')) extras.og = true;
    if (set.has('founder')) extras.founder = true;
    if (set.has('verified')) extras.verified = true;
    return {
      broadcaster: set.has('broadcaster'),
      moderator: set.has('moderator'),
      vip: set.has('vip'),
      subscriber: set.has('subscriber'),
      // Kick scraper today doesn't tag follower-only state.
      extras: Object.keys(extras).length > 0 ? extras : undefined,
    };
  }

  private parseNumericId(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private formatTimestamp(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

export function createKickChatAdapter(options: KickChatAdapterOptions = {}): KickChatAdapter {
  return new KickChatAdapter(options);
}
