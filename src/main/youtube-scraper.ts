import { BrowserWindow } from 'electron';
import type { ChatMessage, ChatBadge, StreamEvent } from '../shared/types.js';

export interface YouTubeScraperOptions {
  videoId: string;
  onMessage: (message: Omit<ChatMessage, 'id' | 'timestampLabel'>) => void;
  onEvent?: (event: Omit<StreamEvent, 'id' | 'timestampLabel'>) => void;
  onLog?: (message: string) => void;
}

export class YouTubeScraper {
  private window: BrowserWindow | null = null;
  private isDestroyed = false;
  private reinjectionTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: YouTubeScraperOptions) {}

  async start(): Promise<void> {
    this.window = new BrowserWindow({
      width: 500,
      height: 700,
      show: false,
      title: 'YouTube Chat (Debug)',
      autoHideMenuBar: true,
      webPreferences: {
        offscreen: true,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const url = `https://www.youtube.com/live_chat?v=${this.options.videoId}`;
    
    this.options.onLog?.(`Loading YouTube chat: ${url}`);

    await this.window.loadURL(url, { userAgent });

    this.window.webContents.on('dom-ready', () => {
      if (this.isDestroyed || !this.window) return;
      void this.injectScraper();
    });

    this.window.webContents.on('did-finish-load', () => {
      if (this.isDestroyed || !this.window) return;
      void this.injectScraper();
    });

    this.window.webContents.on('console-message', (event) => {
      const message = event.message;
      if (message.startsWith('COPILOT_CHAT:')) {
        try {
          const raw = JSON.parse(message.substring('COPILOT_CHAT:'.length));
          this.options.onMessage({
            platform: 'youtube',
            author: raw.author,
            content: raw.content,
            badges: raw.badges as ChatBadge[],
            avatarUrl: raw.avatarUrl,
            ...(raw.isInitial ? { isHistory: true } : {}),
          });
        } catch (e) {
          this.options.onLog?.(`Failed to parse scraped message: ${String(e)}`);
        }
      } else if (message.startsWith('COPILOT_EVENT:')) {
        try {
          const raw = JSON.parse(message.substring('COPILOT_EVENT:'.length));
          this.options.onEvent?.({
            platform: 'youtube',
            type: raw.type,
            author: raw.author,
            amount: raw.amount,
            message: raw.message,
          });
        } catch (e) {
          this.options.onLog?.(`Failed to parse scraped event: ${String(e)}`);
        }
      } else if (message.startsWith('COPILOT_LOG:')) {
        this.options.onLog?.(message.substring('COPILOT_LOG:'.length).trim());
      }
    });

    // Fallback injection after initial load
    setTimeout(() => {
      if (this.isDestroyed || !this.window) return;
      void this.injectScraper();
    }, 5000);

    // Periodic re-injection: the injected script clears __COPILOT_SCRAPER_RUNNING__ when it
    // detects a freeze, so this loop picks it up and restores the scraper.
    this.reinjectionTimer = setInterval(() => {
      if (this.isDestroyed || !this.window) return;
      void this.injectScraper();
    }, 45_000);
  }

  stop(): void {
    this.isDestroyed = true;
    if (this.reinjectionTimer) {
      clearInterval(this.reinjectionTimer);
      this.reinjectionTimer = null;
    }
    if (this.window) {
      this.window.destroy();
      this.window = null;
    }
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.window || this.isDestroyed || this.window.isDestroyed()) {
      throw new Error('YouTube scraper window is not available');
    }

    const escaped = JSON.stringify(content);
    const sent = await this.window.webContents.executeJavaScript(
      `
        (function() {
          const payload = ${escaped};
          const input = document.querySelector('#input.yt-live-chat-text-input-field-renderer') || document.querySelector('[contenteditable="true"]');
          const button = document.querySelector('#send-button button') || document.querySelector('yt-button-renderer#send-button button');
          if (!input || !button) return false;

          input.focus();
          if ('value' in input) {
            input.value = payload;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            input.textContent = payload;
            input.dispatchEvent(new InputEvent('input', { bubbles: true, data: payload, inputType: 'insertText' }));
          }

          button.click();
          return true;
        })();
      `,
      true,
    );

    if (!sent) {
      throw new Error('YouTube chat input not available (login or chat DOM not ready)');
    }
  }

  private async injectScraper(): Promise<void> {
    if (!this.window) return;

    const script = `
      (function() {
        if (window.__COPILOT_SCRAPER_RUNNING__) {
          console.log('COPILOT_LOG: Scraper already running, skipping re-injection');
          return;
        }
        window.__COPILOT_SCRAPER_RUNNING__ = true;

        console.log('COPILOT_LOG: YouTube Scraper Deep-Injection Started');

        const seenIds = new Set();
        let lastChatMessageTime = Date.now();
        let initialSweepDone = false;
        
        function processElement(el) {
          if (!el || el.nodeType !== 1) return;

          const tag = el.tagName.toLowerCase();
          const isChat = tag === 'yt-live-chat-text-message-renderer';
          const isPaid = tag === 'yt-live-chat-paid-message-renderer';
          const isPaidSticker = tag === 'yt-live-chat-paid-sticker-renderer';
          const isMembership = tag === 'yt-live-chat-membership-item-renderer';

          if (!isChat && !isPaid && !isPaidSticker && !isMembership) return;

          const id = el.getAttribute('id');
          if (!id) return;
          if (seenIds.has(id)) return;
          seenIds.add(id);

          let author = el.querySelector('#author-name')?.textContent?.trim() || 'Anonymous';
          if (author.startsWith('@')) author = author.substring(1);

          let content = el.querySelector('#message')?.textContent?.trim() || '';

          if (isMembership && !content) {
            content = el.querySelector('#header-subtext')?.textContent?.trim() || 'Novo membro';
          }

          if (isPaid && !content) {
            const amount = el.querySelector('#purchase-amount')?.textContent?.trim();
            content = amount ? 'Superchat: ' + amount : 'Superchat';
          }

          if (isPaidSticker && !content) {
            const amount = el.querySelector('#purchase-amount')?.textContent?.trim();
            content = amount ? 'Super Sticker: ' + amount : 'Super Sticker';
          }

          if (!content) return;

          const imgEl = el.querySelector('#author-photo img') || el.querySelector('img#img');
          const avatarUrl = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src')) : undefined;

          const badges = [];
          const memberBadge = el.querySelector('yt-live-chat-author-badge-renderer[type="member"]');
          if (memberBadge && memberBadge.children.length > 0) badges.push('member');
          if (isMembership) badges.push('member');

          if (el.querySelector('yt-live-chat-author-badge-renderer[type="moderator"]') || el.innerHTML.includes('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8z')) {
            badges.push('moderator');
          }

          if (isPaid || isPaidSticker) {
            const amountText = el.querySelector('#purchase-amount')?.textContent?.trim() || '';
            const message = el.querySelector('#message')?.textContent?.trim()
              || (isPaidSticker ? 'Super Sticker' : amountText ? 'Super Chat' : 'Super Chat');

            console.log('COPILOT_EVENT:' + JSON.stringify({
              type: 'superchat',
              author,
              amount: parseAmount(amountText),
              message: amountText ? message + ' (' + amountText + ')' : message,
            }));
            return;
          }

          lastChatMessageTime = Date.now();
          console.log('COPILOT_CHAT:' + JSON.stringify({ author, content, badges, avatarUrl, isInitial: !initialSweepDone }));
        }

        function parseAmount(raw) {
          if (!raw) return 0;

          const cleaned = raw.replace(/\\s/g, '').replace(/[^0-9,.-]/g, '');
          if (!cleaned) return 0;

          const comma = cleaned.lastIndexOf(',');
          const dot = cleaned.lastIndexOf('.');
          const separator = Math.max(comma, dot);
          const normalized = separator >= 0
            ? cleaned.slice(0, separator).replace(/[^0-9-]/g, '') + '.' + cleaned.slice(separator + 1).replace(/[^0-9]/g, '')
            : cleaned.replace(/[^0-9-]/g, '');
          const value = Number(normalized);

          return Number.isFinite(value) ? value : 0;
        }

        function switchToLiveChat() {
          const menuButton = document.querySelector('#label-text.yt-live-chat-header-renderer') || 
                             document.querySelector('yt-dropdown-menu #label-text');
          
          if (menuButton) {
            const text = menuButton.textContent.toLowerCase();
            if (text.includes('ao vivo') || text.includes('live chat')) return;

            menuButton.click();
            setTimeout(() => {
              const options = document.querySelectorAll('[id="item-with-badge"]');
              if (options && options.length >= 2) {
                options[1].click();
                console.log('COPILOT_LOG: Menu switched to All Messages');
              }
            }, 500);
          }
        }

        // Global observer on body to handle container being destroyed/recreated
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === 1) {
                processElement(node);
                // Deep search in case of batch updates
                node.querySelectorAll?.('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-paid-sticker-renderer, yt-live-chat-membership-item-renderer')
                    .forEach(processElement);
              }
            });
          }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        console.log('COPILOT_LOG: Body observer active');

        // Initial sweep — mark these as history so commands don't fire
        document.querySelectorAll('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-paid-sticker-renderer, yt-live-chat-membership-item-renderer')
                .forEach(processElement);
        initialSweepDone = true;

        // Auto-switch and maintain
        setInterval(switchToLiveChat, 5000);

        // Health check: if no chat messages received in 90s, the scraper may be frozen.
        // Disconnect the observer, clear the running flag, and let the Electron-side re-inject.
        setInterval(() => {
          if (Date.now() - lastChatMessageTime > 90000) {
            console.log('COPILOT_LOG: No chat messages for 90s — releasing scraper for re-injection');
            observer.disconnect();
            window.__COPILOT_SCRAPER_RUNNING__ = false;
          }
        }, 30000);

      })();
    `;

    await this.window.webContents.executeJavaScript(script);
  }
}
