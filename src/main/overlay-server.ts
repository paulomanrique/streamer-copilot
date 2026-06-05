import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';

import type { AddressInfo } from 'node:net';
import { ANDROID_VR_USER_AGENT } from './music-stream-resolver.js';

import { OVERLAY_FONTS } from '../shared/constants.js';
import type { RecentChatSnapshot } from '../shared/ipc.js';
import type { ChatOverlayInfo, OverlayDefaults, OverlayId, OverlayPreferencesMap, PollOverlayInfo, PollOverlayState, RaffleOverlayInfo, RaffleOverlayState } from '../shared/types.js';

interface OverlayServerOptions {
  /** TCP port to listen on; comes from GeneralSettings.overlayServerPort. */
  port: number;
  getOverlayState: () => RaffleOverlayState | null;
  getPollsOverlayState: () => PollOverlayState | null;
  getChatSnapshot: () => RecentChatSnapshot;
}

interface WsLikeServer {
  handleUpgrade(request: unknown, socket: unknown, head: Buffer, callback: (ws: WsLikeClient) => void): void;
  emit(event: string, ws: WsLikeClient, request: unknown): void;
  on(event: string, handler: (ws: WsLikeClient) => void): void;
}
interface WsLikeClient {
  send(data: string): void;
  close(): void;
  on(event: 'close' | 'message' | 'error', handler: (...args: unknown[]) => void): void;
}

export type OverlayServerStatus = 'running' | 'failed' | 'stopped';

/**
 * R3: HTTP + WebSocket server for OBS browser sources.
 *
 * Routes preserved from the previous RaffleOverlayServer:
 *   GET  /chat/overlay              chat overlay HTML
 *   GET  /chat/overlay/state        polling JSON of recent chat
 *   GET  /chat/overlay/overlay.css|js
 *   GET  /raffles/overlay           raffle overlay HTML
 *   GET  /raffles/overlay/state     polling JSON of raffle state
 *   GET  /raffles/overlay/overlay.css|js
 *
 * R3 additions:
 *   GET  /now-playing               music player browser source (R4)
 *   WS   /ws                        topic-multiplexed event stream
 *
 * The port is configurable via GeneralSettings.overlayServerPort. If the
 * port is in use the server enters 'failed' status and the UI surfaces it.
 */
export class OverlayServer {
  private server: http.Server | null = null;
  private wss: WsLikeServer | null = null;
  /** Map of topic → connected clients subscribed to that topic. */
  private readonly subscribers = new Map<string, Set<WsLikeClient>>();
  private readonly clientsChangeHandlers = new Map<string, Set<() => void>>();
  private port = 0;
  private startPromise: Promise<void> | null = null;
  private lastStatus: OverlayServerStatus = 'stopped';
  private lastError: string | null = null;
  /**
   * Cache `videoId → googlevideo URL` for the now-playing audio proxy.
   *
   * Why the proxy exists: the URL we resolve has `ip=...` baked in and a
   * strict User-Agent expectation, and googlevideo doesn't return
   * `Access-Control-Allow-Origin`. A `<audio src="...">` pointing at it
   * directly hits 403 or CORS. The proxy fetches from googlevideo with the
   * matching User-Agent and forwards bytes from the same origin as the
   * browser source (127.0.0.1:port), so no preflight.
   */
  private readonly audioSourceByVideoId = new Map<string, string>();
  /**
   * Latest overlay preferences seeded from the per-profile JSON store. The
   * boot script of an overlay reads its slice via GET /overlay-prefs/state
   * before subscribing to the WS topic, and `app-context` updates this map
   * (then publishes) every time the streamer adjusts a value in the UI.
   */
  private overlayPreferences: OverlayPreferencesMap = {};
  /**
   * Latest global default visual style seeded from the per-profile JSON store.
   * Read once at boot via `GET /overlay-defaults/state` and re-pushed over WS
   * (topic `overlay-defaults`) whenever the streamer changes it in the UI.
   * Each overlay merges this with its per-overlay override slice.
   */
  private overlayDefaults: OverlayDefaults = {};

  constructor(private readonly options: OverlayServerOptions) {}

  getStatus(): { status: OverlayServerStatus; port: number; error: string | null } {
    return { status: this.lastStatus, port: this.port, error: this.lastError };
  }

  /** Push payload to every client subscribed to `topic`. */
  publish(topic: string, payload: unknown): void {
    const clients = this.subscribers.get(topic);
    if (!clients || clients.size === 0) return;
    const message = JSON.stringify({ topic, payload });
    for (const client of clients) {
      try { client.send(message); } catch { /* ignore broken socket */ }
    }
  }

  hasClients(topic: string): boolean {
    const set = this.subscribers.get(topic);
    return !!set && set.size > 0;
  }

  onClientsChange(topic: string, handler: () => void): () => void {
    let set = this.clientsChangeHandlers.get(topic);
    if (!set) {
      set = new Set();
      this.clientsChangeHandlers.set(topic, set);
    }
    set.add(handler);
    return () => { set?.delete(handler); };
  }

  private notifyClientsChange(topic: string): void {
    const handlers = this.clientsChangeHandlers.get(topic);
    if (!handlers) return;
    for (const handler of handlers) {
      try { handler(); } catch { /* ignore */ }
    }
  }

