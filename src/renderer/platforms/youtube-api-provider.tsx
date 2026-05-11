import { useState } from 'react';

import { registerPlatformProvider, type AuthStepProps } from './registry.js';
import { YOUTUBE_ICON, youtubeProfileUrl } from './youtube-shared.js';

/**
 * YouTube (API) provider — sibling to the scraped YouTube provider.
 *
 * The user supplies their own Google Cloud OAuth client (clientId +
 * clientSecret), per account. The wizard runs the loopback OAuth flow in the
 * main process and stores the encrypted refresh token alongside on the
 * account's providerData. After consent we have the channel id and title, so
 * the wizard skips the manual "channel handle" step entirely.
 */
function YouTubeApiAuthStep({ draft, updateDraft, channel, setChannel, setLabel, setError }: AuthStepProps) {
  const [clientId, setClientId] = useState((draft.clientId as string) ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const channelTitle = (draft.channelTitle as string) ?? '';

  const connected = !!channel && !!draft.refreshTokenEncrypted;

  async function connect() {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Both clientId and clientSecret are required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await window.copilot.youtubeApiStartOAuth({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      // Replace the draft with the encrypted shape — overwrite, don't merge,
      // so a previous failed attempt's leftover keys can't sneak in.
      updateDraft({
        clientId: result.providerData.clientId,
        clientSecretEncrypted: result.providerData.clientSecretEncrypted,
        refreshTokenEncrypted: result.providerData.refreshTokenEncrypted,
        channelTitle: result.providerData.channelTitle,
      });
      setChannel(result.channelId);
      if (result.channelTitle) setLabel?.(result.channelTitle);
      // Clear the secret field so it doesn't linger in memory.
      setClientSecret('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-gray-700 bg-gray-900/50 p-3">
        <p className="text-xs text-gray-300 font-medium mb-1">Setup checklist</p>
        <ol className="text-xs text-gray-400 list-decimal pl-4 space-y-0.5">
          <li>Create a project at <code className="text-gray-300">console.cloud.google.com</code>.</li>
          <li>Enable <strong className="text-gray-300">YouTube Data API v3</strong>.</li>
          <li>Create an OAuth 2.0 Client of type <strong className="text-gray-300">Desktop app</strong>.</li>
          <li>Add <code className="text-gray-300">http://127.0.0.1:33020</code> as an authorized redirect URI.</li>
        </ol>
      </div>

      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">Client ID</label>
        <input
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          disabled={busy || connected}
          placeholder="123…apps.googleusercontent.com"
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">Client secret</label>
        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          disabled={busy || connected}
          placeholder={connected ? '•••••••• (saved encrypted)' : ''}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 disabled:opacity-50"
        />
      </div>

      {connected ? (
        <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Connected as <strong>{channelTitle || channel}</strong>. Click Next to confirm.
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void connect()}
          className="w-full px-4 py-2 rounded bg-red-600/30 border border-red-500/40 text-red-100 hover:bg-red-600/40 disabled:opacity-50 text-sm"
        >
          {busy ? 'Opening Google…' : 'Connect with Google'}
        </button>
      )}
    </div>
  );
}

registerPlatformProvider({
  id: 'youtube-api',
  displayName: 'YouTube (API)',
  accentClass: 'border-l-red-500',
  supportsMultipleAccounts: true,
  icon: YOUTUBE_ICON,
  badge: {
    bg: 'bg-red-500/20',
    text: 'text-red-300',
    rowBorder: 'border-red-500/20',
  },
  accentBg: 'bg-red-500',
  bannerBorderColor: 'rgba(239,68,68,0.2)',
  card: {
    classes: 'bg-red-500/10 border-red-500/20 text-red-300',
    metaClass: 'text-red-400',
  },
  liveLink: {
    color: 'text-red-400',
    border: 'border-red-500/30',
    btnBg: 'bg-red-600/30 hover:bg-red-600/50 text-red-300',
  },
  subscriberBadge: 'member',
  authorAtPrefix: true,
  profileUrl: youtubeProfileUrl,
  AuthStep: YouTubeApiAuthStep,
  validate(channel, providerData) {
    if (!channel) return 'Connect to Google first';
    if (!providerData.refreshTokenEncrypted) return 'Connect to Google first';
    return null;
  },
  defaultLabel(channel) { return channel; },
});
