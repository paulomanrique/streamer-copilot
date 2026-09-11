import { useEffect, useState, type ReactNode } from 'react';

import type { PlatformAccount } from '../../shared/types.js';

export interface LiveUrlAccountActionProps {
  account: PlatformAccount;
  onChanged: () => void;
  /** providerData key the URL is stored under. */
  dataKey: string;
  title: string;
  subtitle: ReactNode;
  inputLabel: string;
  placeholder: string;
  help: ReactNode;
  invalidMessage: string;
  isValid: (value: string) => boolean;
}

/**
 * Button + modal that edits the live URL stored on an existing account.
 *
 * Why it exists: the URL is only collected while adding the account, but a
 * new live gets a new URL every time the streamer goes live — so without this
 * the only way to point the app at the current live was deleting and
 * re-adding the account. Saving reconnects the account when it's already up,
 * since adapters read the URL once at connect time.
 */
export function LiveUrlAccountAction({
  account,
  onChanged,
  dataKey,
  title,
  subtitle,
  inputLabel,
  placeholder,
  help,
  invalidMessage,
  isValid,
}: LiveUrlAccountActionProps) {
  const stored = typeof account.providerData[dataKey] === 'string' ? String(account.providerData[dataKey]) : '';
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(stored);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setValue(stored); setError(null); }
  }, [open, stored]);

  async function save() {
    const next = value.trim();
    if (!isValid(next)) {
      setError(invalidMessage);
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
        providerData: { ...account.providerData, [dataKey]: next },
      });

      // The adapter resolves the live once, on connect — so an account
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
        title="Change the live URL used by this account"
      >
        Live URL
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && setOpen(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <header className="px-5 py-4 border-b border-gray-700">
              <h3 className="font-semibold text-gray-100">{title}</h3>
              <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
            </header>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs uppercase text-gray-500 mb-1">{inputLabel}</label>
                <input
                  type="text"
                  autoFocus
                  placeholder={placeholder}
                  value={value}
                  onChange={(e) => { setValue(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !saving) void save(); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
                />
                <p className="text-xs text-gray-500 mt-2">{help}</p>
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
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || value.trim() === stored.trim()}
                className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm text-white disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
