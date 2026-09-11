import { linkedInCommentIdFromUrn, linkedInIdTimestampMs } from '../../shared/linkedin-live.js';

type BrowserWindowRuntime = {
  destroy: () => void;
  isDestroyed: () => boolean;
  loadURL: (url: string, options?: { userAgent?: string }) => Promise<void>;
  webContents: {
    on: (eventName: string, listener: (...args: unknown[]) => void) => void;
    executeJavaScript: (script: string, userGesture?: boolean) => Promise<unknown>;
    sendInputEvent: (event: { type: string; keyCode: string }) => void;
    setAudioMuted: (muted: boolean) => void;
    setFrameRate?: (fps: number) => void;
    getURL: () => string;
    removeAllListeners?: (eventName: string) => void;
  };
};

export interface LinkedInDomComment {
  /** Comment id (snowflake) taken from the row's `urn:li:comment:(…)`. */
  commentId: string;
  name: string;
  /** `/in/<slug>` or `/company/<slug>` — stable author identity. */
  profilePath: string;
  text: string;
  timestampMs: number;
  isInitial: boolean;
}

export interface LinkedInPageState {
  /** The live comments panel is mounted. */
  ready: boolean;
  loginRequired: boolean;
  isLive: boolean;
  viewerCount: number | null;
  /** Page path after LinkedIn's redirects (post links land on the event theater). */
  path: string;
  /** Name on the comment box avatar — the signed-in member. */
  selfName: string | null;
}

export interface LinkedInDomSender {
  profilePath: string;
  name: string;
}

interface PendingSenderWaiter {
  content: string;
  finish: (sender: LinkedInDomSender | null) => void;
}

const LINKEDIN_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const CHAT_PREFIX = 'COPILOT_LINKEDIN_CHAT:';
const STATE_PREFIX = 'COPILOT_LINKEDIN_STATE:';
const LOG_PREFIX = 'COPILOT_LINKEDIN_LOG:';
const BEAT_PREFIX = 'COPILOT_LINKEDIN_BEAT';
const READY_TIMEOUT_MS = 45_000;
const WATCHDOG_INTERVAL_MS = 30_000;
/** The page script beats every 15s; missing several means it's hung or gone. */
const HEARTBEAT_TIMEOUT_MS = 90_000;
/** A live's viewer counter moves every few seconds to a minute. Nothing at all
 *  — no comment, no counter change — for this long means the page's realtime
 *  feed died (e.g. a DNS outage, which never flips navigator.onLine). */
const STALE_LIVE_MS = 5 * 60_000;
const RELOAD_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000];
const LOGIN_PATH = /^\/(?:login|uas\/login|authwall|checkpoint|signup)/;

export class LinkedInLoginRequiredError extends Error {
  constructor() {
    super('Log in to LinkedIn in Platforms before connecting to a live.');
    this.name = 'LinkedInLoginRequiredError';
  }
}

export function parseLinkedInDomCommentMessage(message: string): LinkedInDomComment | null {
  if (!message.startsWith(CHAT_PREFIX)) return null;
  try {
    const raw = JSON.parse(message.slice(CHAT_PREFIX.length)) as Record<string, unknown>;
    const commentId = typeof raw.urn === 'string' ? linkedInCommentIdFromUrn(raw.urn) : null;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    const profilePath = typeof raw.profilePath === 'string' ? raw.profilePath.trim() : '';
    if (!commentId || !name || !text) return null;
    return {
      commentId,
      name,
      profilePath,
      text,
      timestampMs: linkedInIdTimestampMs(commentId) ?? Date.now(),
      isInitial: raw.isInitial === true,
    };
  } catch {
    return null;
  }
}

export function parseLinkedInPageStateMessage(message: string): LinkedInPageState | null {
  if (!message.startsWith(STATE_PREFIX)) return null;
  try {
    const raw = JSON.parse(message.slice(STATE_PREFIX.length)) as Record<string, unknown>;
    return {
      ready: raw.ready === true,
      loginRequired: raw.loginRequired === true,
      isLive: raw.isLive === true,
      viewerCount: typeof raw.viewerCount === 'number' && Number.isFinite(raw.viewerCount) ? raw.viewerCount : null,
      path: typeof raw.path === 'string' ? raw.path : '',
      selfName: typeof raw.selfName === 'string' && raw.selfName.trim() ? raw.selfName.trim() : null,
    };
  } catch {
    return null;
  }
}