  async start(): Promise<void> {
    if (this.server) return;
    if (this.startPromise) return this.startPromise;

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const path = url.pathname;

      if (path === '/chat/overlay/state') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(this.options.getChatSnapshot()));
        return;
      }

      if (path === '/chat/overlay/overlay.css') {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(chatOverlayCss);
        return;
      }

      if (path === '/chat/overlay/overlay.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(chatOverlayJs);
        return;
      }

      if (path === '/chat/overlay' || path === '/chat/overlay/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(this.renderChatHtml('overlay'));
        return;
      }

      if (path === '/chat/dock' || path === '/chat/dock/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(this.renderChatHtml('dock'));
        return;
      }

      if (path === '/raffles/overlay/state') {
        const state = this.options.getOverlayState();
        if (!state) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No active raffle' }));
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(state));
        return;
      }

      if (path === '/raffles/overlay/overlay.css') {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(overlayCss);
        return;
      }

      if (path === '/raffles/overlay/overlay.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(overlayJs);
        return;
      }

      if (path === '/raffles/overlay' || path === '/raffles/overlay/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(this.renderHtml());
        return;
      }

      if (path === '/polls/overlay/state') {
        const state = this.options.getPollsOverlayState();
        if (!state) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No active poll' }));
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(state));
        return;
      }

      if (path === '/polls/overlay/overlay.css') {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(pollsOverlayCss);
        return;
      }

      if (path === '/polls/overlay/overlay.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(pollsOverlayJs);
        return;
      }

      if (path === '/polls/overlay' || path === '/polls/overlay/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(pollsOverlayHtml);
        return;
      }

      if (path === '/overlay-prefs/state') {
        const id = url.searchParams.get('id') as OverlayId | null;
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(id ? (this.overlayPreferences[id] ?? {}) : this.overlayPreferences));
        return;
      }

      if (path === '/overlay-defaults/state') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(this.overlayDefaults));
        return;
      }

      if (path === '/now-playing/audio') {
        const videoId = url.searchParams.get('id');
        const source = videoId ? this.audioSourceByVideoId.get(videoId) : null;
        if (!source) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Unknown audio source');
          return;
        }
        proxyAudio(source, req, res);
        return;
      }

      if (path === '/now-playing' || path === '/now-playing/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(nowPlayingHtml);
        return;
      }

      if (path === '/now-playing/now-playing.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(nowPlayingJs);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    });

    // Mount the WebSocket server on `/ws`. We attach manually via 'upgrade'
    // so we keep a single HTTP server (simpler firewall story for OBS).
    try {
      const requireFn = createRequire(import.meta.url);
      const wsModule = requireFn('ws') as { WebSocketServer: new (opts: { noServer: true }) => WsLikeServer };
      const wss = new wsModule.WebSocketServer({ noServer: true });
      this.wss = wss;
      server.on('upgrade', (request, socket, head) => {
        const reqUrl = new URL((request as { url?: string }).url ?? '/', 'http://127.0.0.1');
        if (reqUrl.pathname !== '/ws') {
          (socket as { destroy(): void }).destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          this.attachClient(ws);
        });
      });
    } catch (cause) {
      this.lastError = `WS init failed: ${cause instanceof Error ? cause.message : String(cause)}`;
    }

    this.startPromise = new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.options.port, '127.0.0.1', () => resolve());
    });

    try {
      await this.startPromise;
      this.server = server;
      this.port = (server.address() as AddressInfo).port;
      this.lastStatus = 'running';
      this.lastError = null;
    } catch (cause) {
      this.lastStatus = 'failed';
      this.lastError = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      this.startPromise = null;
    }
  }

  private attachClient(ws: WsLikeClient): void {
    const ownedTopics = new Set<string>();
    ws.on('message', (raw) => {
      try {
        const text = typeof raw === 'string' ? raw : (raw as Buffer).toString('utf-8');
        const msg = JSON.parse(text) as { type?: string; topic?: string };
        if (!msg?.topic) return;
        if (msg.type === 'subscribe') {
          let set = this.subscribers.get(msg.topic);
          if (!set) {
            set = new Set();
            this.subscribers.set(msg.topic, set);
          }
          set.add(ws);
          ownedTopics.add(msg.topic);
          this.notifyClientsChange(msg.topic);
        } else if (msg.type === 'unsubscribe') {
          this.subscribers.get(msg.topic)?.delete(ws);
          ownedTopics.delete(msg.topic);
          this.notifyClientsChange(msg.topic);
        }
      } catch { /* malformed client message */ }
    });
    ws.on('close', () => {
      for (const topic of ownedTopics) {
        this.subscribers.get(topic)?.delete(ws);
        this.notifyClientsChange(topic);
      }
    });
    ws.on('error', () => { /* swallow; close handler runs */ });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    // Close all WS clients before closing the HTTP server so close() returns.
    for (const set of this.subscribers.values()) {
      for (const client of set) {
        try { client.close(); } catch { /* ignore */ }
      }
    }
    this.subscribers.clear();
    this.port = 0;
    this.lastStatus = 'stopped';
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  getNowPlayingInfo(): { overlayUrl: string } | null {
    if (!this.server || this.port === 0) return null;
    return { overlayUrl: `http://127.0.0.1:${this.port}/now-playing` };
  }

  /** Replaces the in-memory overlay preferences map and broadcasts each
   *  per-overlay slice on its WS topic so connected browser sources update
   *  live without reloading. Idempotent — publishing the same payload again
   *  is harmless (overlays apply state on every message). */
  setOverlayPreferences(map: OverlayPreferencesMap): void {
    this.overlayPreferences = { ...map };
    for (const id of Object.keys(this.overlayPreferences) as OverlayId[]) {
      this.publish(`overlay-prefs:${id}`, this.overlayPreferences[id] ?? {});
    }
  }

  getOverlayPreferences(): OverlayPreferencesMap {
    return this.overlayPreferences;
  }

  /** Replaces the global default visual style and broadcasts it on the
   *  `overlay-defaults` topic. Each overlay client merges defaults with its
   *  per-overlay override slice before applying CSS vars. */
  setOverlayDefaults(defaults: OverlayDefaults): void {
    this.overlayDefaults = { ...defaults };
    this.publish('overlay-defaults', this.overlayDefaults);
  }

  getOverlayDefaults(): OverlayDefaults {
    return this.overlayDefaults;
  }

  /** Registers the actual googlevideo URL for a videoId and returns the
   *  same-origin URL the browser source should use as `<audio src>`. The
   *  proxy keeps only the most recent handful of videoIds so the map
   *  doesn't grow unbounded. */
  setNowPlayingAudioSource(videoId: string, sourceUrl: string): string {
    this.audioSourceByVideoId.set(videoId, sourceUrl);
    if (this.audioSourceByVideoId.size > 16) {
      const oldest = this.audioSourceByVideoId.keys().next().value;
      if (oldest) this.audioSourceByVideoId.delete(oldest);
    }
    return `/now-playing/audio?id=${encodeURIComponent(videoId)}`;
  }

  getOverlayInfo(): RaffleOverlayInfo {
    if (!this.server || this.port === 0) {
      throw new Error('Raffle overlay server is not running');
    }

    return {
      overlayUrl: `http://127.0.0.1:${this.port}/raffles/overlay`,
      stateUrl: `http://127.0.0.1:${this.port}/raffles/overlay/state`,
    };
  }

  getPollsOverlayInfo(): PollOverlayInfo {
    if (!this.server || this.port === 0) {
      throw new Error('Polls overlay server is not running');
    }

    return {
      overlayUrl: `http://127.0.0.1:${this.port}/polls/overlay`,
      stateUrl: `http://127.0.0.1:${this.port}/polls/overlay/state`,
    };
  }

  getChatOverlayInfo(): ChatOverlayInfo {
    if (!this.server || this.port === 0) {
      throw new Error('Overlay server is not running');
    }

    return {
      overlayUrl: `http://127.0.0.1:${this.port}/chat/overlay`,
      dockUrl: `http://127.0.0.1:${this.port}/chat/dock`,
      stateUrl: `http://127.0.0.1:${this.port}/chat/overlay/state`,
    };
  }

  private renderChatHtml(mode: 'overlay' | 'dock'): string {
    // Inline boot script — sets defaults for the route's mode (overlay =
    // transparent + 1.5x; dock = opaque + 1x) and honors per-URL overrides
    // (`?transparent=0`, `?scale=2`, etc.) for fine-tuning without touching
    // the server. Runs before the stylesheet to avoid a flash of dark
    // background in overlay mode. Also exposes the overlay id so the runtime
    // JS knows which preferences topic to subscribe to.
    const defaultTransparent = mode === 'overlay' ? '1' : '0';
    const defaultScale = mode === 'overlay' ? '1.5' : '1';
    const overlayId = mode === 'overlay' ? 'chat-overlay' : 'chat-dock';
    const bootScript = `
      (function () {
        try {
          var params = new URLSearchParams(location.search);
          var html = document.documentElement;
          var transparent = params.get('transparent');
          if (transparent === null) transparent = '${defaultTransparent}';
          if (transparent === '1') html.setAttribute('data-transparent', '1');
          var scaleParam = params.get('scale');
          var scale = parseFloat(scaleParam === null ? '${defaultScale}' : scaleParam);
          if (isFinite(scale) && scale > 0) html.style.setProperty('--scale', String(scale));
          window.__overlayId = '${overlayId}';
        } catch (e) { /* noop */ }
      })();
    `.trim();
    return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chat — Overlay</title>
    <script>${bootScript}</script>${buildGoogleFontsLink()}
    <link rel="stylesheet" href="/chat/overlay/overlay.css" />
  </head>
  <body>
    <main class="chat-overlay" aria-live="polite">
      <div id="chat-list" class="chat-list"></div>
    </main>
    <script src="/chat/overlay/overlay.js"></script>
  </body>
</html>`;
  }

  private renderHtml(): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sorteio — Overlay</title>${buildGoogleFontsLink()}
    <link rel="stylesheet" href="/raffles/overlay/overlay.css" />
  </head>
  <body>
    <div class="overlay">
      <header class="header">
        <div class="header-left">
          <span class="live-tag"><span class="live-dot"></span>AO VIVO</span>
          <h1 id="raffle-title" class="raffle-title">Carregando...</h1>
        </div>
        <span id="raffle-status" class="status-badge">Aguardando</span>
      </header>
      <main class="stage">
        <div class="wheel-section">
          <div class="wheel-frame">
            <div class="wheel-pointer"></div>
            <div id="wheel" class="wheel"></div>
            <div class="wheel-hub"><div class="wheel-hub-core"></div></div>
          </div>
          <div id="round-badge" class="round-badge hidden">RODADA <span id="round-num">1</span></div>
        </div>
        <div class="side-panel">
          <div class="info-card participants-card">
            <span class="info-label">Participantes ativos</span>
            <div class="participants-row">
              <span id="active-count" class="count-main">0</span>
              <span class="count-sep">/</span>
              <span id="total-count" class="count-total">0</span>
            </div>
          </div>
          <div id="result-card" class="info-card result-card">
            <span id="result-label" class="info-label">Resultado</span>
            <div id="result-name" class="result-name">&mdash;</div>
            <p id="result-caption" class="result-caption">Aguardando inicio do sorteio</p>
          </div>
          <div id="top2-container" class="info-card top2-card hidden">
            <span class="info-label">Final &middot; Top 2</span>
            <div id="top2-list" class="top2-list"></div>
          </div>
        </div>
      </main>
    </div>
    <script src="/raffles/overlay/overlay.js"></script>
  </body>
</html>`;
  }
}

/**
 * Builds the inline JS that an overlay's boot script uses to subscribe to
 * the live visual-style channels (global `overlay-defaults` + per-overlay
 * `overlay-prefs:<id>`), merge them, and apply the result as CSS variables.
 *
 * Each overlay calls this once at boot — the snippet is self-contained
 * (no shared globals across overlays, since each runs in its own popup
 * window). `overlayId` may be the string id or `'window'` to read it from
 * `window.__overlayId` (used by chat, which can be 'chat-overlay' or
 * 'chat-dock' depending on the route).
 *
 * The CSS vars set match the universal style block in each overlay's CSS:
 * `--bg-color-rgb` (R,G,B triplet for use inside rgba()), `--opacity`,
 * `--border-radius`, `--border-color`, `--border-width`, `--font`,
 * `--text-color`, `--accent-color`. Unset fields are deliberately not
 * cleared on the document — they fall back to the per-overlay CSS default.
 *
 * `--scale` (chat overlay only) is also multiplied by `fontSize / 14` so
 * the editor's font-size knob scales every text element proportionally
 * without having to refactor every `calc(N * var(--scale))` in the stylesheet.
 */
