import { useMemo, useState } from 'react';

import { listWizardPlatformProviders, type PlatformProvider } from '../platforms/registry.js';
import type { PlatformAccount } from '../../shared/types.js';

interface AddPlatformWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: (account: PlatformAccount) => void;
}

type Step = 'pick-provider' | 'auth' | 'confirm';

export function AddPlatformWizard({ open, onClose, onCreated }: AddPlatformWizardProps) {
  const providers = useMemo(() => listWizardPlatformProviders(), []);
  const [step, setStep] = useState<Step>('pick-provider');
  const [provider, setProvider] = useState<PlatformProvider | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [channel, setChannel] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerSelectedId, setPickerSelectedId] = useState<string>(providers[0]?.id ?? '');

  if (!open) return null;

  function reset() {
    setStep('pick-provider');
    setProvider(null);
    setDraft({});
    setChannel('');
    setLabel('');
    setError(null);
    setBusy(false);
    setPickerSelectedId(providers[0]?.id ?? '');
  }

  function close() {
    reset();
    onClose();
  }

  function pickProvider(p: PlatformProvider) {
    setProvider(p);
    setStep('auth');
  }

  function next() {
    if (!provider) return;
    setError(null);
    if (step === 'auth') {
      // Wizard-listed providers always have validate/defaultLabel — see
      // listWizardPlatformProviders. The optional-chain handles any
      // hide-from-wizard providers defensively.
      const validationError = provider.validate?.(channel, draft) ?? null;
      if (validationError) {
        setError(validationError);
        return;
      }
      if (!label) setLabel(provider.defaultLabel?.(channel) ?? channel);
      setStep('confirm');
    }
  }

  async function save() {
    if (!provider) return;
    setBusy(true); setError(null);
    try {
      const account = await window.copilot.accountsCreate({
        providerId: provider.id,
        label: label || provider.defaultLabel?.(channel) || channel,
        channel,
        enabled: true,
        autoConnect: true,
        providerData: draft,
      });
      onCreated(account);
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const pickerSelected = providers.find((p) => p.id === pickerSelectedId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={close}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Add network</h2>
            <p className="text-xs text-gray-500">
              {step === 'pick-provider' && 'Choose which platform to connect'}
              {step === 'auth' && provider && `Configure ${provider.displayName}`}
              {step === 'confirm' && provider && `Review ${provider.displayName} account`}
            </p>
          </div>
          <button type="button" onClick={close} className="text-gray-400 hover:text-gray-200 text-xl leading-none">×</button>
        </header>

        <div className="px-5 py-4">
          {step === 'pick-provider' && (
            <div className="space-y-3">
              <label className="block text-xs uppercase text-gray-500">Network</label>
              <select
                value={pickerSelectedId}
                onChange={(e) => setPickerSelectedId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName}</option>
                ))}
              </select>
              {pickerSelected ? (
                <p className="text-xs text-gray-500">
                  {pickerSelected.supportsMultipleAccounts ? 'Multiple accounts supported' : 'Single account'}
                </p>
              ) : null}
            </div>
          )}

          {step === 'auth' && provider?.AuthStep && (
            <provider.AuthStep
              draft={draft}
              updateDraft={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
              channel={channel}
              setChannel={setChannel}
              setLabel={setLabel}
              setError={setError}
            />
          )}

          {step === 'confirm' && provider && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs uppercase text-gray-500 mb-1">Account label</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">A friendly name shown in the connections list (e.g. &quot;Project channel&quot;).</p>
              </div>
              <dl className="text-sm space-y-1 text-gray-300">
                <div className="flex justify-between"><dt className="text-gray-500">Provider</dt><dd>{provider.displayName}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Channel</dt><dd className="font-mono">{channel}</dd></div>
              </dl>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-gray-700 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (step === 'auth') { setStep('pick-provider'); setProvider(null); }
              else if (step === 'confirm') setStep('auth');
              else close();
            }}
            className="text-sm text-gray-400 hover:text-gray-200"
          >
            {step === 'pick-provider' ? 'Cancel' : 'Back'}
          </button>
          <div className="flex gap-2">
            {step === 'pick-provider' && (
              <button
                type="button"
                disabled={!pickerSelected}
                onClick={() => pickerSelected && pickProvider(pickerSelected)}
                className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm text-white"
              >
                Continue
              </button>
            )}
            {step === 'auth' && (
              <button type="button" onClick={next} className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm text-white">Next</button>
            )}
            {step === 'confirm' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm text-white"
              >
                {busy ? 'Saving…' : 'Add account'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
