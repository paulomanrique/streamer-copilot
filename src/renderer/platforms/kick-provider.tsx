import { useState } from 'react';

import { registerPlatformProvider, type AuthStepProps } from './registry.js';

function KickAuthStep({ draft, updateDraft, channel, setChannel, setError }: AuthStepProps) {
  const [busy, setBusy] = useState(false);
  const clientId = String(draft.clientId ?? '');
  const clientSecret = String(draft.clientSecret ?? '');

  async function startOAuth() {
    setBusy(true); setError(null);
    try {
      const result = await window.copilot.kickStartOAuth();
      if (!channel) setChannel(result.channelSlug);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">Channel slug</label>
        <input
          type="text"
          placeholder="kick.com/<slug>"
          value={channel}
          onChange={(e) => setChannel(e.target.value.trim().toLowerCase())}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">Client ID (optional)</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => updateDraft({ clientId: e.target.value.trim() })}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
          />
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">Client Secret (optional)</label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => updateDraft({ clientSecret: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
          />
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void startOAuth()}
        className="px-4 py-2 rounded bg-green-600/20 border border-green-500/40 text-green-200 hover:bg-green-600/30 disabled:opacity-50 text-sm"
      >
        {busy ? 'Waiting for browser…' : 'Authorize with Kick'}
      </button>
      <p className="text-xs text-gray-500">
        Read-only chat works without OAuth; authorization is needed to send messages, ban / timeout users and configure chat settings.
      </p>
    </div>
  );
}

registerPlatformProvider({
  id: 'kick',
  displayName: 'Kick',
  accentClass: 'border-l-green-500',
  supportsMultipleAccounts: true,
  AuthStep: KickAuthStep,
  validate(channel) {
    if (!channel) return 'Channel slug is required';
    return null;
  },
  defaultLabel(channel) { return channel; },
  async login(_account) {
    const result = await window.copilot.kickStartOAuth();
    return { message: `Logado com sucesso (${result.channelSlug})` };
  },
});
