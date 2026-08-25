import type { XChatMessage } from './x-chat-client.js';

type BrowserWindowRuntime = {
  destroy: () => void;
  isDestroyed: () => boolean;
  loadURL: (url: string, options?: { userAgent?: string }) => Promise<void>;
  webContents: {
    on: (eventName: string, listener: (...args: unknown[]) => void) => void;
    executeJavaScript: (script: string, userGesture?: boolean) => Promise<unknown>;
    setAudioMuted: (muted: boolean) => void;
  };
};

export interface XDomChatMessage extends XChatMessage {
  isInitial: boolean;
}

const X_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const CONSOLE_PREFIX = 'COPILOT_X_CHAT:';
const LOG_PREFIX = 'COPILOT_X_LOG:';

export function parseXDomChatConsoleMessage(message: string): XDomChatMessage | null {
  if (!message.startsWith(CONSOLE_PREFIX)) return null;
  try {
    const raw = JSON.parse(message.slice(CONSOLE_PREFIX.length)) as Partial<XDomChatMessage>;
    const username = typeof raw.username === 'string' ? raw.username.trim().replace(/^@/, '') : '';
    const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : '';
    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    const timestampMs = typeof raw.timestampMs === 'number' && Number.isFinite(raw.timestampMs)
      ? raw.timestampMs
      : Date.now();
    const uuid = typeof raw.uuid === 'string' && raw.uuid.trim()
      ? raw.uuid.trim()
      : `dom:${username}:${timestampMs}:${text}`;
    if (!username || !text) return null;
    return {
      username,
      displayName: displayName || username,
      text,
      timestampMs,
      uuid,
      isInitial: raw.isInitial === true,
    };
  } catch {
    return null;
  }
}

export class XDomChatScraper {
  private window: BrowserWindowRuntime | null = null;

  constructor(
    private readonly onMessage: (message: XDomChatMessage) => void,
    private readonly log?: (message: string) => void,
  ) {}

  async start(broadcastUrl: string): Promise<void> {
    this.stop();
    const browserWindow = await this.createBrowserWindow();
    if (!browserWindow) throw new Error('X adapter could not create the chat scraper window');
    this.window = browserWindow;
    browserWindow.webContents.setAudioMuted(true);
    browserWindow.webContents.on('console-message', (...args: unknown[]) => {
      const message = typeof args[2] === 'string' ? args[2] : '';
      if (message.startsWith(LOG_PREFIX)) {
        this.log?.(message.slice(LOG_PREFIX.length));
        return;
      }
      const parsed = parseXDomChatConsoleMessage(message);
      if (parsed) this.onMessage(parsed);
    });
    await browserWindow.loadURL(broadcastUrl, { userAgent: X_BROWSER_USER_AGENT });
    await this.injectScraper();
  }

