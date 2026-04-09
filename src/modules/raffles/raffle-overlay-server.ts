import http from 'node:http';

import type { AddressInfo } from 'node:net';

import type { RaffleOverlayInfo, RaffleOverlayState } from '../../shared/types.js';

interface RaffleOverlayServerOptions {
  getOverlayState: (raffleId: string) => RaffleOverlayState | null;
}

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
      this.server?.listen(0, '127.0.0.1', () => resolve());
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
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Streamer Copilot Raffle Overlay</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/raffles/overlay/${encodeURIComponent(raffleId)}/overlay.css" />
  </head>
  <body data-raffle-id="${escapeHtml(raffleId)}">
    <main class="overlay-shell">
      <section class="headline">
        <p class="eyebrow">Streamer Copilot</p>
        <h1 id="raffle-title">Loading raffle...</h1>
        <p id="raffle-status" class="status-pill">Waiting for state</p>
      </section>
      <section class="wheel-stage">
        <div class="wheel-frame">
          <div class="wheel-pointer"></div>
          <div id="wheel" class="wheel"></div>
          <div class="wheel-core">
            <span class="wheel-core-label">Spin</span>
          </div>
        </div>
        <aside class="result-panel">
          <p class="panel-label">Current result</p>
          <h2 id="result-label">No spin yet</h2>
          <p id="result-caption" class="panel-copy">Open the raffle, collect entries, then trigger the spin.</p>
          <div id="top2-list" class="top2-list hidden"></div>
        </aside>
      </section>
    </main>
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
  --bg: rgba(10, 13, 24, 0.15);
  --card: rgba(6, 10, 18, 0.76);
  --line: rgba(255, 255, 255, 0.18);
  --text: #f8fafc;
  --muted: #cbd5e1;
  --accent: #f97316;
  --accent-soft: rgba(249, 115, 22, 0.18);
  --good: #22c55e;
}

* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  min-height: 100%;
  font-family: "Space Grotesk", sans-serif;
  color: var(--text);
  background: transparent;
}

body {
  padding: 24px;
}

.overlay-shell {
  display: grid;
  gap: 20px;
  width: min(1200px, 100%);
}

.headline, .result-panel, .wheel-frame {
  border: 1px solid var(--line);
  background: linear-gradient(145deg, rgba(6, 10, 18, 0.82), rgba(20, 29, 52, 0.56));
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(20px);
}

.headline {
  padding: 20px 24px;
  border-radius: 24px;
}

.eyebrow, .panel-label {
  margin: 0 0 8px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: 12px;
  color: #fda172;
}

#raffle-title {
  margin: 0;
  font-size: clamp(32px, 5vw, 60px);
  line-height: 0.95;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: #fed7aa;
  font-size: 14px;
  font-weight: 700;
}

.wheel-stage {
  display: grid;
  grid-template-columns: minmax(340px, 700px) minmax(280px, 1fr);
  gap: 20px;
  align-items: center;
}

.wheel-frame {
  position: relative;
  aspect-ratio: 1;
  width: min(100%, 700px);
  border-radius: 32px;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.wheel {
  width: 82%;
  aspect-ratio: 1;
  border-radius: 50%;
  position: relative;
  border: 10px solid rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 0 0 6px rgba(255, 255, 255, 0.08), 0 0 50px rgba(249, 115, 22, 0.25);
  background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.12), rgba(255,255,255,0.03) 42%, rgba(0,0,0,0.22) 100%);
  transition: transform 6200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.wheel-segment {
  position: absolute;
  inset: 0;
  clip-path: polygon(50% 50%, 100% 0, 100% 100%);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 26px;
  transform-origin: 50% 50%;
}

