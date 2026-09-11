import { useEffect, useState } from 'react';

import type { OverlayServerInfo } from '../../shared/ipc.js';
import type { GeneralSettings, OverlayId } from '../../shared/types.js';
import { OverlayVisualBuilder, type BuilderMode } from '../components/OverlayVisualBuilder.js';

const REFRESH_INTERVAL_MS = 3000;
const DEFAULT_PORT = 7842;

const STATUS_STYLE = {
  running: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Running' },
  stopped: { dot: 'bg-gray-500', text: 'text-gray-400', label: 'Stopped' },
  failed: { dot: 'bg-rose-400', text: 'text-rose-300', label: 'Failed' },
} as const;

/**
 * Two-mode page:
 *   - `cards`: lists the overlay URLs + a "Editar visual padrão" CTA and a
 *     "Personalizar" button on each card.
 *   - `builder`: full-page OverlayVisualBuilder, either scoped to global
 *     defaults or a single overlay. Activated by the CTA / per-card buttons.
 *
 * No router — same switch-on-state pattern used by SettingsWorkspace.
 */
type EditorMode = { kind: 'cards' } | { kind: 'builder'; mode: BuilderMode };

interface OverlayLinkProps {
  title: string;
  description: string;
  url: string | null;
  obsHints?: string[];
  /** When set, a "Personalizar" button shows up and switches the parent
   *  page into the builder scoped to this overlay. */
  customize?: { overlayId: OverlayId; onCustomize: (id: OverlayId) => void };
}

