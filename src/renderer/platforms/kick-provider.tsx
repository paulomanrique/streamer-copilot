import { useState } from 'react';

import { registerPlatformProvider, type AuthStepProps } from './registry.js';

function KickAuthStep({ channel, setChannel, setError }: AuthStepProps) {
  const [busy, setBusy] = useState(false);

  async function startOAuth() {
    setBusy(true); setError(null);
    try {
      const result = await window.copilot.kickStartOAuth({ channelSlug: channel || undefined });
      if (!channel) setChannel(result.channelSlug);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  // Client ID / Secret fields are intentionally hidden — the bundled OAuth app
  // covers the common case. We'll re-expose them as an "Advanced" toggle if we
  // start hitting rate limits or need users to bring their own Kick app.
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
  async login(account) {
    const result = await window.copilot.kickStartOAuth({ channelSlug: account.channel });
    return { message: `Logado com sucesso (${result.channelSlug})` };
  },
});