.wheel-segment-label {
  width: 42%;
  text-align: right;
  font-size: clamp(12px, 1.5vw, 18px);
  font-weight: 700;
  color: rgba(255,255,255,0.92);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wheel-pointer {
  position: absolute;
  top: 8%;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 26px solid transparent;
  border-right: 26px solid transparent;
  border-top: 44px solid var(--accent);
  z-index: 4;
  filter: drop-shadow(0 8px 20px rgba(0,0,0,0.3));
}

.wheel-core {
  position: absolute;
  inset: auto;
  width: 130px;
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 35% 30%, #f97316, #c2410c);
  z-index: 3;
  box-shadow: 0 14px 35px rgba(249, 115, 22, 0.35);
}

.wheel-core-label {
  font-size: 22px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.result-panel {
  padding: 24px;
  border-radius: 24px;
}

#result-label {
  margin: 0;
  font-size: clamp(28px, 4vw, 54px);
  line-height: 1;
}

.panel-copy {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.45;
}

.top2-list {
  margin-top: 18px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.top2-chip {
  border: 1px solid rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.14);
  color: #bbf7d0;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 700;
}

.hidden {
  display: none !important;
}

@media (max-width: 980px) {
  .wheel-stage {
    grid-template-columns: 1fr;
  }
}
`;

const overlayJs = `
const body = document.body;
const raffleId = body.dataset.raffleId;
const titleEl = document.getElementById('raffle-title');
const statusEl = document.getElementById('raffle-status');
const wheelEl = document.getElementById('wheel');
const resultEl = document.getElementById('result-label');
const captionEl = document.getElementById('result-caption');
const top2El = document.getElementById('top2-list');
let lastSessionId = null;

function statusLabel(status) {
  switch (status) {
    case 'collecting': return 'Inscricoes abertas';
    case 'ready_to_spin': return 'Aguardando trigger';
    case 'spinning': return 'Girando agora';
    case 'paused_top2': return 'Top 2 definido';
    case 'completed': return 'Vencedor definido';
    case 'cancelled': return 'Cancelado';
    default: return 'Rascunho';
  }
}

function statusCaption(state) {
  if (state.status === 'collecting') return 'Os nomes entram na roleta conforme chegam no chat.';
  if (state.status === 'ready_to_spin') return 'A roleta esta pronta para o proximo trigger do streamer.';
  if (state.status === 'spinning') return state.highlightedEntryLabel ? 'Rodada em execucao.' : 'Preparando rodada.';
  if (state.status === 'paused_top2') return 'A final precisa de um novo trigger para escolher o vencedor.';
  if (state.status === 'completed') return 'Sorteio encerrado.';
  if (state.status === 'cancelled') return 'O sorteio foi cancelado.';
  return 'Crie um sorteio e abra as inscricoes para comecar.';
}

function segmentColor(index) {
  return index % 2 === 0 ? 'rgba(249, 115, 22, 0.85)' : 'rgba(14, 165, 233, 0.82)';
}

function renderWheel(entries) {
  wheelEl.innerHTML = '';
  if (!entries.length) {
    wheelEl.style.background = 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.12), rgba(255,255,255,0.03) 42%, rgba(0,0,0,0.22) 100%)';
    return;
  }

  const arc = 360 / entries.length;
  entries.forEach((entry, index) => {
    const segment = document.createElement('div');
    segment.className = 'wheel-segment';
    segment.style.transform = 'rotate(' + (index * arc) + 'deg)';
    segment.style.background = 'conic-gradient(from ' + (-arc / 2) + 'deg, ' + segmentColor(index) + ' 0deg ' + arc + 'deg, transparent ' + arc + 'deg 360deg)';

    const label = document.createElement('span');
    label.className = 'wheel-segment-label';
    label.textContent = entry.label;
    label.style.transform = 'rotate(' + (arc / 2) + 'deg)';
    segment.appendChild(label);
    wheelEl.appendChild(segment);
  });
}

async function fetchState() {
  const response = await fetch('/raffles/overlay/' + encodeURIComponent(raffleId) + '/state', { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to fetch state');
  return response.json();
}

function applyState(state) {
  titleEl.textContent = state.title;
  statusEl.textContent = statusLabel(state.status);
  renderWheel(state.activeEntries);
  captionEl.textContent = statusCaption(state);

  if (state.top2Labels.length > 0) {
    top2El.classList.remove('hidden');
    top2El.innerHTML = state.top2Labels.map((label) => '<span class="top2-chip">' + label + '</span>').join('');
  } else {
    top2El.classList.add('hidden');
    top2El.innerHTML = '';
  }

  if (state.highlightedEntryLabel) {
    resultEl.textContent = state.highlightedEntryLabel;
  } else if (state.activeEntries.length > 0) {
    resultEl.textContent = state.activeEntries.length + ' participantes';
  } else {
    resultEl.textContent = 'Sem participantes';
  }

  if (state.status === 'spinning' && state.sessionId && lastSessionId !== state.sessionId) {
    lastSessionId = state.sessionId;
    wheelEl.style.transitionDuration = state.animation.durationMs + 'ms';
    wheelEl.style.transform = 'rotate(' + state.animation.targetRotationDeg + 'deg)';
  } else if (state.status !== 'spinning') {
    lastSessionId = state.sessionId;
  }
}

async function tick() {
  try {
    const state = await fetchState();
    applyState(state);
  } catch (error) {
    captionEl.textContent = error instanceof Error ? error.message : 'Failed to refresh overlay';
  } finally {
    window.setTimeout(tick, 1000);
  }
}

tick();
`;
