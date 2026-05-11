import { useEffect, useMemo, useState } from 'react';

import type { PlatformAccount, PlatformAccountConnectionStatus } from '../../shared/types.js';
import { listPlatformProviders, getPlatformProvider } from '../platforms/registry.js';
import { AddPlatformWizard } from './AddPlatformWizard.js';

// Side-effect import — registers every PlatformProvider via the registry
// barrel. Adding a new platform means dropping its file in
// `src/renderer/platforms/` and listing it in `register-all.ts`; no edit
// here is required.
import '../platforms/register-all.js';

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

      <AddPlatformWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => void refresh()}
      />
    </section>
  );
}

