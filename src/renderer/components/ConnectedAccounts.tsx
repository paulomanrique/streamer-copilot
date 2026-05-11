import { useEffect, useMemo, useState } from 'react';

import type { PlatformAccount, PlatformAccountConnectionStatus } from '../../shared/types.js';
import { useAppStore } from '../store.js';
import { listPlatformProviders, getPlatformProvider } from '../platforms/registry.js';
import { AddPlatformWizard } from './AddPlatformWizard.js';

// Side effect imports — each provider self-registers on import.
import '../platforms/twitch-provider.js';
import '../platforms/youtube-provider.js';
import '../platforms/youtube-api-provider.js';
import '../platforms/kick-provider.js';
import '../platforms/tiktok-provider.js';

const STATUS_STYLE: Record<PlatformAccountConnectionStatus, { dot: string; text: string; label: string }> = {
  connected: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Connected' },
  connecting: { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300', label: 'Connecting…' },
  watching: { dot: 'bg-sky-400 animate-pulse', text: 'text-sky-300', label: 'Watching for live' },
  captcha: { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300', label: 'CAPTCHA needed' },
  disconnected: { dot: 'bg-gray-500', text: 'text-gray-400', label: 'Disconnected' },
  error: { dot: 'bg-rose-400', text: 'text-rose-300', label: 'Error' },
};

export function ConnectedAccounts() {
  // Touch the registry to make sure the side-effect imports are not tree-shaken.
  useMemo(() => listPlatformProviders().length, []);

  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [statuses, setStatuses] = useState<Record<string, PlatformAccountConnectionStatus>>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    const unsub = window.copilot.onAccountStatus((status) => {
      setStatuses((prev) => ({ ...prev, [status.accountId]: status.status }));
    });
    return unsub;
  }, []);

  async function refresh() {
    try {
      const list = await window.copilot.accountsList();
      setAccounts(list);
      const statusEntries = await Promise.all(list.map(async (a) => {
        const s = await window.copilot.accountsGetStatus({ id: a.id });
        return [a.id, s?.status ?? 'disconnected'] as const;
      }));
      setStatuses(Object.fromEntries(statusEntries));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function connect(id: string) {
    setBusyId(id); setError(null);
    try { await window.copilot.accountsConnect({ id }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusyId(null); }
  }

  async function disconnect(id: string) {
    setBusyId(id); setError(null);
    try { await window.copilot.accountsDisconnect({ id }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusyId(null); }
  }

  async function login(account: PlatformAccount) {
    const provider = getPlatformProvider(account.providerId);
    if (!provider?.login) return;
    setBusyId(account.id); setError(null);
    try {
      const result = await provider.login(account);
      await refresh();
      window.alert(result?.message ?? 'Logado com sucesso');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this account? You can re-add it later.')) return;
    setBusyId(id); setError(null);
    try {
      // Server-side accountsDelete handles disconnect + legacy-store cleanup
      // atomically; no need to chain a separate disconnect call here.
      await window.copilot.accountsDelete({ id });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mb-6">
      <header className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Connected accounts</h3>
          <p className="text-xs text-gray-500">Manage every chat connection in one place. Add multiple accounts per platform.</p>
        </div>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-xs text-white font-medium"
        >
          + Add network
        </button>
      </header>

      {error && (
        <div className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div>
      )}

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center text-xs text-gray-500">
          No accounts yet. Click <strong className="text-gray-300">Add network</strong> to connect your first chat source.
        </div>
      ) : (
        <ul className="space-y-2">
          {accounts.map((account) => {
            const provider = getPlatformProvider(account.providerId);
            const status = statuses[account.id] ?? 'disconnected';
            const style = STATUS_STYLE[status];
            return (
              <li key={account.id} className={['bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden border-l-4', provider?.accentClass ?? 'border-l-gray-600'].join(' ')}>
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-100 truncate">{account.label}</span>
                      <span className="text-xs text-gray-500">{provider?.displayName ?? account.providerId}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 truncate font-mono">{account.channel}</span>
                      <span className={['inline-flex items-center gap-1 text-xs', style.text].join(' ')}>
                        <span className={['w-1.5 h-1.5 rounded-full', style.dot].join(' ')} />
                        {style.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {provider?.login ? (
                      <button
                        type="button"
                        disabled={busyId === account.id}
                        onClick={() => void login(account)}
                        className="px-2 py-1 rounded bg-violet-600/20 border border-violet-500/40 text-xs text-violet-200 hover:bg-violet-600/30 disabled:opacity-50"
                        title="Re-run sign-in flow for this account"
                      >
                        Login
                      </button>
                    ) : null}
                    {status === 'connected' || status === 'connecting' || status === 'watching' ? (
                      <button
                        type="button"
                        disabled={busyId === account.id}
                        onClick={() => void disconnect(account.id)}
                        className="px-2 py-1 rounded bg-gray-700/50 hover:bg-gray-700 text-xs text-gray-300 disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === account.id}
                        onClick={() => void connect(account.id)}
                        className="px-2 py-1 rounded bg-emerald-600/20 border border-emerald-500/40 text-xs text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-50"
                      >
                        Connect
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === account.id}
                      onClick={() => void remove(account.id)}
                      className="px-2 py-1 rounded text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                      title="Remove account"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ManualYouTubeConnect />

      <AddPlatformWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => void refresh()}
      />
    </section>
  );
}

/**
 * Inline "connect by YouTube videoId" panel. Spawns a scraper for an arbitrary
 * live videoId without registering an account — useful to test chat plumbing
 * against a public live (yours or anyone else's) when the auto-monitor has
 * nothing to attach to. Session-only, gone on next app boot.
 */
function ManualYouTubeConnect() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Pulls the active YouTube streams from the store so the manual entries
  // show up as they connect, and disappear when stopped or when the auto
  // monitor cycle prunes the list.
  const allStreams = useAppStore((s) => s.youtubeStreams);
  const manualStreams = allStreams.filter((s) => s.manual);

  async function submit() {
    const videoId = extractYouTubeVideoId(input);
    if (!videoId) {
      setFeedback({ kind: 'error', text: 'Could not find a videoId in that input.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await window.copilot.youtubeConnect({ videoId });
      setFeedback({ kind: 'ok', text: `Connected scraper to ${videoId}.` });
      setInput('');
    } catch (cause) {
      setFeedback({ kind: 'error', text: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setBusy(false);
    }
  }

  async function stop(videoId: string) {
    setStoppingId(videoId);
    setFeedback(null);
    try {
      await window.copilot.youtubeDisconnectVideo({ videoId });
    } catch (cause) {
      setFeedback({ kind: 'error', text: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setStoppingId(null);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-gray-700/60 bg-gray-800/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-400 hover:text-gray-200"
      >
        <span>
          Test: connect YouTube by video URL or ID
          {manualStreams.length > 0 ? (
            <span className="ml-2 text-emerald-400">({manualStreams.length} active)</span>
          ) : null}
        </span>
        <span className="text-gray-500">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-3">
          <p className="text-xs text-gray-500">
            Spawns a session-only scraper for any live YouTube video — handy for testing chat plumbing,
            multi-stream labels, sound/voice commands, etc. without going live yourself.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="https://youtube.com/watch?v=… or video id"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void submit(); }}
              className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100"
            />
            <button
              type="button"
              disabled={busy || !input.trim()}
              onClick={() => void submit()}
              className="px-3 py-1.5 rounded bg-emerald-600/20 border border-emerald-500/40 text-xs text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-50"
            >
              {busy ? 'Connecting…' : 'Connect'}
            </button>
          </div>
          {feedback && (
            <p className={feedback.kind === 'ok' ? 'text-xs text-emerald-300' : 'text-xs text-rose-300'}>
              {feedback.text}
            </p>
          )}
          {manualStreams.length > 0 && (
            <ul className="space-y-1.5">
              {manualStreams.map((stream) => (
                <li key={stream.videoId} className="flex items-center gap-2 bg-gray-900/60 border border-gray-700/60 rounded px-3 py-1.5">
                  <span className="text-xs text-gray-400 font-medium">{stream.label}</span>
                  <span className="text-xs text-gray-500 font-mono truncate flex-1">{stream.videoId}</span>
                  {stream.viewerCount !== null && (
                    <span className="text-xs text-gray-500">{stream.viewerCount.toLocaleString()} viewers</span>
                  )}
                  <button
                    type="button"
                    disabled={stoppingId === stream.videoId}
                    onClick={() => void stop(stream.videoId)}
                    className="px-2 py-0.5 rounded text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    {stoppingId === stream.videoId ? 'Stopping…' : 'Stop'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Accepts a full youtube URL (watch / live / youtu.be / shorts) or a bare 11-char videoId. */
function extractYouTubeVideoId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Bare videoId (YouTube ids are 11 chars in [A-Za-z0-9_-]).
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      // /live/<id> and /shorts/<id> paths.
      const parts = url.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'live' || p === 'shorts' || p === 'embed');
      if (idx >= 0 && parts[idx + 1] && /^[A-Za-z0-9_-]{11}$/.test(parts[idx + 1])) {
        return parts[idx + 1];
      }
    }
  } catch {
    // fallthrough — not a parseable URL
  }
  return null;
}
