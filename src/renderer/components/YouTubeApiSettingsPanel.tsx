import { useCallback, useEffect, useState } from 'react';

import type {
  YouTubeApiCredentialsStatus,
  YouTubeChannelConfig,
  YouTubeDriver,
  YouTubeSettings,
} from '../../shared/types.js';

/**
 * Settings panel for the YouTube **API driver**. Two responsibilities:
 *
 *   1. Manage the global Google Cloud OAuth client credentials (clientId +
 *      clientSecret). The secret is encrypted via electron.safeStorage in the
 *      main process — this panel never holds the plaintext after submit.
 *   2. Per-channel driver selection (scrape vs. api) and OAuth flow.
 *
 * The scrape driver remains the default (no setup required). The API driver
 * unlocks real moderation (delete / ban / timeout) but requires a one-time
 * Google Cloud project setup from the user.
 */
export function YouTubeApiSettingsPanel() {
  const [credsStatus, setCredsStatus] = useState<YouTubeApiCredentialsStatus | null>(null);
  const [settings, setSettings] = useState<YouTubeSettings | null>(null);
  const [editingCreds, setEditingCreds] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [status, ytSettings] = await Promise.all([
        window.copilot.youtubeApiGetCredentialsStatus(),
        window.copilot.youtubeGetSettings(),
      ]);
      setCredsStatus(status);
      setSettings(ytSettings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const saveCredentials = async () => {
    if (!clientIdInput.trim() || !clientSecretInput.trim()) {
      setError('Both clientId and clientSecret are required');
      return;
    }
    setBusy('save-creds'); setError(null);
    try {
      const status = await window.copilot.youtubeApiSetCredentials({
        clientId: clientIdInput.trim(),
        clientSecret: clientSecretInput.trim(),
      });
      setCredsStatus(status);
      setEditingCreds(false);
      setClientIdInput('');
      setClientSecretInput('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const clearCredentials = async () => {
    setBusy('clear-creds'); setError(null);
    try {
      const status = await window.copilot.youtubeApiClearCredentials();
      setCredsStatus(status);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const setChannelDriver = async (channelId: string, driver: YouTubeDriver) => {
    if (!settings) return;
    setBusy(`driver-${channelId}`); setError(null);
    try {
      const updated: YouTubeSettings = {
        ...settings,
        channels: settings.channels.map((c) => c.id === channelId ? { ...c, driver } : c),
      };
      const saved = await window.copilot.youtubeSaveSettings(updated);
      setSettings(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const connectChannelToApi = async (channelId: string) => {
    setBusy(`oauth-${channelId}`); setError(null);
    try {
      await window.copilot.youtubeApiStartOAuth({ channelConfigId: channelId });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const disconnectChannelFromApi = async (channelId: string) => {
    setBusy(`disconnect-${channelId}`); setError(null);
    try {
      await window.copilot.youtubeApiDisconnectChannel({ channelConfigId: channelId });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const credsConfigured = credsStatus?.hasClientId && credsStatus?.hasClientSecret;
  const channels = settings?.channels ?? [];

  return (
    <section className="rounded-md border border-gray-700 bg-gray-900/40 p-4 mt-6">
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-gray-100">YouTube API driver</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Optional. Lets the app read and moderate (delete / ban / timeout) chat through the official YouTube Data API,
          using your own Google Cloud project. Scraping continues to work without this.
        </p>
      </header>

      {error ? (
        <div className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div>
      ) : null}

      {/* Credentials block */}
      <div className="rounded border border-gray-700 bg-gray-900/60 p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-200">OAuth client credentials</p>
          {credsConfigured ? (
            <span className="text-[10px] uppercase tracking-wide text-emerald-300">Configured</span>
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-gray-500">Not set</span>
          )}
        </div>
        {credsConfigured && !editingCreds ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-gray-400">
              Client ID: <code className="text-gray-200">{credsStatus?.clientId}</code>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setEditingCreds(true)}
                className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-200 hover:bg-gray-800 disabled:opacity-50">
                Replace
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void clearCredentials()}
                className="text-xs px-3 py-1 rounded border border-rose-500/40 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50">
                {busy === 'clear-creds' ? 'Clearing…' : 'Clear'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-500">
              Create an OAuth Client (Desktop) at <code className="text-gray-300">console.cloud.google.com</code>,
              enable <strong>YouTube Data API v3</strong>, and add <code className="text-gray-300">http://127.0.0.1:33020</code> as an authorized redirect URI.
            </p>
            <input
              type="text"
              placeholder="Client ID"
              value={clientIdInput}
              onChange={(e) => setClientIdInput(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-gray-100"
            />
            <input
              type="password"
              placeholder="Client secret"
              value={clientSecretInput}
              onChange={(e) => setClientSecretInput(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-gray-100"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void saveCredentials()}
                className="text-xs px-3 py-1.5 rounded bg-red-600/30 border border-red-500/40 text-red-100 hover:bg-red-600/40 disabled:opacity-50">
                {busy === 'save-creds' ? 'Saving…' : 'Save credentials'}
              </button>
              {editingCreds ? (
                <button
                  type="button"
                  onClick={() => { setEditingCreds(false); setClientIdInput(''); setClientSecretInput(''); }}
                  className="text-xs px-3 py-1.5 rounded border border-gray-600 text-gray-300 hover:bg-gray-800">
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Per-channel driver selection */}
      <div>
        <p className="text-xs font-medium text-gray-200 mb-2">Channels</p>
        {channels.length === 0 ? (
          <p className="text-xs text-gray-500">Add a YouTube account in Connections above to configure its driver.</p>
        ) : (
          <ul className="space-y-2">
            {channels.map((c) => (
              <ChannelRow
                key={c.id}
                channel={c}
                credsConfigured={!!credsConfigured}
                busy={busy}
                onSetDriver={(driver) => void setChannelDriver(c.id, driver)}
                onConnectApi={() => void connectChannelToApi(c.id)}
                onDisconnectApi={() => void disconnectChannelFromApi(c.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface ChannelRowProps {
  channel: YouTubeChannelConfig;
  credsConfigured: boolean;
  busy: string | null;
  onSetDriver: (driver: YouTubeDriver) => void;
  onConnectApi: () => void;
  onDisconnectApi: () => void;
}

function ChannelRow({ channel, credsConfigured, busy, onSetDriver, onConnectApi, onDisconnectApi }: ChannelRowProps) {
  const driver: YouTubeDriver = channel.driver ?? 'scrape';
  const apiBusy = busy === `oauth-${channel.id}` || busy === `disconnect-${channel.id}` || busy === `driver-${channel.id}`;
  return (
    <li className="rounded border border-gray-700 bg-gray-900/60 px-3 py-2 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-100 truncate">{channel.name || channel.handle}</div>
        <div className="text-[11px] text-gray-500 truncate">{channel.handle}</div>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={driver}
          onChange={(e) => onSetDriver(e.target.value as YouTubeDriver)}
          disabled={apiBusy}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 disabled:opacity-50"
        >
          <option value="scrape">Scrape</option>
          <option value="api" disabled={!credsConfigured}>API</option>
        </select>
        {driver === 'api' ? (
          channel.apiAuth?.hasRefreshToken ? (
            <button
              type="button"
              disabled={apiBusy}
              onClick={onDisconnectApi}
              className="text-xs px-3 py-1 rounded border border-rose-500/40 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50">
              {busy === `disconnect-${channel.id}` ? 'Disconnecting…' : 'Disconnect API'}
            </button>
          ) : (
            <button
              type="button"
              disabled={apiBusy || !credsConfigured}
              onClick={onConnectApi}
              className="text-xs px-3 py-1 rounded bg-red-600/30 border border-red-500/40 text-red-100 hover:bg-red-600/40 disabled:opacity-50">
              {busy === `oauth-${channel.id}` ? 'Opening Google…' : 'Connect with Google'}
            </button>
          )
        ) : null}
      </div>
    </li>
  );
}
