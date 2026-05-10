import { useState } from 'react';

import { registerPlatformProvider, type AuthStepProps } from './registry.js';

function TwitchAuthStep({ draft, updateDraft, channel, setChannel, setError }: AuthStepProps) {
  const [busy, setBusy] = useState(false);
  const username = String(draft.username ?? '');

  async function startOAuth() {
    setBusy(true); setError(null);
    try {
      const result = await window.copilot.twitchStartOAuth();
      updateDraft({ username: result.username, oauthToken: `oauth:${result.accessToken}` });
      if (!channel) setChannel(result.username);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">Channel</label>
        <input
          type="text"
          placeholder="channel name (your channel or another)"
          value={channel}
          onChange={(e) => setChannel(e.target.value.trim().toLowerCase().replace(/^#/, ''))}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
        />
      </div>
      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">Bot account</label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void startOAuth()}
          className="px-4 py-2 rounded bg-purple-600/20 border border-purple-500/40 text-purple-200 hover:bg-purple-600/30 disabled:opacity-50 text-sm"
        >
          {busy ? 'Waiting for browser…' : username ? `Reauthorize (${username})` : 'Sign in with Twitch'}
        </button>
        {username && (
          <p className="text-xs text-gray-500 mt-2">Authorized as @{username}.</p>
        )}
      </div>
    </div>
  );
}

registerPlatformProvider({
  id: 'twitch',
  displayName: 'Twitch',
  accentClass: 'border-l-purple-500',
  supportsMultipleAccounts: true,
  AuthStep: TwitchAuthStep,
  validate(channel, providerData) {
    if (!channel) return 'Channel is required';
    if (!providerData.username) return 'Sign in with Twitch first';
    if (!providerData.oauthToken) return 'Sign in with Twitch first';
    return null;
  },
  defaultLabel(channel) { return channel; },
  async login(account) {
    const result = await window.copilot.twitchStartOAuth();
    await window.copilot.accountsUpdate({
      id: account.id,
      providerId: account.providerId,
      label: account.label,
      channel: account.channel,
      enabled: account.enabled,
      autoConnect: account.autoConnect,
      providerData: {
        ...account.providerData,
        username: result.username,
        oauthToken: `oauth:${result.accessToken}`,
      },
    });
    return { message: `Logado com sucesso como @${result.username}` };
  },
});