  stop(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
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
        // X hides the broadcast chat entirely at mobile/narrow breakpoints.
        width: 1440,
        height: 900,
        show: false,
        autoHideMenuBar: true,
        title: 'X Chat',
        webPreferences: {
          offscreen: true,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
          backgroundThrottling: false,
        },
      });
    } catch (cause) {
      this.log?.(`X chat scraper window failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      return null;
    }
  }

  private async injectScraper(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;
    const script = `
      (() => {
        if (window.__COPILOT_X_CHAT_SCRAPER__) {
          window.__COPILOT_X_CHAT_SCRAPER__.scan?.();
          return true;
        }

        const avatarSelector = '[data-testid^="UserAvatar-Container-"]';
        const state = {
          seenRows: new WeakSet(),
          observer: null,
          bodyObserver: null,
          root: null,
          initialScanDone: false,
          sequence: 0,
          statusLogged: false,
        };
        window.__COPILOT_X_CHAT_SCRAPER__ = state;

        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
        const textWithEmoji = (node) => {
          if (!node) return '';
          if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
          if (!(node instanceof Element)) return '';
          if (node instanceof HTMLImageElement && node.alt) return node.alt;
          return Array.from(node.childNodes).map(textWithEmoji).join('');
        };

        const findRoot = () => {
          const inputs = Array.from(document.querySelectorAll('textarea'));
          for (const input of inputs) {
            let candidate = input.parentElement;
            while (candidate && candidate.querySelectorAll(avatarSelector).length < 2) {
              candidate = candidate.parentElement;
            }
            if (candidate) return candidate;
          }
          return null;
        };

        const findRow = (avatar, root) => {
          let row = avatar;
          while (row.parentElement && row.parentElement !== root
            && row.parentElement.querySelectorAll(avatarSelector).length === 1) {
            row = row.parentElement;
          }
          return row;
        };

        const parseRow = (row, isInitial) => {
          if (state.seenRows.has(row)) return null;
          state.seenRows.add(row);
          const links = Array.from(row.querySelectorAll('a[href^="/"]'));
          const handleLink = links.find((link) => /^@[A-Za-z0-9_]+$/.test(normalize(link.textContent)));
          const username = normalize(handleLink?.textContent).replace(/^@/, '');
          if (!username || !handleLink) return null;
          const displayLink = links.find((link) => {
            const value = normalize(link.textContent);
            return value && !value.startsWith('@');
          });
          const contentRoot = handleLink.closest('div[dir]');
          const messageNodes = contentRoot
            ? Array.from(contentRoot.children).filter((child) => !child.contains(handleLink))
            : [];
          let text = normalize(messageNodes.map(textWithEmoji).join(' '));
          if (!text) {
            const rowText = normalize(textWithEmoji(row));
            const handleMarker = '@' + username;
            const markerIndex = rowText.indexOf(handleMarker);
            if (markerIndex >= 0) text = normalize(rowText.slice(markerIndex + handleMarker.length));
          }
          if (!text) return null;
          const timestampMs = Date.now();
          state.sequence += 1;
          return {
            username,
            displayName: normalize(displayLink?.textContent) || username,
            text,
            timestampMs,
            uuid: 'dom:' + username + ':' + timestampMs + ':' + state.sequence,
            isInitial,
          };
        };

        const emit = (payload) => console.log('${CONSOLE_PREFIX}' + JSON.stringify(payload));
        const scan = () => {
          const root = findRoot();
          if (!root) {
            if (!state.statusLogged) {
              state.statusLogged = true;
              setTimeout(() => {
                if (!state.root) {
                  const inputs = Array.from(document.querySelectorAll('textarea')).map((input) => input.getAttribute('aria-label'));
                  console.log('${LOG_PREFIX}X chat scraper is waiting for the chat panel ' + JSON.stringify({
                    path: location.pathname,
                    title: document.title,
                    avatarCount: document.querySelectorAll(avatarSelector).length,
                    textareaLabels: inputs,
                  }));
                }
              }, 8_000);
            }
            return false;
          }
          if (state.root !== root) {
            state.observer?.disconnect();
            state.root = root;
            state.initialScanDone = false;
            state.observer = new MutationObserver(() => scan());
            state.observer.observe(root, { childList: true, subtree: true });
            console.log('${LOG_PREFIX}X chat scraper attached to ' + root.querySelectorAll(avatarSelector).length + ' visible rows');
          }
          const isInitial = !state.initialScanDone;
          const rows = Array.from(root.querySelectorAll(avatarSelector)).map((avatar) => findRow(avatar, root));
          for (const row of rows) {
            const payload = parseRow(row, isInitial);
            if (payload) emit(payload);
          }
          state.initialScanDone = true;
          document.querySelectorAll('video').forEach((video) => {
            video.muted = true;
            video.pause();
          });
          return true;
        };
        state.scan = scan;
        state.bodyObserver = new MutationObserver(() => scan());
        state.bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
        scan();
        return true;
      })()
    `;
    await this.window.webContents.executeJavaScript(script, true);
  }
}
