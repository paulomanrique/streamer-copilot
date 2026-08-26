import { useEffect, useState } from 'react';

import type { PlatformAccount } from '../../shared/types.js';

/** Same shapes `parseBroadcastId` (main process) accepts: a broadcast URL or a
 *  bare broadcast id. Validated here so a typo surfaces in the modal instead of
 *  silently falling back to auto-detection at connect time. */
function isValidBroadcastRef(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true; // empty = clear the override
  try {
    const url = new URL(trimmed);
    if (/\/i\/broadcasts\/[^/?#]+/.test(url.pathname)) return true;
  } catch {
    /* not a URL — fall through to the bare-id check */
  }
  return /^[A-Za-z0-9]+$/.test(trimmed);
}

/**
 * Button + modal that edits the broadcast (live) URL of an existing X account.
 *
 * Why it exists: the URL is only collected while adding the account, but a new
 * broadcast gets a new id every time the streamer goes live — so without this
 * the only way to point the app at the current live was deleting and re-adding
 * the account. Saving reconnects the account when it's already up, since the
 * adapter reads the URL once at connect time.
 */
export function XAccountActions({ account, onChanged }: { account: PlatformAccount; onChanged: () => void }) {
  const stored = typeof account.providerData.broadcastUrl === 'string' ? account.providerData.broadcastUrl : '';
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(stored);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setValue(stored); setError(null); }
  }, [open, stored]);

  async function save() {
    const next = value.trim();
    if (!isValidBroadcastRef(next)) {
      setError('URL inválida. Use https://x.com/i/broadcasts/<id> (ou apenas o id).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await window.copilot.accountsUpdate({
        id: account.id,
        providerId: account.providerId,
        label: account.label,
        channel: account.channel,
        enabled: account.enabled,
        autoConnect: account.autoConnect,
        providerData: { ...account.providerData, broadcastUrl: next },
      });

      // The adapter resolves the broadcast once, on connect — so an account
      // that's already connected/watching has to be cycled to pick the new URL.
      const status = await window.copilot.accountsGetStatus({ id: account.id });
      if (status && status.status !== 'disconnected' && status.status !== 'error') {
        await window.copilot.accountsDisconnect({ id: account.id });
        await window.copilot.accountsConnect({ id: account.id });
      }

      onChanged();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-2 py-1 rounded bg-slate-600/30 border border-slate-500/40 text-xs text-slate-200 hover:bg-slate-600/40"
        title="Trocar a URL da live usada por esta conta"
      >
        URL da live
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && setOpen(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <header className="px-5 py-4 border-b border-gray-700">
              <h3 className="font-semibold text-gray-100">URL da live do X</h3>
              <p className="text-xs text-gray-500 mt-1">
                Conta <span className="text-gray-300">{account.label}</span> · @{account.channel}
              </p>
            </header>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs uppercase text-gray-500 mb-1">Broadcast URL</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="https://x.com/i/broadcasts/..."
                  value={value}
                  onChange={(e) => { setValue(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !saving) void save(); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
                />
                <p className="text-xs text-gray-500 mt-2">
                  A URL informada aqui tem prioridade sobre a auto-detecção da live. Cada transmissão
                  ganha uma URL nova, então cole a da live atual. Deixe em branco para voltar à
                  auto-detecção pelo @handle.
                </p>
              </div>
              {error ? (
                <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div>
              ) : null}
            </div>
            <footer className="px-5 py-3 border-t border-gray-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || value.trim() === stored.trim()}
                className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm text-white disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