function buildOverlayStyleScript(overlayId: string | 'window'): string {
  const idExpr = overlayId === 'window'
    ? 'window.__overlayId'
    : JSON.stringify(overlayId);
  const fontStacks = OVERLAY_FONTS.reduce<Record<string, string>>((acc, font) => {
    acc[font.key] = font.stack;
    return acc;
  }, {});
  return `
(function () {
  var ID = ${idExpr};
  if (!ID) return;
  var FONT_STACKS = ${JSON.stringify(fontStacks)};
  var defaults = {};
  var prefs = {};
  // chat overlay sets --scale from the URL ?scale param (default 1.5 for
  // overlay route, 1 for dock); we remember the base so the font-size knob
  // can multiply into it instead of clobbering the per-route scale.
  var baseScale = parseFloat(document.documentElement.style.getPropertyValue('--scale')) || 1;

  function hexToRgbTriplet(hex) {
    if (typeof hex !== 'string') return null;
    var m = /^#([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return ((n >> 16) & 0xff) + ', ' + ((n >> 8) & 0xff) + ', ' + (n & 0xff);
  }

  function merge() {
    var d = defaults || {};
    var p = prefs || {};
    var root = document.documentElement.style;

    var bg = p.backgroundColor || d.backgroundColor;
    var bgRgb = hexToRgbTriplet(bg);
    if (bgRgb) root.setProperty('--bg-color-rgb', bgRgb);

    // 'opacity' is the legacy single-knob alias for backgroundOpacity.
    var opacity = (typeof p.backgroundOpacity === 'number') ? p.backgroundOpacity
      : (typeof p.opacity === 'number') ? p.opacity
      : (typeof d.backgroundOpacity === 'number') ? d.backgroundOpacity
      : null;
    if (opacity !== null) root.setProperty('--opacity', String(opacity));

    var br = (typeof p.borderRadius === 'number') ? p.borderRadius
      : (typeof d.borderRadius === 'number') ? d.borderRadius : null;
    if (br !== null) root.setProperty('--border-radius', br + 'px');

    var bc = p.borderColor || d.borderColor;
    if (bc) root.setProperty('--border-color', bc);

    var bw = (typeof p.borderWidth === 'number') ? p.borderWidth
      : (typeof d.borderWidth === 'number') ? d.borderWidth : null;
    if (bw !== null) root.setProperty('--border-width', bw + 'px');

    var fontKey = p.fontFamily || d.fontFamily;
    if (fontKey && FONT_STACKS[fontKey]) root.setProperty('--font', FONT_STACKS[fontKey]);

    var tc = p.fontColor || d.fontColor;
    if (tc) root.setProperty('--text-color', tc);

    var fs = (typeof p.fontSize === 'number') ? p.fontSize
      : (typeof d.fontSize === 'number') ? d.fontSize : null;
    // Reset --scale to the route's base on every merge so unsetting fontSize
    // returns the overlay to its hand-tuned size instead of sticking at the
    // last computed multiplier.
    root.setProperty('--scale', String(fs !== null ? (baseScale * (fs / 14)) : baseScale));
    if (fs !== null) root.setProperty('--font-size-base', fs + 'px');

    var ac = p.accentColor || d.accentColor;
    if (ac) root.setProperty('--accent-color', ac);
  }

  function onDefaults(payload) { defaults = payload || {}; merge(); }
  function onPrefs(payload) { prefs = payload || {}; merge(); }

  fetch('/overlay-defaults/state', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(onDefaults)
    .catch(function () { /* noop */ });
  fetch('/overlay-prefs/state?id=' + encodeURIComponent(ID), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(onPrefs)
    .catch(function () { /* noop */ });

  function connect() {
    var ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.addEventListener('open', function () {
      ws.send(JSON.stringify({ type: 'subscribe', topic: 'overlay-defaults' }));
      ws.send(JSON.stringify({ type: 'subscribe', topic: 'overlay-prefs:' + ID }));
    });
    ws.addEventListener('message', function (event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.topic === 'overlay-defaults') onDefaults(msg.payload);
        else if (msg.topic === 'overlay-prefs:' + ID) onPrefs(msg.payload);
      } catch (e) { /* ignore */ }
    });
    ws.addEventListener('close', function () { setTimeout(connect, 1500); });
  }
  connect();
})();
`;
}

/**
 * Builds the Google Fonts `<link>` block used by every overlay HTML page.
 *
 * Joins every entry from `OVERLAY_FONTS` that has a `google` family spec into
 * one css2 URL — the streamer pays one network round-trip and any font can
 * be swapped live via the editor without reloading the page. Preconnects to
 * fonts.googleapis.com / fonts.gstatic.com keep the first paint snappy.
 */