function OverlayLink({ title, description, url, obsHints, customize }: OverlayLinkProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
        <div className="flex items-baseline gap-3">
          {customize ? (
            <button
              type="button"
              onClick={() => customize.onCustomize(customize.overlayId)}
              className="text-xs text-violet-300 hover:text-violet-200"
            >
              Customize
            </button>
          ) : null}
          {url ? (
            <button type="button" onClick={() => void copy()} className="text-xs text-violet-300 hover:text-violet-200">
              {copied ? 'Copied!' : 'Copy URL'}
            </button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      <div className="mt-2 font-mono text-xs text-gray-300 break-all">
        {url ?? <span className="text-gray-600">— server not running</span>}
      </div>
      {obsHints && obsHints.length > 0 && (
        <ul className="mt-3 text-xs text-gray-400 list-disc pl-5 space-y-0.5">
          {obsHints.map((hint, i) => <li key={i}>{hint}</li>)}
        </ul>
      )}
    </div>
  );
}

export function OverlaysPage() {
  const [info, setInfo] = useState<OverlayServerInfo | null>(null);
  const [settings, setSettings] = useState<GeneralSettings | null>(null);
  const [portDraft, setPortDraft] = useState<number>(DEFAULT_PORT);
  const [portStatus, setPortStatus] = useState<string | null>(null);
  const [portError, setPortError] = useState<string | null>(null);
  const [savingPort, setSavingPort] = useState(false);
  const [editor, setEditor] = useState<EditorMode>({ kind: 'cards' });

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const next = await window.copilot.getOverlayServerInfo();
        if (!cancelled) setInfo(next);
      } catch { /* ignore */ }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.copilot.getGeneralSettings().then((current) => {
      if (cancelled) return;
      setSettings(current);
      setPortDraft(current.overlayServerPort ?? DEFAULT_PORT);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!portStatus) return;
    const t = window.setTimeout(() => setPortStatus(null), 4000);
    return () => window.clearTimeout(t);
  }, [portStatus]);

  async function savePort() {
    if (!settings) return;
    setSavingPort(true);
    setPortError(null);
    setPortStatus(null);
    try {
      const next: GeneralSettings = { ...settings, overlayServerPort: portDraft };
      await window.copilot.saveGeneralSettings(next);
      setSettings(next);
      setPortStatus('Saved. Restart the app to apply — open OBS browser sources keep the old URL until reloaded.');
    } catch (cause) {
      setPortError(cause instanceof Error ? cause.message : 'Failed to save port');
    } finally {
      setSavingPort(false);
    }
  }

  if (editor.kind === 'builder') {
    return (
      <OverlayVisualBuilder
        mode={editor.mode}
        info={info}
        onBack={() => setEditor({ kind: 'cards' })}
      />
    );
  }

  const status = info?.status ?? 'stopped';
  const style = STATUS_STYLE[status];
  const portDirty = settings ? portDraft !== (settings.overlayServerPort ?? DEFAULT_PORT) : false;
  const openOverlayBuilder = (id: OverlayId) => setEditor({ kind: 'builder', mode: { kind: 'overlay', id } });

  return (
    <div className="min-h-full p-6 max-w-2xl space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold mb-0.5">Overlays</h2>
          <p className="text-sm text-gray-500">Browser sources to add to OBS. The server runs locally — only your machine has access.</p>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ kind: 'builder', mode: { kind: 'defaults' } })}
          className="shrink-0 px-3 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
        >
          Edit default look
        </button>
      </header>

      <section className="rounded-lg border border-gray-700 bg-gray-800/40 px-4 py-3 flex items-center gap-3">
        <span className={['inline-flex items-center gap-1.5 text-xs font-medium', style.text].join(' ')}>
          <span className={['w-2 h-2 rounded-full', style.dot].join(' ')} />
          {style.label}
        </span>
        <span className="text-xs text-gray-500">Port: <code className="text-gray-300">{info?.port ?? '—'}</code></span>
        {info?.error && <span className="text-xs text-rose-300">{info.error}</span>}
      </section>

      <section className="rounded-lg border border-gray-700 bg-gray-800/40 p-4">
        <h3 className="text-sm font-semibold text-gray-100 mb-1">Server port</h3>
        <p className="text-xs text-gray-500 mb-3">
          HTTP/WebSocket port for the local overlay server. Default {DEFAULT_PORT}. Change if the port is in use. Restart the app after changing — already-open OBS browser sources keep using the old URL until reloaded.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1024}
            max={65535}
            value={portDraft}
            onChange={(event) => setPortDraft(Math.max(1024, Math.min(65535, Number(event.target.value) || DEFAULT_PORT)))}
            disabled={!settings || savingPort}
            className="w-28 bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 disabled:opacity-60"
          />
          <button
            type="button"
            disabled={!settings || !portDirty || savingPort}
            onClick={() => void savePort()}
            className="px-3 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors disabled:opacity-60 disabled:hover:bg-violet-600"
          >
            {savingPort ? 'Saving…' : 'Save'}
          </button>
          {portStatus ? <span className="text-xs text-gray-400">{portStatus}</span> : null}
          {portError ? <span className="text-xs text-rose-300">{portError}</span> : null}
        </div>
      </section>

      <OverlayLink
        title="Now playing (music)"
        description="Audio + visualizer for the music request player. The browser source is the only audio output for music — main app stays silent so you can isolate the track in OBS."
        url={info?.urls.nowPlaying ?? null}
        obsHints={[
          'Add as Browser Source in OBS.',
          'Enable "Control audio via OBS" on the source.',
          'Audio Properties → Track: 2 (or any track other than 1).',
          'Audio Monitoring: "Monitor and Output" — you hear it via OBS, Twitch live (track 1) does not.',
        ]}
        customize={{ overlayId: 'now-playing', onCustomize: openOverlayBuilder }}
      />

      <OverlayLink
        title="Chat — Overlay (on stream)"
        description="For an OBS Browser Source — transparent background and 1.5× larger font by default, to show chat over the scene/game."
        url={info?.urls.chat ?? null}
        obsHints={[
          'Add as Browser Source in OBS.',
          'Recommended size: 480 × 720 (side column) or match your scene.',
          'Optional fine-tuning via query: ?scale=2 (larger), ?transparent=0 (force opaque).',
          'Comes with a transparent background — no Custom CSS needed.',
        ]}
        customize={{ overlayId: 'chat-overlay', onCustomize: openOverlayBuilder }}
      />

      <OverlayLink
        title="Chat — Dock (panel)"
        description="For a Custom Browser Dock in OBS — opaque background and normal-sized font, to read chat while you present."
        url={info?.urls.chatDock ?? null}
        obsHints={[
          'OBS → Docks → Custom Browser Docks → Add: paste the URL.',
          'You can dock it among the other docks or float it on a second monitor.',
          'Optional fine-tuning via query: ?scale=1.2 (slightly larger text).',
        ]}
      />

      <OverlayLink
        title="Message highlight"
        description="Large card with the highlighted message — double-click a chat message (or the Highlight item in the context menu) to send it to this overlay. The OBS dock also accepts a double-click."
        url={info?.urls.highlightMessage ?? null}
        obsHints={[
          'Add as Browser Source in OBS.',
          'Cover the full canvas (1920×1080) — the card sits in the corner chosen under "Customize".',
          'The message hides on its own after the configured time (or stays until the next highlight).',
        ]}
        customize={{ overlayId: 'highlight-message', onCustomize: openOverlayBuilder }}
      />

      <OverlayLink
        title="Raffle"
        description="Visual wheel + status of the active raffle."
        url={info?.urls.raffles ?? null}
        customize={{ overlayId: 'raffles', onCustomize: openOverlayBuilder }}
      />

      <OverlayLink
        title="Polls"
        description="Live poll bars + countdown for the currently active poll."
        url={info?.urls.polls ?? null}
        customize={{ overlayId: 'polls', onCustomize: openOverlayBuilder }}
      />
    </div>
  );
}
