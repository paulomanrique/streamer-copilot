import { useEffect, useState } from 'react';

import type { OverlayServerInfo } from '../../shared/ipc.js';

const REFRESH_INTERVAL_MS = 3000;

const STATUS_STYLE = {
  running: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Running' },
  stopped: { dot: 'bg-gray-500', text: 'text-gray-400', label: 'Stopped' },
  failed: { dot: 'bg-rose-400', text: 'text-rose-300', label: 'Failed' },
} as const;

interface OverlayLinkProps {
  title: string;
  description: string;
  url: string | null;
  obsHints?: string[];
}

function OverlayLink({ title, description, url, obsHints }: OverlayLinkProps) {
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
        {url ? (
          <button type="button" onClick={() => void copy()} className="text-xs text-violet-300 hover:text-violet-200">
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
        ) : null}
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

  const status = info?.status ?? 'stopped';
  const style = STATUS_STYLE[status];

  return (
    <div className="min-h-full p-6 max-w-2xl space-y-5">
      <header>
        <h2 className="text-base font-semibold mb-0.5">Overlays</h2>
        <p className="text-sm text-gray-500">Browser sources to add to OBS. The server runs locally — only your machine has access.</p>
      </header>

      <section className="rounded-lg border border-gray-700 bg-gray-800/40 px-4 py-3 flex items-center gap-3">
        <span className={['inline-flex items-center gap-1.5 text-xs font-medium', style.text].join(' ')}>
          <span className={['w-2 h-2 rounded-full', style.dot].join(' ')} />
          {style.label}
        </span>
        <span className="text-xs text-gray-500">Port: <code className="text-gray-300">{info?.port ?? '—'}</code></span>
        {info?.error && <span className="text-xs text-rose-300">{info.error}</span>}
        <span className="ml-auto text-xs text-gray-500">Configure the port in General settings</span>
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
      />

      <OverlayLink
        title="Chat feed"
        description="Unified chat overlay aggregating all connected platforms."
        url={info?.urls.chat ?? null}
      />

      <OverlayLink
        title="Raffle"
        description="Visual wheel + status of the active raffle."
        url={info?.urls.raffles ?? null}
      />
    </div>
  );
}
