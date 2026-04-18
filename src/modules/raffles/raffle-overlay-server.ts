import http from 'node:http';

import type { AddressInfo } from 'node:net';

import type { RecentChatSnapshot } from '../../shared/ipc.js';
import type { ChatOverlayInfo, RaffleOverlayInfo, RaffleOverlayState } from '../../shared/types.js';

interface RaffleOverlayServerOptions {
  getOverlayState: (raffleId: string) => RaffleOverlayState | null;
  getChatSnapshot: () => RecentChatSnapshot;
}

const OVERLAY_PORT = 7842;
const CHAT_OVERLAY_VERSION = 'chat-feed-v3';

export class RaffleOverlayServer {
  private server: http.Server | null = null;
  private port = 0;
  private startPromise: Promise<void> | null = null;

  constructor(private readonly options: RaffleOverlayServerOptions) {}

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
        res.end(this.renderChatHtml());
        return;
      }

      if (path.startsWith('/raffles/overlay/') && path.endsWith('/state')) {
        const raffleId = decodeURIComponent(path.replace('/raffles/overlay/', '').replace('/state', '').replace(/\/$/, ''));
        const state = this.options.getOverlayState(raffleId);
        if (!state) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Raffle not found' }));
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

      if (path.startsWith('/raffles/overlay/') && path.endsWith('/overlay.css')) {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(overlayCss);
        return;
      }

      if (path.startsWith('/raffles/overlay/') && path.endsWith('/overlay.js')) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(overlayJs);
        return;
      }

      if (path.startsWith('/raffles/overlay/')) {
        const raffleId = decodeURIComponent(path.replace('/raffles/overlay/', '').replace(/\/$/, ''));
        const state = this.options.getOverlayState(raffleId);
        if (!state) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Raffle not found');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(this.renderHtml(raffleId));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    });

    this.startPromise = new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(OVERLAY_PORT, '127.0.0.1', () => resolve());
    });

    try {
      await this.startPromise;
      this.server = server;
      this.port = (server.address() as AddressInfo).port;
    } finally {
      this.startPromise = null;
    }
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    this.port = 0;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  getOverlayInfo(raffleId: string): RaffleOverlayInfo {
    if (!this.server || this.port === 0) {
      throw new Error('Raffle overlay server is not running');
    }

    const encoded = encodeURIComponent(raffleId);
    return {
      raffleId,
      overlayUrl: `http://127.0.0.1:${this.port}/raffles/overlay/${encoded}`,
      stateUrl: `http://127.0.0.1:${this.port}/raffles/overlay/${encoded}/state`,
    };
  }

  getChatOverlayInfo(): ChatOverlayInfo {
    if (!this.server || this.port === 0) {
      throw new Error('Overlay server is not running');
    }

    return {
      overlayUrl: `http://127.0.0.1:${this.port}/chat/overlay?v=${CHAT_OVERLAY_VERSION}`,
      stateUrl: `http://127.0.0.1:${this.port}/chat/overlay/state?v=${CHAT_OVERLAY_VERSION}`,
    };
  }

  private renderChatHtml(): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chat — Overlay</title>
    <link rel="stylesheet" href="/chat/overlay/overlay.css?v=${CHAT_OVERLAY_VERSION}" />
  </head>
  <body>
    <main class="chat-overlay" aria-live="polite">
      <div id="chat-list" class="chat-list"></div>
    </main>
    <script src="/chat/overlay/overlay.js?v=${CHAT_OVERLAY_VERSION}"></script>
  </body>
</html>`;
  }

  private renderHtml(raffleId: string): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sorteio — Overlay</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/raffles/overlay/${encodeURIComponent(raffleId)}/overlay.css" />
  </head>
  <body data-raffle-id="${escapeHtml(raffleId)}">
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
    <script src="/raffles/overlay/${encodeURIComponent(raffleId)}/overlay.js"></script>
  </body>
</html>`;
  }
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
  --youtube-v: rgba(251, 113, 133, 0.2);
  --youtube-v-text: #fda4af;
  --kick: rgba(34, 197, 94, 0.2);
  --kick-text: #86efac;
  --tiktok: rgba(236, 72, 153, 0.2);
  --tiktok-text: #f9a8d4;
}

*, *::before, *::after { box-sizing: border-box; }

html, body {
  width: 100%;
  min-height: 100%;
  margin: 0;
  background: #000000;
  color: var(--text-main);
  font-family: var(--font);
  overflow: hidden;
}

.chat-overlay {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: flex-end;
  padding: 8px 0 8px 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.chat-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
}

.chat-message {
  display: flex;
  gap: 6px;
  min-width: 0;
  padding: 6px 8px 6px 2px;
  border-left: 2px solid rgba(168, 85, 247, 0.2);
  cursor: default;
  user-select: text;
  transition: background 75ms ease;
  animation: enter 160ms ease-out both;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.72);
}

.chat-message.twitch { border-left-color: rgba(168, 85, 247, 0.2); }
.chat-message.youtube { border-left-color: rgba(239, 68, 68, 0.2); }
.chat-message.youtube-v { border-left-color: rgba(251, 113, 133, 0.2); }
.chat-message.kick { border-left-color: rgba(34, 197, 94, 0.2); }
.chat-message.tiktok { border-left-color: rgba(236, 72, 153, 0.2); }
.chat-message.command { background: rgba(139, 92, 246, 0.05); }

