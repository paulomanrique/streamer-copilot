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

interface XDomSendResult {
  sent: boolean;
  reason?: string;
}

export interface XDomChatSender {
  username: string;
  displayName: string;
}

interface PendingSenderWaiter {
  content: string;
  finish: (sender: XDomChatSender | null) => void;
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
  private readonly pendingSenderWaiters = new Set<PendingSenderWaiter>();

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
      this.handleConsoleMessage(message);
    });
    try {
      await browserWindow.loadURL(broadcastUrl, { userAgent: X_BROWSER_USER_AGENT });
      await this.injectScraper();
    } catch (cause) {
      this.stop();
      throw cause;
    }
  }

  stop(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    for (const waiter of [...this.pendingSenderWaiters]) waiter.finish(null);
  }

  async sendMessage(content: string): Promise<XDomChatSender | null> {
    const payload = content.trim();
    if (!payload) throw new Error('X chat message cannot be empty');
    if (!this.window || this.window.isDestroyed()) {
      throw new Error('X chat page is not connected');
    }

    const senderWaiter = this.createSenderWaiter(payload);

    let result: XDomSendResult | null;
    try {
      result = await this.window.webContents.executeJavaScript(
        this.buildSendScript(payload),
        true,
      ) as XDomSendResult | null;
    } catch (cause) {
      senderWaiter.cancel();
      throw cause;
    }

    if (result?.sent === true) return senderWaiter.promise;
    senderWaiter.cancel();
    if (result?.reason === 'input-not-found') {
      throw new Error('Log in to X in Platforms before sending messages.');
    }
    if (result?.reason === 'rejected') {
      throw new Error('X did not accept the chat message. Check the account session and chat permissions.');
    }
    throw new Error('X chat message could not be sent');
  }

  private handleConsoleMessage(message: string): void {
    if (message.startsWith(LOG_PREFIX)) {
      this.log?.(message.slice(LOG_PREFIX.length));
      return;
    }
    const parsed = parseXDomChatConsoleMessage(message);
    if (!parsed) return;
    if (!parsed.isInitial) {
      const waiter = [...this.pendingSenderWaiters].find((candidate) => candidate.content === parsed.text);
      waiter?.finish({ username: parsed.username, displayName: parsed.displayName });
    }
    this.onMessage(parsed);
  }

  private createSenderWaiter(content: string): {
    promise: Promise<XDomChatSender | null>;
    cancel: () => void;
  } {
    let finish!: (sender: XDomChatSender | null) => void;
    const promise = new Promise<XDomChatSender | null>((resolve) => {
      const waiter: PendingSenderWaiter = {
        content,
        finish: (sender) => {
          if (!this.pendingSenderWaiters.delete(waiter)) return;
          clearTimeout(timeout);
          resolve(sender);
        },
      };
      finish = waiter.finish;
      const timeout = setTimeout(() => waiter.finish(null), 2_000);
      this.pendingSenderWaiters.add(waiter);
    });
    return { promise, cancel: () => finish(null) };
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
          const current = window.__COPILOT_X_CHAT_SCRAPER__;
          if (current.scheduleScan) current.scheduleScan();
          else current.scan?.();
          return true;
        }

        const avatarSelector = '[data-testid^="UserAvatar-Container-"]';
        const state = {
          seenRows: new WeakSet(),
          observer: null,
          root: null,
          initialScanDone: false,
          sequence: 0,
          statusLogged: false,
          scanTimer: null,
          maintenanceTimer: null,
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
        const quietVideos = () => {
          document.querySelectorAll('video').forEach((video) => {
            video.muted = true;
            video.pause();
          });
        };
        const scan = () => {
          const root = state.root?.isConnected ? state.root : findRoot();
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
            state.observer = new MutationObserver(() => scheduleScan());
            state.observer.observe(root, { childList: true, subtree: true });
            console.log('${LOG_PREFIX}X chat scraper attached to ' + root.querySelectorAll(avatarSelector).length + ' visible rows');
            quietVideos();
          }
          const isInitial = !state.initialScanDone;
          const rows = Array.from(root.querySelectorAll(avatarSelector)).map((avatar) => findRow(avatar, root));
          for (const row of rows) {
            const payload = parseRow(row, isInitial);
            if (payload) emit(payload);
          }
          state.initialScanDone = true;
          return true;
        };
        const scheduleScan = () => {
          if (state.scanTimer !== null) return;
          state.scanTimer = setTimeout(() => {
            state.scanTimer = null;
            scan();
          }, 50);
        };
        state.scan = scan;
        state.scheduleScan = scheduleScan;
        // The chat root has its own coalesced observer. A low-frequency timer
        // only rediscovers the root after X replaces the panel and keeps media
        // paused, avoiding a whole-page scan for every unrelated DOM mutation.
        state.maintenanceTimer = setInterval(() => {
          quietVideos();
          if (!state.root?.isConnected) {
            state.root = null;
            scheduleScan();
          }
        }, 2_000);
        scan();
        return true;
      })()
    `;
    await this.window.webContents.executeJavaScript(script, true);
  }

  private buildSendScript(content: string): string {
    const escaped = JSON.stringify(content);
    return `
      (async () => {
        const payload = ${escaped};
        const visible = (element) => element instanceof HTMLElement
          && element.getClientRects().length > 0
          && getComputedStyle(element).visibility !== 'hidden';
        const inputs = Array.from(document.querySelectorAll('textarea'));
        const input = inputs.find((candidate) => visible(candidate)
          && !candidate.disabled
          && !candidate.readOnly
          && candidate.getAttribute('aria-hidden') !== 'true');
        if (!(input instanceof HTMLTextAreaElement)) {
          return { sent: false, reason: 'input-not-found' };
        }

        input.focus();
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (valueSetter) valueSetter.call(input, payload);
        else input.value = payload;
        input.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          composed: true,
          data: payload,
          inputType: 'insertText',
        }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        const waitForClear = (timeoutMs) => new Promise((resolve) => {
          const startedAt = Date.now();
          const poll = () => {
            if (!input.isConnected || input.value.trim() !== payload) {
              resolve(true);
              return;
            }
            if (Date.now() - startedAt >= timeoutMs) {
              resolve(false);
              return;
            }
            setTimeout(poll, 50);
          };
          setTimeout(poll, 50);
        });

        for (const eventName of ['keydown', 'keypress', 'keyup']) {
          input.dispatchEvent(new KeyboardEvent(eventName, {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            composed: true,
            cancelable: true,
          }));
        }
        if (await waitForClear(500)) return { sent: true };

        let scope = input.parentElement;
        let sendButton = null;
        for (let depth = 0; scope && depth < 6; depth += 1, scope = scope.parentElement) {
          const buttons = Array.from(scope.querySelectorAll('button')).filter((button) => visible(button)
            && !button.disabled
            && button.getAttribute('aria-disabled') !== 'true');
          const preferred = buttons.find((button) => {
            const marker = [
              button.id,
              button.getAttribute('data-testid'),
              button.getAttribute('aria-label'),
              button.getAttribute('title'),
              button.getAttribute('type'),
            ].filter(Boolean).join(' ').toLowerCase();
            return /send|submit|message|chat|post|tweet/.test(marker);
          });
          if (preferred) {
            sendButton = preferred;
            break;
          }
          if (buttons.length === 1) {
            sendButton = buttons[0];
            break;
          }
        }

        if (!sendButton) return { sent: false, reason: 'rejected' };
        sendButton.click();
        return await waitForClear(2_000)
          ? { sent: true }
          : { sent: false, reason: 'rejected' };
      })()
    `;
  }
}
