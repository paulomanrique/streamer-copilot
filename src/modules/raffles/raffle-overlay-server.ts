import http from 'node:http';

import type { AddressInfo } from 'node:net';

import type { RaffleOverlayInfo, RaffleOverlayState } from '../../shared/types.js';

interface RaffleOverlayServerOptions {
  getOverlayState: (raffleId: string) => RaffleOverlayState | null;
}

const OVERLAY_PORT = 7842;

export class RaffleOverlayServer {
  private server: http.Server | null = null;
  private port = 0;

  constructor(private readonly options: RaffleOverlayServerOptions) {}

  async start(): Promise<void> {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const path = url.pathname;

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

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(OVERLAY_PORT, '127.0.0.1', () => resolve());
    });
    this.port = (this.server.address() as AddressInfo).port;
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
  transition: transform 6200ms cubic-bezier(0.12, 0, 0.21, 1);
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
    var dur = state.animation && state.animation.durationMs ? state.animation.durationMs : 6200;
    var rot = state.animation && state.animation.targetRotationDeg != null ? state.animation.targetRotationDeg : 0;
    wheelEl.style.transitionDuration = dur + 'ms';
    wheelEl.style.transform = 'rotate(' + rot + 'deg)';
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