/**
 * Hidden, signed-in LinkedIn event theater page. LinkedIn has no public API
 * for live comments, so this reads the live comments panel from the DOM and
 * posts through its comment box. Mirrors the X / Kick scrapers.
 */
export class LinkedInDomChatScraper {
  private window: BrowserWindowRuntime | null = null;
  private pageUrl = '';
  private readonly pendingSenderWaiters = new Set<PendingSenderWaiter>();
  private readyWaiter: { resolve: (state: LinkedInPageState) => void; reject: (cause: Error) => void } | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private reloadAttempts = 0;
  private lastBeatAt = 0;
  private lastActivityAt = 0;
  private lastStateKey = '';
  private isLive = false;

  constructor(
    private readonly onComment: (comment: LinkedInDomComment) => void,
    private readonly onState: (state: LinkedInPageState) => void,
    private readonly log?: (message: string) => void,
  ) {}

  /** Loads the live page and resolves once the comments panel is mounted.
   *  Throws when the session is logged out or the page never shows a live. */
  async start(pageUrl: string): Promise<LinkedInPageState> {
    this.stop();
    this.pageUrl = pageUrl;
    const browserWindow = await this.createBrowserWindow();
    if (!browserWindow) throw new Error('LinkedIn adapter could not create the chat scraper window');
    this.window = browserWindow;
    browserWindow.webContents.setAudioMuted(true);
    // Offscreen pages repaint at 60fps by default; nothing here needs pixels.
    browserWindow.webContents.setFrameRate?.(1);
    browserWindow.webContents.on('console-message', (...args: unknown[]) => {
      const legacy = typeof args[2] === 'string' ? args[2] : null;
      const details = args[0] as { message?: unknown } | undefined;
      this.handleConsoleMessage(legacy ?? (typeof details?.message === 'string' ? details.message : ''));
    });
    // Re-inject after LinkedIn's full-page navigations (post link → theater).
    browserWindow.webContents.on('did-finish-load', () => { void this.injectScraper(); });

    const ready = new Promise<LinkedInPageState>((resolve, reject) => {
      this.readyWaiter = { resolve, reject };
    });
    // May settle (login wall, timeout) before it is awaited below.
    ready.catch(() => undefined);
    const timeout = setTimeout(() => {
      this.readyWaiter?.reject(new Error('LinkedIn live comments were not found on the page. Check that the URL points to a live that has started.'));
    }, READY_TIMEOUT_MS);
    try {
      try {
        await browserWindow.loadURL(pageUrl, { userAgent: LINKEDIN_BROWSER_USER_AGENT });
      } catch (cause) {
        // Redirects abort the original navigation; the final page still loads.
        const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
        if (code !== 'ERR_ABORTED') throw cause;
      }
      if (this.isLoginUrl(browserWindow.webContents.getURL())) throw new LinkedInLoginRequiredError();
      await this.injectScraper();
      const state = await ready;
      this.startWatchdog(browserWindow);
      return state;
    } catch (cause) {
      this.stop();
      throw cause;
    } finally {
      clearTimeout(timeout);
      this.readyWaiter = null;
    }
  }

  stop(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.watchdogTimer = null;
    this.reloadTimer = null;
    this.reloadAttempts = 0;
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    for (const waiter of [...this.pendingSenderWaiters]) waiter.finish(null);
  }

  async sendMessage(content: string): Promise<LinkedInDomSender | null> {
    const payload = content.trim();
    if (!payload) throw new Error('LinkedIn comment cannot be empty');
    const window = this.window;
    if (!window || window.isDestroyed()) throw new Error('LinkedIn live page is not connected');

    const filled = await window.webContents.executeJavaScript(this.buildFillScript(payload), true) as
      | { ok: boolean; reason?: string }
      | null;
    if (!filled?.ok) {
      if (filled?.reason === 'input-not-found') {
        throw new Error('LinkedIn comment box not found. Log in to LinkedIn in Platforms before sending.');
      }
      throw new Error('LinkedIn comment could not be typed into the comment box');
    }

    const senderWaiter = this.createSenderWaiter(payload);
    // The live comment box has no Post button — Enter submits. Try the page's
    // own key handling first, then a trusted native Enter.
    await window.webContents.executeJavaScript(PRESS_ENTER_SCRIPT, true);
    if (await this.waitForComposerCleared(1_500)) return senderWaiter.promise;
    if (!window.isDestroyed()) {
      for (const type of ['keyDown', 'char', 'keyUp']) {
        window.webContents.sendInputEvent({ type, keyCode: type === 'char' ? '\r' : 'Enter' });
      }
    }
    if (await this.waitForComposerCleared(2_500)) return senderWaiter.promise;

    senderWaiter.cancel();
    // Leave the box empty so the next send doesn't append to a stuck draft.
    if (!window.isDestroyed()) await window.webContents.executeJavaScript(CLEAR_COMPOSER_SCRIPT, true).catch(() => undefined);
    throw new Error('LinkedIn did not accept the comment. Check the account session and the live comment settings.');
  }