function buildGoogleFontsLink(): string {
  const families = OVERLAY_FONTS
    .map((entry) => entry.google)
    .filter((google): google is string => Boolean(google))
    .map((google) => `family=${google}`)
    .join('&');
  return `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?${families}&display=swap" rel="stylesheet" />`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const chatOverlayCss = `
:root {
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --text-main: #d1d5db;
  --text-muted: #4b5563;
  --command: #c4b5fd;
  --twitch: rgba(168, 85, 247, 0.2);
  --twitch-text: #d8b4fe;
  --youtube: rgba(239, 68, 68, 0.2);
  --youtube-text: #fca5a5;
  --kick: rgba(34, 197, 94, 0.2);
  --kick-text: #86efac;
  --tiktok: rgba(236, 72, 153, 0.2);
  --tiktok-text: #f9a8d4;
  /* Live-customizable visual style — vars below are written by the merge
   * JS (defaults ⊕ per-overlay prefs). Falling back to the per-overlay
   * look when the streamer leaves a field unset. */
  --bg-color-rgb: 0, 0, 0;
  --border-radius: 4px;
  --border-color: transparent;
  --border-width: 0px;
  --text-color: #d1d5db;
  --accent-color: #c4b5fd;
}

*, *::before, *::after { box-sizing: border-box; }

html, body {
  width: 100%;
  min-height: 100%;
  margin: 0;
  background: #000000;
  color: var(--text-color);
  font-family: var(--font);
  overflow: hidden;
}

/* Overlay/transparent mode — query param "?transparent=1".
 * Lets the OBS scene/game show through behind the chat. */
html[data-transparent="1"], html[data-transparent="1"] body {
  background: transparent;
}

/* Global scale — query param "?scale=N" (e.g. 1.5 = +50%).
 * Default 1 = current sizes; consumed via calc() below. */
html { --scale: 1; --opacity: 0; }

.chat-overlay {
  width: 100vw;
  height: 100vh;
  padding: 8px 0 8px 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* Backdrop + border + rounding are applied to the chat CONTAINER (not
   * each row) so the editor's bg / border / corner sliders frame the
   * whole OBS Browser Source as one shape, the way the streamer expects.
   * Color from --bg-color-rgb (RGB triplet) + alpha from --opacity. */
  background-color: rgba(var(--bg-color-rgb), var(--opacity, 0));
  border-radius: var(--border-radius);
  /* box-shadow rather than border so it doesn't shift the layout when
   * the streamer cranks the border-width slider. */
  box-shadow: 0 0 0 var(--border-width) var(--border-color);
  /* Keep the scrollbar thin so it doesn't compete with the OBS scene. */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.chat-overlay::-webkit-scrollbar { width: 6px; }
.chat-overlay::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}
.chat-overlay::-webkit-scrollbar-track { background: transparent; }

.chat-list {
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
}

.chat-message {
  display: flex;
  gap: 6px;
  min-width: 0;
  padding: 6px 8px 6px 6px;
  border-left: 2px solid rgba(168, 85, 247, 0.2);
  cursor: default;
  user-select: text;
  animation: enter 160ms ease-out both;
  /* Backdrop + border + corner rounding live on the container (.chat-overlay)
   * — the editor frames the whole Browser Source as one shape rather than
   * rendering every row as its own pill. Keep the platform border-left
   * accent here since that's a per-row affordance. */
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.72);
}

.chat-message.twitch { border-left-color: rgba(168, 85, 247, 0.2); }
.chat-message.youtube { border-left-color: rgba(239, 68, 68, 0.2); }
.chat-message.kick { border-left-color: rgba(34, 197, 94, 0.2); }
.chat-message.tiktok { border-left-color: rgba(236, 72, 153, 0.2); }
/* Layer the command-row tint OVER the universal backdrop — the shorthand
 * `background` used to live here, but it clobbered background-color and
 * left command rows looking transparent whenever the streamer raised
 * --opacity on the visual editor. */
.chat-message.command {
  background-image: linear-gradient(rgba(139, 92, 246, 0.05), rgba(139, 92, 246, 0.05));
}

.body {
  flex: 1 1 auto;
  min-width: 0;
}

.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.platform-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: calc(10px * var(--scale));
  line-height: 1;
  font-weight: 800;
}

.platform-badge svg {
  width: calc(10px * var(--scale));
  height: calc(10px * var(--scale));
}

.platform-badge.twitch { background: var(--twitch); color: var(--twitch-text); }
.platform-badge.youtube { background: var(--youtube); color: var(--youtube-text); }
.platform-badge.kick { background: var(--kick); color: var(--kick-text); }
.platform-badge.tiktok { background: var(--tiktok); color: var(--tiktok-text); }

.avatar,
.avatar-fallback {
  width: calc(20px * var(--scale));
  height: calc(20px * var(--scale));
  border-radius: 999px;
  flex: 0 0 auto;
  object-fit: cover;
}

.avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.avatar-fallback svg {
  width: calc(12px * var(--scale));
  height: calc(12px * var(--scale));
}

.twitch-badge {
  width: calc(16px * var(--scale));
  height: calc(16px * var(--scale));
  border-radius: 2px;
  flex: 0 0 auto;
  object-fit: contain;
}

.member-star {
  color: #facc15;
  font-size: calc(12px * var(--scale));
  line-height: 1;
}

.author {
  font-size: calc(14px * var(--scale));
  line-height: 1.25;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mod {
  color: #34d399;
  font-size: calc(12px * var(--scale));
  line-height: 1;
  font-weight: 700;
}

.content {
  margin: 2px 0 0;
  color: var(--text-color);
  font-size: calc(14px * var(--scale));
  line-height: 1.375;
  overflow-wrap: anywhere;
}

.content.command {
  color: var(--accent-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.content a {
  color: #7dd3fc;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.emote {
  height: calc(20px * var(--scale));
  max-width: none;
  object-fit: contain;
  vertical-align: text-bottom;
  margin: 0 1px;
}

.empty {
  padding: 12px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

@keyframes enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

const chatOverlayJs = `
${buildOverlayStyleScript('window')}

(function () {
  var listEl = document.getElementById('chat-list');
  var renderedIds = new Set();
  // Per-platform metadata for the chat overlay. The overlay runs in a
  // browser popup so it can't import the renderer registry — but the shape
  // mirrors what PlatformProvider exposes there. Adding a new platform is
  // one entry here plus the matching renderer provider.
  // - cssClass:    bound to .chat-message.<cls> / .platform-badge.<cls> rules above
  // - label:       text shown in the message's platform badge
  // - icon:        SVG path drawn in the badge and as a fallback avatar
  // - badgeStyle:  'native' (adapter ships badge image URLs on the message,
  //                  e.g. Twitch via tmi.js) or 'synthesized' (the row draws
  //                  an avatar slot and a textual MOD label instead)
  // - subscriberBadge: which badge id earns the supporter star — YouTube
  //                    drivers use 'member', others use 'subscriber'
  // - authorAtPrefix: whether to prepend '@' to the author name
  var PLATFORMS = {
    twitch: {
      cssClass: 'twitch',
      label: 'Twitch',
      icon: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
      badgeStyle: 'native',
      subscriberBadge: 'subscriber',
      authorAtPrefix: false,
    },
    youtube: {
      cssClass: 'youtube',
      label: 'YouTube',
      icon: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
      badgeStyle: 'synthesized',
      subscriberBadge: 'member',
      authorAtPrefix: true,
    },
    'youtube-api': {
      cssClass: 'youtube',
      label: 'YouTube',
      icon: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
      badgeStyle: 'synthesized',
      subscriberBadge: 'member',
      authorAtPrefix: true,
    },
    kick: {
      cssClass: 'kick',
      label: 'Kick',
      icon: 'M2 2h4v8l4-4h4l-6 6 6 6h-4l-4-4v4H2V2zm14 0h4v20h-4z',
      badgeStyle: 'synthesized',
      subscriberBadge: 'subscriber',
      authorAtPrefix: false,
    },
    tiktok: {
      cssClass: 'tiktok',
      label: 'TikTok',
      icon: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.67a8.17 8.17 0 0 0 4.79 1.53V6.75a4.85 4.85 0 0 1-1.02-.06z',
      badgeStyle: 'synthesized',
      subscriberBadge: 'subscriber',
      authorAtPrefix: false,
    },
  };
  var DEFAULT_PLATFORM = PLATFORMS.twitch;

  function platformOf(id) {
    return PLATFORMS[String(id || '').toLowerCase()] || DEFAULT_PLATFORM;
  }

  var defaultColors = [
    '#FF0000', '#0000FF', '#008000', '#B22222', '#FF7F50',
    '#9ACD32', '#FF4500', '#2E8B57', '#DAA520', '#D2691E',
    '#5F9EA0', '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F',
  ];

  function platformClass(platform) {
    return platformOf(platform).cssClass;
  }

  function platformLabel(platform) {
    return platformOf(platform).label;
  }

  function iconFor(platform) {
    return platformOf(platform).icon;
  }

  function resolveAuthorColor(message) {
    if (message.color) return message.color;
    var author = String(message.author || '');
    var hash = 0;
    for (var i = 0; i < author.length; i += 1) {
      hash = author.charCodeAt(i) + ((hash << 5) - hash);
    }
    return defaultColors[Math.abs(hash) % defaultColors.length];
  }

  function hasBadge(message, exact, prefix) {
    return Array.isArray(message.badges) && message.badges.some(function (badge) {
      return badge === exact || (prefix && String(badge).indexOf(prefix) === 0);
    });
  }

  function isSubscriber(message) {
    var meta = platformOf(message.platform);
    if (meta.subscriberBadge === 'member') return hasBadge(message, 'member');
    return hasBadge(message, 'subscriber', 'subscriber/') || hasBadge(message, 'member');
  }

  function isModerator(message) {
    return hasBadge(message, 'moderator', 'moderator/');
  }

  function appendSvgIcon(parent, pathData) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
    parent.appendChild(svg);
  }

  function appendAvatar(meta, message, platform, authorColor) {
    // Native-badge platforms (Twitch) get badge images attached to the
    // message — they fill the avatar slot, so we skip the synth one here.
    if (platformOf(platform).badgeStyle === 'native') return;

    if (message.avatarUrl) {
      var img = document.createElement('img');
      img.className = 'avatar';
      img.src = message.avatarUrl;
      img.alt = message.author || '';
      img.style.outline = '1.5px solid ' + authorColor + '60';
      img.onerror = function () { img.style.display = 'none'; };
      meta.appendChild(img);
      return;
    }

    var fallback = document.createElement('span');
    fallback.className = 'avatar-fallback';
    fallback.style.backgroundColor = authorColor + '28';
    fallback.style.color = authorColor;
    appendSvgIcon(fallback, iconFor(platform));
    meta.appendChild(fallback);
  }

  function appendNativeBadges(meta, message) {
    // Only native-badge platforms (Twitch) ship rendered badge image URLs
    // on the message. The .twitch-badge class is historical; keep it so
    // existing overlay CSS still applies, but the logic is platform-agnostic.
    if (platformOf(message.platform).badgeStyle !== 'native' || !Array.isArray(message.badgeUrls)) return;
    message.badgeUrls.forEach(function (url) {
      var badge = document.createElement('img');
      badge.className = 'twitch-badge';
      badge.src = url;
      badge.alt = '';
      meta.appendChild(badge);
    });
  }

  function appendContent(container, message) {
    if (Array.isArray(message.contentParts) && message.contentParts.length > 0) {
      message.contentParts.forEach(function (part) {
        if (part && part.type === 'emote' && part.imageUrl) {
          var img = document.createElement('img');
          img.className = 'emote';
          img.src = part.imageUrl;
          img.alt = part.name || '';
          img.title = part.name || '';
          container.appendChild(img);
          return;
        }

        container.appendChild(document.createTextNode(part && part.text ? part.text : ''));
      });
      return;
    }

    var content = String(message.content || '');
    var urlRegex = /https?:\\/\\/[^\\s]+/gi;
    var lastIndex = 0;
    var match;
    while ((match = urlRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(content.slice(lastIndex, match.index)));
      }
      var raw = match[0];
      var trimmed = raw.replace(/[),.!?:;]+$/, '');
      var trailing = raw.slice(trimmed.length);
      var link = document.createElement('a');
      link.href = trimmed;
      link.textContent = trimmed;
      container.appendChild(link);
      if (trailing) container.appendChild(document.createTextNode(trailing));
      lastIndex = match.index + raw.length;
    }
    if (lastIndex < content.length) container.appendChild(document.createTextNode(content.slice(lastIndex)));
  }

  // Scrolling container — used to detect "am I at the bottom?" before
  // rendering and re-stick to the bottom afterwards, without fighting the
  // streamer who scrolled up to read history.
  var scrollEl = document.querySelector('.chat-overlay');
  function isNearBottom(el) {
    if (!el) return true;
    return (el.scrollHeight - el.clientHeight - el.scrollTop) < 24;
  }
  function scrollToBottom(el) {
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  function render(messages) {
    if (!listEl) return;
    var latest = messages.slice(-100);
    var stickToBottom = isNearBottom(scrollEl);

    if (latest.length === 0) {
      if (!listEl.querySelector('.empty')) {
        listEl.textContent = '';
        var empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Aguardando mensagens do chat...';
        listEl.appendChild(empty);
      }
      if (stickToBottom) scrollToBottom(scrollEl);
      return;
    }

    var latestIds = new Set(latest.map(function (message) { return message.id; }));
    Array.from(listEl.children).forEach(function (child) {
      if (child.classList.contains('empty') || !latestIds.has(child.getAttribute('data-id'))) {
        child.remove();
      }
    });

    latest.forEach(function (message) {
      var alreadyRendered = Array.from(listEl.children).some(function (child) {
        return child.getAttribute('data-id') === message.id;
      });
      if (renderedIds.has(message.id) && alreadyRendered) return;

      var row = document.createElement('article');
      var platform = platformClass(message.platform);
      var isCommand = String(message.content || '').indexOf('!') === 0;
      var authorColor = resolveAuthorColor(message);
      row.className = 'chat-message ' + platform + (isCommand ? ' command' : '');
      row.setAttribute('data-id', message.id);

      var body = document.createElement('div');
      body.className = 'body';

      var meta = document.createElement('div');
      meta.className = 'meta';

      var badge = document.createElement('span');
      badge.className = 'platform-badge ' + platform;
      appendSvgIcon(badge, iconFor(platform));
      badge.appendChild(document.createTextNode(platformLabel(platform)));
      meta.appendChild(badge);

      appendAvatar(meta, message, platform, authorColor);
      appendNativeBadges(meta, message);

      if (isSubscriber(message)) {
        var star = document.createElement('span');
        star.className = 'member-star';
        star.textContent = '★';
        meta.appendChild(star);
      }

      var meta_ = platformOf(platform);
      var author = document.createElement('span');
      author.className = 'author';
      var rawAuthor = message.author || 'chat';
      author.textContent = meta_.authorAtPrefix ? '@' + rawAuthor : rawAuthor;
      author.style.color = authorColor;
      meta.appendChild(author);

      // Native-badge platforms surface "Mod" via the badge image; the
      // synthesized renderer falls back to a textual MOD chip.
      if (meta_.badgeStyle !== 'native' && isModerator(message)) {
        var mod = document.createElement('span');
        mod.className = 'mod';
        mod.textContent = 'MOD';
        meta.appendChild(mod);
      }

      var content = document.createElement('p');
      content.className = 'content' + (isCommand ? ' command' : '');
      appendContent(content, message);

      body.appendChild(meta);
      body.appendChild(content);
      row.appendChild(body);
      listEl.appendChild(row);
      renderedIds.add(message.id);
    });

    renderedIds.forEach(function (id) {
      if (!latestIds.has(id)) renderedIds.delete(id);
    });

    if (stickToBottom) scrollToBottom(scrollEl);
  }

  async function refresh() {
    try {
      var response = await fetch('/chat/overlay/state', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var snapshot = await response.json();
      render(Array.isArray(snapshot.messages) ? snapshot.messages : []);
    } catch (error) {
      console.error('Failed to refresh chat overlay', error);
    }
  }

  refresh();
  setInterval(refresh, 1000);
})();
`;

const overlayCss = `
:root {
  /* Live-customizable visual style — vars below are written by the merge
   * JS (defaults ⊕ per-overlay prefs). Each existing design token below
   * (--surface, --r, --text, --rose) derives from one of them so the
   * editor reskins the whole raffle in one shot. */
  --bg-color-rgb: 11, 14, 28;
  --border-radius: 18px;
  --border-color: rgba(255, 255, 255, 0.07);
  --border-width: 1px;
  --text-color: #f1f5f9;
  --accent-color: #ff6b6b;
  --font: "DM Sans", sans-serif;
  --bg: #ffffff;
  --surface: rgba(var(--bg-color-rgb), 1);
  --surface-2: rgba(var(--bg-color-rgb), 0.75);
  --border: var(--border-color);
  --gold: #f0c020;
  --gold-glow: rgba(240, 192, 32, 0.22);
  --blue-glow: rgba(77, 171, 247, 0.18);
  --green: #40c057;
  --green-glow: rgba(64, 192, 87, 0.16);
  --rose: var(--accent-color);
  --rose-glow: rgba(255, 107, 107, 0.16);
  --cyan: #22d3ee;
  --cyan-glow: rgba(34, 211, 238, 0.18);
  --text: var(--text-color);
  --text-dim: #64748b;
  --r: var(--border-radius);
  /* Backdrop alpha — controlled live via the WS topic overlay-prefs:raffles.
   * Default 0 keeps the OBS scene fully visible behind the wheel; raising it
   * adds a (tinted) layer behind the overlay for legibility on busy scenes. */
  --opacity: 0;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  min-height: 100vh;
  background-color: rgba(var(--bg-color-rgb), var(--opacity, 0));
  font-family: var(--font);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  transition: background-color 150ms ease;
}

