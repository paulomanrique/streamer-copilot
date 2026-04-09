import { BrowserWindow } from 'electron';
import type { ChatMessage, ChatBadge } from '../shared/types.js';

export interface YouTubeScraperOptions {
  videoId: string;
  onMessage: (message: Omit<ChatMessage, 'id' | 'timestampLabel'>) => void;
  onLog?: (message: string) => void;
}

export class YouTubeScraper {
  private window: BrowserWindow | null = null;
  private isDestroyed = false;

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
          });
        } catch (e) {
          this.options.onLog?.(`Failed to parse scraped message: ${String(e)}`);
        }
      } else if (message.startsWith('COPILOT_LOG:')) {
        this.options.onLog?.(message.substring('COPILOT_LOG:'.length).trim());
      }
    });

    // Fallback injection
    setTimeout(() => {
      if (this.isDestroyed || !this.window) return;
      void this.injectScraper();
    }, 5000);
  }

  stop(): void {
    this.isDestroyed = true;
    if (this.window) {
      this.window.destroy();
      this.window = null;
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
        let lastMutationTime = Date.now();
        
        function processElement(el) {
          if (!el || el.nodeType !== 1) return;
          
          const tag = el.tagName.toLowerCase();
          if (tag === 'yt-live-chat-text-message-renderer' || tag === 'yt-live-chat-paid-message-renderer') {
            const id = el.getAttribute('id');
            if (!id) return;
            if (seenIds.has(id)) return;
            seenIds.add(id);

            let author = el.querySelector('#author-name')?.textContent?.trim() || 'Anonymous';
            if (author.startsWith('@')) author = author.substring(1);

            const content = el.querySelector('#message')?.textContent?.trim() || '';
            if (!content) return;

            const imgEl = el.querySelector('#author-photo img') || el.querySelector('img#img');
            const avatarUrl = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src')) : undefined;

            const badges = [];
            const memberBadge = el.querySelector('yt-live-chat-author-badge-renderer[type="member"]');
            if (memberBadge && memberBadge.children.length > 0) badges.push('member');
            
            if (el.querySelector('yt-live-chat-author-badge-renderer[type="moderator"]') || el.innerHTML.includes('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8z')) {
              badges.push('moderator');
            }

            console.log('COPILOT_CHAT:' + JSON.stringify({ author, content, badges, avatarUrl }));
          }
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
          lastMutationTime = Date.now();
          for (const mutation of mutations) {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === 1) {
                processElement(node);
                // Deep search in case of batch updates
                node.querySelectorAll?.('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer')
                    .forEach(processElement);
              }
            });
          }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        console.log('COPILOT_LOG: Body observer active');

        // Initial sweep
        document.querySelectorAll('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer')
                .forEach(processElement);

        // Auto-switch and maintain
        setInterval(switchToLiveChat, 5000);
        
        // Health check: if no mutations for 30s, something might be wrong
        setInterval(() => {
          if (Date.now() - lastMutationTime > 30000) {
            console.log('COPILOT_LOG: No activity for 30s, checking chat health...');
            switchToLiveChat();
          }
        }, 15000);

      })();
    `;

    await this.window.webContents.executeJavaScript(script);
  }
}
