import { useEffect, useState } from 'react';

import type { ObsConnectionSettings, ObsStatsSnapshot } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';

const DEFAULT_SETTINGS: ObsConnectionSettings = {
  host: '127.0.0.1',
  port: 4455,
  password: '',
};

interface ObsSettingsPageProps {
  obsStats: ObsStatsSnapshot;
}

export function ObsSettingsPage({ obsStats }: ObsSettingsPageProps) {
  const { messages, t } = useI18n();
  const [settings, setSettings] = useState<ObsConnectionSettings>(DEFAULT_SETTINGS);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  useEffect(() => {
    const load = async () => {
      try {
        const nextSettings = await window.copilot.getObsSettings();
        setSettings(nextSettings);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('Failed to load OBS settings'));
      }
    };

    void load();
  }, []);

  const saveSettings = async () => {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);

    try {
      const saved = await window.copilot.saveObsSettings(settings);
      setSettings(saved);
      setStatusMessage(t('OBS settings saved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Failed to save OBS settings'));
    } finally {
      setIsBusy(false);
    }
  };

  const testConnection = async () => {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);

    try {
      await window.copilot.testObsConnection(settings);
      setStatusMessage(t('Connection test succeeded'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('OBS connection test failed'));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold mb-1">OBS Studio</h2>
      <p className="text-sm text-gray-400 mb-6">{t('Connect to OBS via WebSocket to display live stream statistics in real time.')}</p>

      <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5 space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">{t('Host')}</label>
          <input
            type="text"
            value={settings.host}
            onChange={(event) => setSettings((current) => ({ ...current, host: event.target.value }))}
            className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">{t('Port')}</label>
          <input
            type="number"
            min="1"
            max="65535"
            value={settings.port}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                port: Number(event.target.value) || DEFAULT_SETTINGS.port,
              }))}
            className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">{t('Password (optional)')}</label>
          <input
            type="password"
            value={settings.password}
            onChange={(event) => setSettings((current) => ({ ...current, password: event.target.value }))}
            placeholder="••••••••"
            className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void testConnection()}
            className="flex-1 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors disabled:opacity-60"
          >
            {t('Test Connection')}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void saveSettings()}
            className="flex-1 px-3 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {messages.common.save}
          </button>
        </div>
        {statusMessage ? <p className="text-sm text-gray-400">{statusMessage}</p> : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>

      <div className="mt-4 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-sm">
        <p className="text-cyan-400 font-medium mb-1">{t('How to enable in OBS:')}</p>
        <ol className="text-gray-400 space-y-1 text-xs list-decimal list-inside">
          <li>{t('Open OBS Studio 28+')}</li>
          <li>{t('Go to')} <strong className="text-gray-300">Tools → WebSocket Server Settings</strong></li>
          <li>{t('Enable')} <strong className="text-gray-300">"Enable WebSocket server"</strong></li>
          <li>{t('Copy the generated password and paste it above')}</li>
        </ol>
        <p className="text-xs text-cyan-200/80 mt-3">
          {t('Current scene')}: <span className="text-cyan-100">{obsStats.sceneName}</span> · {t('Uptime')}:{' '}
          <span className="text-cyan-100">{obsStats.uptimeLabel}</span>
        </p>
      </div>
    </div>
  );
}