.overlay {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(1300px, 100%);
}

/* ── HEADER ── */

.header {
  background: var(--surface);
  border: var(--border-width) solid var(--border);
  border-radius: var(--r);
  padding: 14px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  position: relative;
  overflow: hidden;
}

.header::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(240,192,32,0.04) 0%, transparent 50%);
  pointer-events: none;
}

.live-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--rose);
  margin-bottom: 5px;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rose);
  box-shadow: 0 0 8px var(--rose);
  animation: live-blink 1.4s ease-in-out infinite;
}

@keyframes live-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}

.raffle-title {
  font-family: "Bebas Neue", sans-serif;
  font-size: clamp(34px, 4.5vw, 60px);
  line-height: 1;
  letter-spacing: 0.02em;
  color: var(--text);
}

.status-badge {
  flex-shrink: 0;
  padding: 9px 18px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  background: rgba(148, 163, 184, 0.08);
  color: var(--text-dim);
  border: 1px solid rgba(148, 163, 184, 0.12);
  transition: background 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s;
}

.status-badge.is-collecting {
  background: var(--green-glow);
  color: #86efac;
  border-color: rgba(64, 192, 87, 0.3);
}

.status-badge.is-ready {
  background: var(--blue-glow);
  color: #93c5fd;
  border-color: rgba(77, 171, 247, 0.3);
}

.status-badge.is-spinning {
  background: var(--cyan-glow);
  color: var(--cyan);
  border-color: rgba(34, 211, 238, 0.38);
  animation: badge-pulse 0.9s ease-in-out infinite;
}

.status-badge.is-top2 {
  background: var(--gold-glow);
  color: #fde68a;
  border-color: rgba(240, 192, 32, 0.38);
}

.status-badge.is-completed {
  background: var(--gold-glow);
  color: var(--gold);
  border-color: rgba(240, 192, 32, 0.42);
  box-shadow: 0 0 16px var(--gold-glow);
}

.status-badge.is-cancelled {
  background: var(--rose-glow);
  color: #fca5a5;
  border-color: rgba(255, 107, 107, 0.3);
}

@keyframes badge-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.4); }
  50% { box-shadow: 0 0 0 5px rgba(34, 211, 238, 0); }
}

/* ── STAGE ── */

.stage {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 12px;
  align-items: start;
}

/* ── WHEEL ── */

.wheel-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.wheel-frame {
  position: relative;
  width: min(100%, 580px);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid rgba(255,255,255,0.05);
  box-shadow:
    0 0 0 10px rgba(255,255,255,0.02),
    0 40px 100px rgba(0,0,0,0.55),
    0 0 70px rgba(240,192,32,0.05);
}

.wheel {
  width: 94%;
  aspect-ratio: 1;
  border-radius: 50%;
  position: relative;
  overflow: hidden;
  border: 2px solid rgba(255,255,255,0.06);
  box-shadow:
    inset 0 0 20px rgba(0,0,0,0.35),
    0 0 20px rgba(0,0,0,0.3);
  background: var(--surface-2);
}

.wheel-pointer {
  position: absolute;
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 17px solid transparent;
  border-right: 17px solid transparent;
  border-top: 32px solid var(--gold);
  z-index: 10;
  filter: drop-shadow(0 4px 14px rgba(240,192,32,0.75));
}

.wheel-hub {
  position: absolute;
  width: 84px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid rgba(240,192,32,0.28);
  box-shadow:
    0 0 0 4px rgba(255,255,255,0.025),
    0 0 24px rgba(240,192,32,0.14),
    inset 0 0 20px rgba(0,0,0,0.4);
  z-index: 5;
  display: grid;
  place-items: center;
}