.time {
  flex: 0 0 40px;
  width: 40px;
  margin-top: 2px;
  color: var(--text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.25;
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
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
  font-size: 10px;
  line-height: 1;
  font-weight: 800;
}

.platform-badge svg {
  width: 10px;
  height: 10px;
}

.platform-badge.twitch { background: var(--twitch); color: var(--twitch-text); }
.platform-badge.youtube { background: var(--youtube); color: var(--youtube-text); }
.platform-badge.youtube-v { background: var(--youtube-v); color: var(--youtube-v-text); }
.platform-badge.kick { background: var(--kick); color: var(--kick-text); }
.platform-badge.tiktok { background: var(--tiktok); color: var(--tiktok-text); }

.avatar,
.avatar-fallback {
  width: 20px;
  height: 20px;
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
  width: 12px;
  height: 12px;
}

.twitch-badge {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  flex: 0 0 auto;
  object-fit: contain;
}

.member-star {
  color: #facc15;
  font-size: 12px;
  line-height: 1;
}

.author {
  font-size: 14px;
  line-height: 1.25;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mod {
  color: #34d399;
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
}

.content {
  margin: 2px 0 0;
  color: var(--text-main);
  font-size: 14px;
  line-height: 1.375;
  overflow-wrap: anywhere;
}

.content.command {
  color: var(--command);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.content a {
  color: #7dd3fc;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.emote {
  height: 20px;
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
(function () {
  var listEl = document.getElementById('chat-list');
  var renderedIds = new Set();
  var icons = {
    twitch: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
    youtube: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
    kick: 'M2 2h4v8l4-4h4l-6 6 6 6h-4l-4-4v4H2V2zm14 0h4v20h-4z',
    tiktok: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.67a8.17 8.17 0 0 0 4.79 1.53V6.75a4.85 4.85 0 0 1-1.02-.06z',
  };
  var defaultColors = [
    '#FF0000', '#0000FF', '#008000', '#B22222', '#FF7F50',
    '#9ACD32', '#FF4500', '#2E8B57', '#DAA520', '#D2691E',
    '#5F9EA0', '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F',
  ];

  function platformClass(platform) {
    var value = String(platform || 'twitch').replace(/[^a-z0-9-]/gi, '').toLowerCase();
    return value === 'youtube-v' ? value : (icons[value] ? value : 'twitch');
  }

  function platformLabel(platform) {
    if (platform === 'youtube-v') return 'YouTube Vertical';
    if (platform === 'youtube') return 'YouTube';
    if (platform === 'kick') return 'Kick';
    if (platform === 'tiktok') return 'TikTok';
    return 'Twitch';
  }

  function iconFor(platform) {
    return platform === 'youtube-v' ? icons.youtube : (icons[platform] || icons.twitch);
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
    if (message.platform === 'youtube' || message.platform === 'youtube-v') return hasBadge(message, 'member');
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
    if (platform === 'twitch') return;

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

  function appendTwitchBadges(meta, message) {
    if (message.platform !== 'twitch' || !Array.isArray(message.badgeUrls)) return;
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

  function toTwentyFourHourTime(label) {
    var raw = String(label || '').trim();
    var match = raw.match(/^(\\d{1,2}):(\\d{2})(?::\\d{2})?\\s*([AP]M)?$/i);
    if (!match) return raw.replace(/\\s*[AP]M\\s*$/i, '');

    var hour = Number(match[1]);
    var minute = match[2];
    var period = match[3] ? match[3].toUpperCase() : '';
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return String(hour).padStart(2, '0') + ':' + minute;
  }

  function render(messages) {
    if (!listEl) return;
    var latest = messages.slice(-100);

    if (latest.length === 0) {
      if (!listEl.querySelector('.empty')) {
        listEl.textContent = '';
        var empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Aguardando mensagens do chat...';
        listEl.appendChild(empty);
      }
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

      var time = document.createElement('span');
      time.className = 'time';
      time.textContent = toTwentyFourHourTime(message.timestampLabel);
      row.appendChild(time);

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
      appendTwitchBadges(meta, message);

      if (isSubscriber(message)) {
        var star = document.createElement('span');
        star.className = 'member-star';
        star.textContent = '★';
        meta.appendChild(star);
      }

      var author = document.createElement('span');
      author.className = 'author';
      author.textContent = platform === 'youtube' || platform === 'youtube-v' ? '@' + (message.author || 'chat') : (message.author || 'chat');
      author.style.color = authorColor;
      meta.appendChild(author);

      if (platform !== 'twitch' && isModerator(message)) {
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
  }

  async function refresh() {
    try {
      var response = await fetch('/chat/overlay/state?v=${CHAT_OVERLAY_VERSION}', { cache: 'no-store' });
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
  --bg: #ffffff;
  --surface: #0b0e1c;
  --surface-2: #111527;
  --border: rgba(255, 255, 255, 0.07);
  --gold: #f0c020;
  --gold-glow: rgba(240, 192, 32, 0.22);
  --blue-glow: rgba(77, 171, 247, 0.18);
  --green: #40c057;
  --green-glow: rgba(64, 192, 87, 0.16);
  --rose: #ff6b6b;
  --rose-glow: rgba(255, 107, 107, 0.16);
  --cyan: #22d3ee;
  --cyan-glow: rgba(34, 211, 238, 0.18);
  --text: #f1f5f9;
  --text-dim: #64748b;
  --r: 18px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  min-height: 100vh;
  background: var(--bg);
  font-family: "DM Sans", sans-serif;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
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
  border: 1px solid var(--border);
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
  border: 1px solid var(--border);
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

var PALETTE = [
  '#e63946', '#4361ee', '#f4a261', '#7b2d8b',
  '#2ec4b6', '#e76f51', '#1982c4', '#f9c74f',
  '#90be6d', '#f72585', '#43aa8b', '#3a86ff'
];

var body = document.body;
var raffleId = body.dataset.raffleId;
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
  var response = await fetch('/raffles/overlay/' + encodeURIComponent(raffleId) + '/state', { cache: 'no-store' });
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