  // ── Internal ────────────────────────────────────────────────────────────

  /** Keeps a long-running live readable: LinkedIn's page doesn't recover its
   *  realtime feed after network drops, so reload it when it looks dead. The
   *  scraper re-attaches on did-finish-load and callers dedupe by comment id,
   *  so a reload only ever adds the comments missed while it was down. */
  private startWatchdog(browserWindow: BrowserWindowRuntime): void {
    const now = Date.now();
    this.lastBeatAt = now;
    this.lastActivityAt = now;
    browserWindow.webContents.on('did-fail-load', (...args: unknown[]) => {
      const [, errorCode, errorDescription, , isMainFrame] = args as [unknown, number, string, string, boolean];
      // -3 is ERR_ABORTED: redirects and our own reloads.
      if (isMainFrame === false || errorCode === -3) return;
      this.scheduleReload(`load failed: ${errorDescription || errorCode}`);
    });
    browserWindow.webContents.on('render-process-gone', () => this.scheduleReload('page process gone'));
    browserWindow.webContents.on('did-finish-load', () => { this.reloadAttempts = 0; });
    this.watchdogTimer = setInterval(() => {
      const idle = Date.now();
      if (idle - this.lastBeatAt > HEARTBEAT_TIMEOUT_MS) {
        this.scheduleReload('page stopped responding');
      } else if (this.isLive && idle - this.lastActivityAt > STALE_LIVE_MS) {
        this.scheduleReload('no live activity for 5 minutes');
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  private scheduleReload(reason: string): void {
    if (this.reloadTimer || !this.window || this.window.isDestroyed()) return;
    const delay = RELOAD_BACKOFF_MS[Math.min(this.reloadAttempts, RELOAD_BACKOFF_MS.length - 1)];
    this.reloadAttempts += 1;
    this.log?.(`Reloading the LinkedIn live page in ${delay / 1000}s (${reason})`);
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      const window = this.window;
      if (!window || window.isDestroyed()) return;
      // Reset the clocks so the reload itself gets a full window to recover.
      this.lastBeatAt = Date.now();
      this.lastActivityAt = Date.now();
      window.loadURL(this.pageUrl, { userAgent: LINKEDIN_BROWSER_USER_AGENT }).catch((cause: unknown) => {
        const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
        if (code !== 'ERR_ABORTED') this.scheduleReload(`reload failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      });
    }, delay);
  }

  private isLoginUrl(url: string): boolean {
    try {
      return LOGIN_PATH.test(new URL(url).pathname);
    } catch {
      return false;
    }
  }

  private handleConsoleMessage(message: string): void {
    if (message.startsWith(BEAT_PREFIX)) {
      this.lastBeatAt = Date.now();
      return;
    }
    if (message.startsWith(LOG_PREFIX)) {
      this.log?.(message.slice(LOG_PREFIX.length));
      return;
    }
    const state = parseLinkedInPageStateMessage(message);
    if (state) {
      this.lastBeatAt = Date.now();
      this.isLive = state.isLive;
      const key = `${state.isLive}:${state.viewerCount}`;
      if (key !== this.lastStateKey) {
        this.lastStateKey = key;
        this.lastActivityAt = Date.now();
      }
      if (state.loginRequired) this.readyWaiter?.reject(new LinkedInLoginRequiredError());
      else if (state.ready) this.readyWaiter?.resolve(state);
      this.onState(state);
      return;
    }
    const comment = parseLinkedInDomCommentMessage(message);
    if (!comment) return;
    this.lastActivityAt = Date.now();
    // Not gated on isInitial: in a live with no comments yet, our own first
    // comment is also the page's first row.
    const waiter = [...this.pendingSenderWaiters].find((candidate) => candidate.content === comment.text);
    waiter?.finish({ profilePath: comment.profilePath, name: comment.name });
    this.onComment(comment);
  }

  private async waitForComposerCleared(timeoutMs: number): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const window = this.window;
      if (!window || window.isDestroyed()) return false;
      const text = await window.webContents.executeJavaScript(READ_COMPOSER_SCRIPT, false).catch(() => null);
      if (text === '') return true;
    }
    return false;
  }

  private createSenderWaiter(content: string): {
    promise: Promise<LinkedInDomSender | null>;
    cancel: () => void;
  } {
    let finish!: (sender: LinkedInDomSender | null) => void;
    const promise = new Promise<LinkedInDomSender | null>((resolve) => {
      const waiter: PendingSenderWaiter = {
        content,
        finish: (sender) => {
          if (!this.pendingSenderWaiters.delete(waiter)) return;
          clearTimeout(timeout);
          resolve(sender);
        },
      };
      finish = waiter.finish;
      // LinkedIn renders the optimistic row at once but only stamps the
      // comment urn after the server round-trip.
      const timeout = setTimeout(() => waiter.finish(null), 5_000);
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
        // The theater only renders the comments side panel at desktop widths.
        width: 1440,
        height: 900,
        show: false,
        autoHideMenuBar: true,
        title: 'LinkedIn Live Comments',
        webPreferences: {
          offscreen: true,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
          backgroundThrottling: false,
        },
      });
    } catch (cause) {
      this.log?.(`LinkedIn chat scraper window failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      return null;
    }
  }

  private async injectScraper(): Promise<void> {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    try {
      await window.webContents.executeJavaScript(SCRAPER_SCRIPT, true);
    } catch (cause) {
      this.log?.(`LinkedIn scraper injection failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  private buildFillScript(content: string): string {
    return `
      (() => {
        const payload = ${JSON.stringify(content)};
        const editor = document.querySelector('.video-live-comments form.comments-comment-box__form .ql-editor[contenteditable="true"]');
        if (!(editor instanceof HTMLElement)) return { ok: false, reason: 'input-not-found' };
        editor.focus();
        document.execCommand('selectAll', false);
        document.execCommand('delete', false);
        document.execCommand('insertText', false, payload);
        return { ok: (editor.innerText || '').trim() === payload };
      })()
    `;
  }
}

const COMPOSER_SELECTOR = '.video-live-comments form.comments-comment-box__form .ql-editor[contenteditable="true"]';

const READ_COMPOSER_SCRIPT = `
  (() => {
    const editor = document.querySelector('${COMPOSER_SELECTOR}');
    return editor ? (editor.innerText || '').trim() : null;
  })()
`;

const PRESS_ENTER_SCRIPT = `
  (() => {
    const editor = document.querySelector('${COMPOSER_SELECTOR}');
    if (!editor) return false;
    editor.focus();
    for (const type of ['keydown', 'keypress', 'keyup']) {
      editor.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, composed: true, cancelable: true,
      }));
    }
    return true;
  })()
`;

const CLEAR_COMPOSER_SCRIPT = `
  (() => {
    const editor = document.querySelector('${COMPOSER_SELECTOR}');
    if (!editor) return false;
    editor.focus();
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
    editor.blur();
    return true;
  })()
`;

// Selectors verified against a running LinkedIn Live theater page:
//   .video-live-comments                          comments side panel
//   article.comments-comment-item[data-id]        one comment; data-id is
//                                                 urn:li:comment:(ugcPost:<post>,<comment>)
//   .comments-post-meta__name-text                author name
//   a.comments-post-meta__actor-link              author profile link
//   .comments-comment-item__main-content          comment text
//   .video-live-bug__label (+ sibling <p>)        LIVE badge and viewer count
// New comments are appended at the end; LinkedIn first renders an optimistic
// row without data-id and swaps in the stamped row ~1s later, so only rows
// with a comment urn are emitted, deduped by urn.
const SCRAPER_SCRIPT = `
  (() => {
    if (window.__COPILOT_LINKEDIN_SCRAPER__) {
      window.__COPILOT_LINKEDIN_SCRAPER__.scheduleScan();
      return true;
    }

    const state = {
      seen: new Set(),
      root: null,
      observer: null,
      initialScanDone: false,
      scanTimer: null,
      lastState: '',
      waitLogged: false,
    };
    window.__COPILOT_LINKEDIN_SCRAPER__ = state;

    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const textWithEmoji = (node) => {
      if (!node) return '';
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (!(node instanceof Element)) return '';
      if (node instanceof HTMLImageElement) return node.alt || '';
      if (node.matches('.visually-hidden, [aria-hidden="true"] svg')) return '';
      if (node.tagName === 'BR') return ' ';
      return Array.from(node.childNodes).map(textWithEmoji).join('');
    };
    const parseCount = (raw) => {
      const value = normalize(raw).replace(/,/g, '').toUpperCase();
      const match = value.match(/^(\\d+(?:\\.\\d+)?)([KM]?)$/);
      if (!match) return null;
      const n = Number(match[1]);
      return Math.round(match[2] === 'M' ? n * 1e6 : match[2] === 'K' ? n * 1e3 : n);
    };
    const emit = (prefix, payload) => console.log(prefix + JSON.stringify(payload));

    const profilePathOf = (article) => {
      const link = article.querySelector('a.comments-post-meta__actor-link, .comments-post-meta a[href]');
      try {
        const url = new URL(link?.getAttribute('href') || '', location.origin);
        const match = url.pathname.match(/^\\/(in|company|school|showcase)\\/[^/]+/);
        return match ? match[0] : '';
      } catch {
        return '';
      }
    };

    const selfName = () => {
      const panel = document.querySelector('.video-live-comments');
      const form = panel?.querySelector('form.comments-comment-box__form');
      let scope = form?.parentElement || null;
      for (let depth = 0; scope && depth < 4; depth += 1, scope = scope.parentElement) {
        const img = Array.from(scope.querySelectorAll('img[alt]')).find((candidate) => !candidate.closest('article'));
        if (img) return normalize(img.getAttribute('alt'));
      }
      return null;
    };

    const reportState = () => {
      const bug = document.querySelector('.video-live-bug__label');
      const viewerText = bug?.parentElement?.querySelector('p')?.textContent;
      const payload = {
        ready: Boolean(document.querySelector('.video-live-comments')),
        loginRequired: /^\\/(login|uas\\/login|authwall|checkpoint|signup)/.test(location.pathname),
        isLive: Boolean(bug),
        viewerCount: viewerText ? parseCount(viewerText) : null,
        path: location.pathname,
        selfName: selfName(),
      };
      const serialized = JSON.stringify(payload);
      if (serialized === state.lastState) return;
      state.lastState = serialized;
      emit('${STATE_PREFIX}', payload);
    };

    const quietVideos = () => {
      document.querySelectorAll('video').forEach((video) => {
        video.muted = true;
        if (!video.paused) video.pause();
      });
    };

    const scan = () => {
      const root = state.root?.isConnected ? state.root : document.querySelector('.video-live-comments');
      if (!root) {
        if (!state.waitLogged) {
          state.waitLogged = true;
          console.log('${LOG_PREFIX}Waiting for the live comments panel on ' + location.pathname);
        }
        return;
      }
      if (state.root !== root) {
        state.observer?.disconnect();
        state.root = root;
        state.observer = new MutationObserver(() => scheduleScan());
        state.observer.observe(root, { childList: true, subtree: true });
        quietVideos();
      }
      const isInitial = !state.initialScanDone;
      const articles = root.querySelectorAll('article.comments-comment-item[data-id^="urn:li:comment:"]');
      for (const article of articles) {
        const urn = article.getAttribute('data-id');
        if (!urn || state.seen.has(urn)) continue;
        const name = normalize(article.querySelector('.comments-post-meta__name-text')?.textContent);
        const text = normalize(textWithEmoji(article.querySelector('.comments-comment-item__main-content')));
        if (!name || !text) continue;
        state.seen.add(urn);
        emit('${CHAT_PREFIX}', { urn, name, profilePath: profilePathOf(article), text, isInitial });
      }
      if (articles.length > 0) state.initialScanDone = true;
    };
    const scheduleScan = () => {
      if (state.scanTimer !== null) return;
      state.scanTimer = setTimeout(() => {
        state.scanTimer = null;
        scan();
        reportState();
      }, 100);
    };
    state.scheduleScan = scheduleScan;

    // The panel has its own observer; this slow tick only rediscovers it after
    // LinkedIn re-renders the page, keeps media paused, and refreshes the
    // viewer count (which lives outside the observed panel).
    setInterval(() => {
      quietVideos();
      if (!state.root?.isConnected) state.root = null;
      scheduleScan();
    }, 5_000);
    // Liveness signal for the main-process watchdog.
    setInterval(() => console.log('${BEAT_PREFIX}'), 15_000);
    scheduleScan();
    return true;
  })()
`;