.wheel-hub-core {
  width: 46px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: linear-gradient(145deg, var(--gold), #a87900);
  box-shadow: 0 4px 20px rgba(240,192,32,0.38);
}

.round-badge {
  background: var(--surface);
  border: 1px solid rgba(240,192,32,0.22);
  color: var(--gold);
  padding: 6px 18px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.round-badge.hidden { display: none !important; }

/* ── SIDE PANEL ── */

.side-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-card {
  background: var(--surface);
  border: var(--border-width) solid var(--border);
  border-radius: var(--r);
  padding: 16px 18px;
  position: relative;
  overflow: hidden;
  transition: border-color 0.3s, box-shadow 0.3s;
}

.info-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 10px;
}

.participants-row {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.count-main {
  font-family: "Bebas Neue", sans-serif;
  font-size: 54px;
  line-height: 1;
  color: var(--text);
}

.count-sep {
  font-size: 22px;
  color: var(--text-dim);
  font-weight: 300;
}

.count-total {
  font-family: "Bebas Neue", sans-serif;
  font-size: 30px;
  color: var(--text-dim);
}

.result-card.is-winner {
  border-color: rgba(240,192,32,0.32);
  box-shadow: 0 0 28px rgba(240,192,32,0.08);
}

.result-card.is-winner::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
}

.result-name {
  font-family: "Bebas Neue", sans-serif;
  font-size: clamp(26px, 3vw, 44px);
  line-height: 1.05;
  word-break: break-word;
  color: var(--text);
  transition: color 0.4s, text-shadow 0.4s;
}

.result-name.is-winner {
  color: var(--gold);
  animation: winner-glow 2s ease-in-out infinite;
}

@keyframes winner-glow {
  0%, 100% { text-shadow: 0 0 18px rgba(240,192,32,0.3); }
  50% { text-shadow: 0 0 48px rgba(240,192,32,0.65), 0 0 80px rgba(240,192,32,0.18); }
}

.result-caption {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
}

.top2-card.hidden { display: none !important; }

.top2-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.top2-chip {
  display: flex;
  align-items: center;
  gap: 9px;
  background: rgba(64,192,87,0.08);
  border: 1px solid rgba(64,192,87,0.2);
  border-radius: 10px;
  padding: 9px 13px;
  font-size: 13px;
  font-weight: 600;
  color: #86efac;
}

.top2-chip::before {
  content: "";
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 8px var(--green);
}

@media (max-width: 880px) {
  .stage { grid-template-columns: 1fr; }
  .side-panel { flex-direction: row; flex-wrap: wrap; }
  .info-card { flex: 1 1 200px; }
}
`;

const overlayJs = `
'use strict';
${buildOverlayStyleScript('raffles')}

var PALETTE = [
  '#e63946', '#4361ee', '#f4a261', '#7b2d8b',
  '#2ec4b6', '#e76f51', '#1982c4', '#f9c74f',
  '#90be6d', '#f72585', '#43aa8b', '#3a86ff'
];

var titleEl = document.getElementById('raffle-title');
var statusEl = document.getElementById('raffle-status');
var wheelEl = document.getElementById('wheel');
var resultEl = document.getElementById('result-name');
var resultCardEl = document.getElementById('result-card');
var captionEl = document.getElementById('result-caption');
var resultLabelEl = document.getElementById('result-label');
var top2ContainerEl = document.getElementById('top2-container');
var top2ListEl = document.getElementById('top2-list');
var activeCountEl = document.getElementById('active-count');
var totalCountEl = document.getElementById('total-count');
var roundBadgeEl = document.getElementById('round-badge');
var roundNumEl = document.getElementById('round-num');
var lastSessionId = null;
var lastEntriesKey = null;
var currentRotDeg = 0;

function statusLabel(status) {
  switch (status) {
    case 'collecting': return 'Inscricoes abertas';
    case 'ready_to_spin': return 'Pronto para girar';
    case 'spinning': return 'Girando...';
    case 'paused_top2': return 'Top 2 definido';
    case 'completed': return 'Vencedor!';
    case 'cancelled': return 'Cancelado';
    default: return 'Aguardando';
  }
}

function statusModifier(status) {
  switch (status) {
    case 'collecting': return 'is-collecting';
    case 'ready_to_spin': return 'is-ready';
    case 'spinning': return 'is-spinning';
    case 'paused_top2': return 'is-top2';
    case 'completed': return 'is-completed';
    case 'cancelled': return 'is-cancelled';
    default: return '';
  }
}

function statusCaption(state) {
  if (state.status === 'collecting') return 'Aguardando participantes no chat.';
  if (state.status === 'ready_to_spin') return 'Pronto. Aguardando o trigger do streamer.';
  if (state.status === 'spinning') return 'Rodada em andamento...';
  if (state.status === 'paused_top2') return 'Os dois finalistas foram definidos.';
  if (state.status === 'completed') return 'Parabens ao vencedor!';
  if (state.status === 'cancelled') return 'O sorteio foi cancelado.';
  return 'Aguardando inicio do sorteio.';
}

function renderWheel(entries) {
  var key = entries && entries.length ? entries.map(function(e) { return e.id; }).join(',') : '';
  if (lastEntriesKey === key) return;
  lastEntriesKey = key;
  wheelEl.innerHTML = '';
  if (!entries || !entries.length) return;

  var n = entries.length;
  var arc = 360 / n;
  var cx = 50, cy = 50, r = 48;
  var textR = n === 1 ? 0 : (n <= 4 ? 29 : n <= 10 ? 32 : 30);
  var svgNS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.style.cssText = 'display:block;width:100%;height:100%;';

  for (var i = 0; i < n; i++) {
    var startDeg = i * arc - 90;
    var endDeg = startDeg + arc;
    var startRad = startDeg * Math.PI / 180;
    var endRad = endDeg * Math.PI / 180;
    var x1 = cx + r * Math.cos(startRad);
    var y1 = cy + r * Math.sin(startRad);
    var x2 = cx + r * Math.cos(endRad);
    var y2 = cy + r * Math.sin(endRad);
    var largeArc = arc > 180 ? 1 : 0;
    var d = 'M ' + cx + ' ' + cy +
      ' L ' + x1.toFixed(3) + ' ' + y1.toFixed(3) +
      ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2.toFixed(3) + ' ' + y2.toFixed(3) + ' Z';

    var path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', PALETTE[i % PALETTE.length]);
    path.setAttribute('stroke', 'rgba(0,0,0,0.18)');
    path.setAttribute('stroke-width', '0.35');
    svg.appendChild(path);

    if (n <= 40 && arc >= 6) {
      var midDeg = startDeg + arc / 2;
      var midRad = midDeg * Math.PI / 180;
      var lx = cx + textR * Math.cos(midRad);
      var ly = cy + textR * Math.sin(midRad);
      var rotateDeg = midDeg;

      // Base font size from segment count (tangential constraint — must fit within arc height)
      var baseFontSize = n > 20 ? 2.6 : n > 12 ? 3.4 : n > 6 ? 4.2 : 5.2;
      var minFontSize = 2.0;
      // Approx character width-to-height ratio for DM Sans Bold
      var charW = 0.56;
      // Available radial space (centered at textR, bounded by hub ~12 and outer rim r)
      var radialBudget = 2 * Math.min(textR - 9, r - textR);

      var rawLabel = entries[i].label;
      var fitFontSize = rawLabel.length > 0 ? radialBudget / (rawLabel.length * charW) : baseFontSize;
      var fontSize, displayName;

      if (fitFontSize >= baseFontSize) {
        fontSize = baseFontSize;
        displayName = rawLabel;
      } else if (fitFontSize >= minFontSize) {
        fontSize = Math.round(fitFontSize * 10) / 10;
        displayName = rawLabel;
      } else {
        fontSize = minFontSize;
        var maxChars = Math.floor(radialBudget / (minFontSize * charW));
        displayName = rawLabel.length > maxChars
          ? rawLabel.slice(0, Math.max(maxChars - 1, 1)) + '\u2026'
          : rawLabel;
      }

      var text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', lx.toFixed(3));
      text.setAttribute('y', ly.toFixed(3));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('transform', 'rotate(' + rotateDeg.toFixed(2) + ',' + lx.toFixed(3) + ',' + ly.toFixed(3) + ')');
      text.setAttribute('fill', 'rgba(255,255,255,0.93)');
      text.setAttribute('font-family', 'DM Sans, sans-serif');
      text.setAttribute('font-weight', '700');
      text.setAttribute('font-size', String(fontSize));
      text.style.pointerEvents = 'none';
      text.textContent = displayName;
      svg.appendChild(text);
    }
  }

  wheelEl.appendChild(svg);
}

function applyState(state) {
  titleEl.textContent = state.title || 'Sorteio';
  statusEl.textContent = statusLabel(state.status);
  statusEl.className = 'status-badge ' + statusModifier(state.status);

  var active = state.activeEntries ? state.activeEntries.length : 0;
  activeCountEl.textContent = active;
  totalCountEl.textContent = state.totalEntries || 0;

  if (state.round > 0) {
    roundBadgeEl.classList.remove('hidden');
    roundNumEl.textContent = state.round;
  } else {
    roundBadgeEl.classList.add('hidden');
  }

  renderWheel(state.activeEntries || []);
  captionEl.textContent = statusCaption(state);

  if (state.top2Labels && state.top2Labels.length > 0) {
    top2ContainerEl.classList.remove('hidden');
    top2ListEl.innerHTML = state.top2Labels.map(function(label) {
      return '<div class="top2-chip">' + label + '</div>';
    }).join('');
  } else {
    top2ContainerEl.classList.add('hidden');
  }

  if (state.status === 'completed' && state.highlightedEntryLabel) {
    resultLabelEl.textContent = 'Vencedor';
    resultEl.textContent = state.highlightedEntryLabel;
    resultEl.className = 'result-name is-winner';
    resultCardEl.className = 'info-card result-card is-winner';
    captionEl.textContent = 'Parabens ao vencedor!';
  } else if (state.highlightedEntryLabel) {
    resultLabelEl.textContent = 'Resultado';
    resultEl.textContent = state.highlightedEntryLabel;
    resultEl.className = 'result-name';
    resultCardEl.className = 'info-card result-card';
  } else if (active > 0) {
    resultLabelEl.textContent = 'Participantes';
    resultEl.textContent = active + ' na roda';
    resultEl.className = 'result-name';
    resultCardEl.className = 'info-card result-card';
  } else {
    resultLabelEl.textContent = 'Resultado';
    resultEl.textContent = String.fromCharCode(8212);
    resultEl.className = 'result-name';
    resultCardEl.className = 'info-card result-card';
  }

  if (state.status === 'spinning' && state.sessionId && lastSessionId !== state.sessionId) {
    lastSessionId = state.sessionId;
    // MAX_SPIN_MS is the reference duration for exactly 8 full rotations.
    // Shorter durations spin proportionally fewer rotations (min 1).
    var MAX_SPIN_MS = 8000;
    var dur = (state.animation && state.animation.durationMs) ? state.animation.durationMs : MAX_SPIN_MS;
    var numRotations = Math.max(1, Math.round((Math.min(dur, MAX_SPIN_MS) / MAX_SPIN_MS) * 8));

    // Compute landing angle from targetEntryId + activeEntries
    var landingOffset = 0;
    var entries2 = state.activeEntries || [];
    var n2 = entries2.length;
    if (n2 > 0 && state.animation && state.animation.targetEntryId) {
      var targetIdx = -1;
      for (var j = 0; j < n2; j++) {
        if (entries2[j].id === state.animation.targetEntryId) { targetIdx = j; break; }
      }
      if (targetIdx >= 0) {
        var arc2 = 360 / n2;
        var targetCenter = targetIdx * arc2 + arc2 / 2;
        landingOffset = (360 - targetCenter + 360) % 360;
      }
    }
    if (landingOffset < 60) landingOffset += 360;

    var prevRot = currentRotDeg;
    var linearEnd = prevRot + numRotations * 360;
    var totalEnd = linearEnd + landingOffset;
    currentRotDeg = totalEnd;

    // Phase 1 (82% of time): numRotations full rotations at constant speed
    // Phase 2 (18% of time): ease-out deceleration to final position
    var anim = wheelEl.animate([
      { transform: 'rotate(' + prevRot + 'deg)', easing: 'linear', offset: 0 },
      { transform: 'rotate(' + linearEnd + 'deg)', easing: 'cubic-bezier(0, 0, 0.25, 1)', offset: 0.82 },
      { transform: 'rotate(' + totalEnd + 'deg)', offset: 1 }
    ], { duration: dur, fill: 'forwards' });
    anim.addEventListener('finish', function() {
      anim.commitStyles();
      anim.cancel();
    });
  } else if (state.status !== 'spinning') {
    lastSessionId = state.sessionId;
  }
}

async function fetchState() {
  var response = await fetch('/raffles/overlay/state', { cache: 'no-store' });
  if (!response.ok) throw new Error('Erro ao buscar estado (' + response.status + ')');
  return response.json();
}

async function tick() {
  try {
    var state = await fetchState();
    applyState(state);
  } catch (error) {
    if (captionEl) captionEl.textContent = error instanceof Error ? error.message : 'Falha ao atualizar overlay';
  } finally {
    window.setTimeout(tick, 1000);
  }
}

tick();
`;

// ── Polls overlay ────────────────────────────────────────────────────────────

const pollsOverlayHtml = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Enquete — Overlay</title>${buildGoogleFontsLink()}
    <link rel="stylesheet" href="/polls/overlay/overlay.css" />
  </head>
  <body>
    <div id="root" class="poll-overlay idle">
      <header class="poll-header">
        <span class="poll-tag">ENQUETE</span>
        <h1 id="poll-title" class="poll-title">Aguardando...</h1>
        <div class="poll-meta">
          <span id="poll-total">0 votos</span>
          <span id="poll-timer" class="poll-timer">--</span>
        </div>
      </header>
      <ul id="poll-options" class="poll-options"></ul>
      <p id="poll-status" class="poll-status">Aguardando inicio</p>
    </div>
    <script src="/polls/overlay/overlay.js"></script>
  </body>
</html>`;

const pollsOverlayCss = `
:root {
  color-scheme: dark;
  /* Live-customizable visual style — see chat overlay for the same pattern.
   * Existing tokens below derive from these so the visual editor reskins
   * the poll card by changing the universal vars only. */
  --bg-color-rgb: 17, 21, 39;
  --border-radius: 18px;
  --border-color: rgba(255,255,255,0.08);
  --border-width: 1px;
  --text-color: #f1f5f9;
  --accent-color: #7c5cff;
  --font: "DM Sans", sans-serif;
  --bg: #0b0e1c;
  --surface: rgba(var(--bg-color-rgb), 0.92);
  --border: var(--border-color);
  --text: var(--text-color);
  --text-dim: #94a3b8;
  --accent: var(--accent-color);
  --accent-2: #22d3ee;
  --winner: #f0c020;
  /* Backdrop alpha — controlled live via overlay-prefs:polls. Adds a
   * (tinted) layer behind the entire viewport; useful when the scene
   * behind the overlay is too busy. */
  --opacity: 0;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  height: 100%;
  background-color: rgba(var(--bg-color-rgb), var(--opacity, 0));
  font-family: var(--font);
  color: var(--text);
  transition: background-color 150ms ease;
}
.poll-overlay {
  width: min(560px, 100%);
  margin: 24px;
  padding: 22px 24px;
  background: var(--surface);
  border: var(--border-width) solid var(--border);
  border-radius: var(--border-radius);
  box-shadow: 0 24px 70px rgba(0,0,0,0.5);
  backdrop-filter: blur(8px);
  transition: opacity 240ms ease;
}
.poll-overlay.idle { opacity: 0; pointer-events: none; }
.poll-header { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.poll-tag {
  font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--accent);
}
.poll-title {
  font-family: "Bebas Neue", sans-serif;
  font-size: clamp(26px, 3vw, 38px);
  letter-spacing: 0.01em;
  line-height: 1.05;
}
.poll-meta { display: flex; justify-content: space-between; color: var(--text-dim); font-size: 12px; font-weight: 600; }
.poll-timer { color: var(--accent-2); font-variant-numeric: tabular-nums; }
.poll-options { list-style: none; display: flex; flex-direction: column; gap: 10px; }
.poll-option {
  position: relative;
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
  border: var(--border-width) solid var(--border);
  border-radius: 12px;
  background: rgba(255,255,255,0.04);
  overflow: hidden;
}
.poll-option .bar {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, rgba(124,92,255,0.45), rgba(34,211,238,0.18));
  width: 0%;
  transition: width 480ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.poll-option.winner .bar { background: linear-gradient(90deg, rgba(240,192,32,0.5), rgba(240,192,32,0.18)); }
.poll-option .label {
  position: relative; z-index: 1;
  display: flex; align-items: center; gap: 10px;
  font-size: 14px; font-weight: 600;
}
.poll-option .index {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 26px; height: 26px; padding: 0 6px;
  border-radius: 8px;
  font-family: "Bebas Neue", sans-serif;
  font-size: 16px;
  background: rgba(124,92,255,0.18); color: #cdb8ff;
}
.poll-option.winner .index { background: rgba(240,192,32,0.2); color: var(--winner); }
.poll-option .stats { position: relative; z-index: 1; font-size: 12px; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.poll-option .stats strong { color: var(--text); margin-left: 6px; }
.poll-status { margin-top: 12px; font-size: 12px; color: var(--text-dim); text-align: center; }
`;

const pollsOverlayJs = `
'use strict';
${buildOverlayStyleScript('polls')}

(function () {
  var rootEl = document.getElementById('root');
  var titleEl = document.getElementById('poll-title');
  var optionsEl = document.getElementById('poll-options');
  var totalEl = document.getElementById('poll-total');
  var timerEl = document.getElementById('poll-timer');
  var statusEl = document.getElementById('poll-status');
  var current = null;

  function statusLabel(status) {
    switch (status) {
      case 'active': return 'Votacao aberta';
      case 'closed': return 'Encerrado';
      case 'cancelled': return 'Cancelado';
      default: return 'Aguardando';
    }
  }

  function fmtCountdown(state) {
    if (!state.closesAt) return '--';
    var ms = new Date(state.closesAt).getTime() - Date.now();
    if (ms <= 0) return '00:00';
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    var ss = s % 60;
    return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }

  function renderTally(state) {
    var winnerId = state.winner ? state.winner.optionId : null;
    if (optionsEl.children.length !== state.tally.length) {
      optionsEl.innerHTML = '';
      state.tally.forEach(function (entry) {
        var li = document.createElement('li');
        li.className = 'poll-option';
        li.dataset.id = entry.optionId;
        li.innerHTML =
          '<span class="bar"></span>' +
          '<span class="label"><span class="index">' + entry.index + '</span><span class="text"></span></span>' +
          '<span class="stats"></span>';
        optionsEl.appendChild(li);
      });
    }
    state.tally.forEach(function (entry) {
      var li = optionsEl.querySelector('[data-id="' + entry.optionId + '"]');
      if (!li) return;
      li.classList.toggle('winner', winnerId === entry.optionId);
      li.querySelector('.text').textContent = entry.label;
      li.querySelector('.bar').style.width = (entry.percent || 0) + '%';
      li.querySelector('.stats').innerHTML = entry.percent.toFixed(1) + '% <strong>' + entry.votes + '</strong>';
    });
  }

  function applyState(state) {
    current = state;
    if (!state) {
      rootEl.classList.add('idle');
      return;
    }
    rootEl.classList.remove('idle');
    titleEl.textContent = state.title;
    totalEl.textContent = state.totalVotes + (state.totalVotes === 1 ? ' voto' : ' votos');
    statusEl.textContent = statusLabel(state.status);
    renderTally(state);
  }

  function tickTimer() {
    if (!current) { timerEl.textContent = '--'; return; }
    if (current.status !== 'active') {
      timerEl.textContent = current.status === 'closed' ? 'Encerrado' : '--';
      return;
    }
    timerEl.textContent = fmtCountdown(current);
  }

  async function fetchState() {
    try {
      var res = await fetch('/polls/overlay/state', { cache: 'no-store' });
      if (res.status === 404) { applyState(null); return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      applyState(await res.json());
    } catch (err) {
      // keep last known state on failure
    }
  }

  fetchState();
  setInterval(fetchState, 1000);
  setInterval(tickTimer, 250);
})();
`;

// ── R3 / R4: now-playing browser source (visual minimal — to be styled by overlay-kit later) ─

const nowPlayingHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Now Playing</title>${buildGoogleFontsLink()}
    <style>
      :root {
        color-scheme: dark;
        --opacity: 0;
        /* Live-customizable visual style — see chat/raffles/polls for the
         * same vars. Fields the streamer leaves unset fall back to the
         * now-playing defaults below. */
        --bg-color-rgb: 0, 0, 0;
        --border-radius: 12px;
        --border-color: transparent;
        --border-width: 0px;
        --text-color: #f1f5f9;
        --accent-color: #f1f5f9;
        --font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      html, body { margin: 0; padding: 0; height: 100%; background: transparent; font-family: var(--font); color: var(--text-color); }
      /* Backdrop behind the card — color from --bg-color-rgb (RGB triplet)
       * and alpha from --opacity (set via WS). Default 0 = transparent
       * (only thumb/text float over the scene); higher values tint/darken
       * the card box for legibility. */
      .root { display: flex; align-items: center; gap: 16px; padding: 16px; max-width: 540px; background-color: rgba(var(--bg-color-rgb), var(--opacity, 0)); border: var(--border-width) solid var(--border-color); border-radius: var(--border-radius); transition: background-color 150ms ease; }
      .root.idle { opacity: 0.0; }
      .thumb { width: 96px; height: 96px; border-radius: 12px; object-fit: cover; background: #1f2937; box-shadow: 0 8px 24px rgba(0,0,0,0.45); flex-shrink: 0; }
      .info { flex: 1; min-width: 0; }
      .title {
        font-size: 18px; font-weight: 700; margin: 0 0 4px; color: var(--accent-color);
        overflow: hidden; white-space: nowrap;
        /* mask softens the edges so the marquee doesn't clip abruptly when entering/leaving */
        -webkit-mask-image: linear-gradient(to right, transparent 0, #000 8px, #000 calc(100% - 8px), transparent 100%);
                mask-image: linear-gradient(to right, transparent 0, #000 8px, #000 calc(100% - 8px), transparent 100%);
      }
      .title-inner { display: inline-block; will-change: transform; }
      /* Ping-pong: pause at both ends + smooth easing. --marquee-distance and
         --marquee-duration are set from JS after measuring the overflow. */
      .title-inner.marquee {
        animation: title-marquee var(--marquee-duration, 12s) cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }
      @keyframes title-marquee {
        0%, 15%   { transform: translateX(0); }
        50%, 65%  { transform: translateX(var(--marquee-distance, 0px)); }
        100%      { transform: translateX(0); }
      }
      .artist { font-size: 13px; color: #94a3b8; margin: 0 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      canvas { display: block; width: 100%; height: 28px; opacity: 0.75; }
    </style>
  </head>
  <body>
    <div id="root" class="root idle">
      <img id="thumb" class="thumb" alt="" />
      <div class="info">
        <h1 id="title" class="title"><span id="title-inner" class="title-inner">—</span></h1>
        <p id="artist" class="artist">Waiting for the player to start…</p>
        <canvas id="spectrum" width="400" height="28"></canvas>
      </div>
      <audio id="audio" crossorigin="anonymous"></audio>
    </div>
    <script src="/now-playing/now-playing.js"></script>
  </body>
</html>`;

const nowPlayingJs = `
'use strict';
${buildOverlayStyleScript('now-playing')}

(function () {
  // Preview mode (`?preview=1` from OverlayPreviewGrid) silences audio
  // and renders a mock card when idle. The same overlay HTML is used in
  // OBS (audio routed via the Browser Source) and in the app's editor
  // preview iframe (where audio would leak into the streamer's speakers).
  var IS_PREVIEW = new URLSearchParams(location.search).get('preview') === '1';

  var rootEl = document.getElementById('root');
  var thumbEl = document.getElementById('thumb');
  var titleEl = document.getElementById('title');
  var titleInnerEl = document.getElementById('title-inner');
  var artistEl = document.getElementById('artist');
  var canvasEl = document.getElementById('spectrum');
  var audioEl = document.getElementById('audio');

  if (IS_PREVIEW) {
    audioEl.muted = true;
    audioEl.removeAttribute('autoplay');
  }

  var ctx = canvasEl.getContext('2d');
  var audioCtx = null;
  var analyser = null;
  var sourceNode = null;
  var lastSrc = '';

  function ensureAudioGraph() {
    if (audioCtx) return;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    sourceNode = audioCtx.createMediaElementSource(audioEl);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
    requestAnimationFrame(drawFrame);
  }

  function drawFrame() {
    if (!analyser) return;
    var bufferLength = analyser.frequencyBinCount;
    var data = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    var barWidth = canvasEl.width / bufferLength * 2.5;
    var x = 0;
    for (var i = 0; i < bufferLength; i++) {
      var height = (data[i] / 255) * canvasEl.height;
      ctx.fillStyle = 'rgba(124, 92, 255, ' + (0.4 + (data[i] / 255) * 0.5) + ')';
      ctx.fillRect(x, canvasEl.height - height, barWidth, height);
      x += barWidth + 1;
    }
    requestAnimationFrame(drawFrame);
  }

  /**
   * Measures title overflow and toggles the ping-pong marquee when the text
   * is wider than the visible area. No overflow -> animation removed, title
   * stays static. Re-measures on ResizeObserver to follow OBS source width
   * changes without needing a new title to come in.
   */
  function setTitle(text) {
    titleInnerEl.textContent = text;
    requestAnimationFrame(function () {
      var overflow = titleInnerEl.scrollWidth - titleEl.clientWidth;
      if (overflow > 4) {
        titleInnerEl.style.setProperty('--marquee-distance', '-' + overflow + 'px');
        // ~120ms per overflow-pixel + 20s baseline (5x slower than the
        // original tuning — the original felt frantic at common title widths).
        var duration = Math.max(40, Math.round(overflow * 0.12 + 20));
        titleInnerEl.style.setProperty('--marquee-duration', duration + 's');
        titleInnerEl.classList.add('marquee');
      } else {
        titleInnerEl.classList.remove('marquee');
        titleInnerEl.style.removeProperty('--marquee-distance');
        titleInnerEl.style.removeProperty('--marquee-duration');
      }
    });
  }

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function () {
      if (titleInnerEl.textContent) setTitle(titleInnerEl.textContent);
    }).observe(titleEl);
  }

  function renderPlaceholder() {
    rootEl.classList.remove('idle');
    // Bypass setTitle's overflow measurement here — at boot the iframe may
    // not have committed a layout yet and clientWidth reads 0, which
    // throws off the marquee math. Direct textContent always sticks.
    titleInnerEl.textContent = 'Música de exemplo';
    titleInnerEl.classList.remove('marquee');
    artistEl.textContent = 'Solicitada por @viewer';
    thumbEl.style.display = 'none';
  }

  function applyState(state) {
    if (!state || !state.currentItem) {
      if (IS_PREVIEW) {
        // Render a placeholder card so the streamer can see the layout
        // (and the visual editor's effect on it) without needing an
        // active song request.
        renderPlaceholder();
        return;
      }
      rootEl.classList.add('idle');
      audioEl.pause();
      audioEl.removeAttribute('src');
      lastSrc = '';
      return;
    }
    rootEl.classList.remove('idle');
    setTitle(state.currentItem.title || 'Untitled');
    artistEl.textContent = state.currentItem.requestedBy ? 'Requested by ' + state.currentItem.requestedBy : '';
    if (state.currentItem.thumbnailUrl) {
      thumbEl.src = state.currentItem.thumbnailUrl;
      thumbEl.style.display = 'block';
    } else {
      thumbEl.style.display = 'none';
    }
    if (IS_PREVIEW) return; // skip audio plumbing entirely in the preview iframe
    if (state.streamUrl && state.streamUrl !== lastSrc) {
      lastSrc = state.streamUrl;
      audioEl.src = state.streamUrl;
      ensureAudioGraph();
      audioEl.play().catch(function (err) { console.warn('autoplay blocked', err); });
    }
    if (typeof state.volume === 'number') {
      audioEl.volume = Math.max(0, Math.min(1, state.volume));
    }
    if (state.isPlaying === false) audioEl.pause();
  }

  // Kick off the placeholder render immediately in preview mode so the
  // iframe doesn't sit blank until a state push (which may never come
  // when no song is queued — music-player.ts only re-publishes on
  // subscribe when there's an active item).
  if (IS_PREVIEW) renderPlaceholder();

  function connect() {
    var ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.addEventListener('open', function () {
      ws.send(JSON.stringify({ type: 'subscribe', topic: 'now-playing' }));
    });
    ws.addEventListener('message', function (event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.topic === 'now-playing') applyState(msg.payload);
      } catch (e) { /* ignore */ }
    });
    ws.addEventListener('close', function () {
      setTimeout(connect, 1500);
    });
  }

  connect();
})();
`;

/**
 * Proxies a googlevideo response (audio/video), preserving the Range header
 * that `<audio>` uses for seek and progressive streaming.
 *
 * The User-Agent must match exactly the client that signed the URL —
 * googlevideo cross-checks UA against the `c=` query param. Other relevant
 * headers are forwarded in both directions.
 */
function proxyAudio(sourceUrl: string, req: http.IncomingMessage, res: http.ServerResponse): void {
  let upstream: URL;
  try {
    upstream = new URL(sourceUrl);
  } catch {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad source URL');
    return;
  }

  // googlevideo rejects any request WITHOUT a `Range` header with 403
  // (verified empirically: no Range -> 403, any Range -> 206). Chromium's
  // `<audio>` typically issues the first request without a Range — it
  // wants the whole file — which lands squarely on the 403. Forcing
  // `bytes=0-` here makes googlevideo return 206 from the first request,
  // and `<audio>` handles 206 fine.
  //
  // User-Agent must EXACTLY match the client that signed the URL — the
  // resolver uses ANDROID_VR and googlevideo cross-checks the UA against
  // the `c=` query param. A mismatched UA tends to 403 on c=-sensitive
  // URLs.
  const headers: http.OutgoingHttpHeaders = {
    'User-Agent': ANDROID_VR_USER_AGENT,
    Range: (req.headers.range as string | undefined) ?? 'bytes=0-',
  };
  if (req.headers['accept-encoding']) headers['Accept-Encoding'] = req.headers['accept-encoding'] as string;

  const transport = upstream.protocol === 'http:' ? http : https;
  const upstreamReq = transport.request({
    method: req.method,
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
    path: upstream.pathname + upstream.search,
    headers,
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstreamReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Upstream error: ${err.message}`);
    } else {
      res.destroy();
    }
  });

  // Browser gave up (track skip) — kill the upstream so we don't waste bandwidth.
  req.on('close', () => upstreamReq.destroy());

  upstreamReq.end();
}

