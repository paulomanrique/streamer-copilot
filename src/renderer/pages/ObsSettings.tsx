import { useEffect, useState } from 'react';

import type { ObsConnectionSettings, ObsStatsSnapshot } from '../../shared/types.js';
import { SettingsPageShell, SettingsSurface } from '../components/SettingsScaffold.js';
import { styles } from '../components/app-styles.js';

const DEFAULT_SETTINGS: ObsConnectionSettings = {
  host: '127.0.0.1',
  port: 4455,
  password: '',
};

interface ObsSettingsPageProps {
  obsStats: ObsStatsSnapshot;
}

export function ObsSettingsPage({ obsStats }: ObsSettingsPageProps) {
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
        setError(cause instanceof Error ? cause.message : 'Failed to load OBS settings');
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
      setStatusMessage('OBS settings saved');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save OBS settings');
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
      setStatusMessage('Connection test succeeded');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'OBS connection test failed');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <SettingsPageShell
      title="OBS Studio"
      description="Connect to OBS via WebSocket to display live stream statistics in real time."
      maxWidth="720px"
    >
      <div style={styles.settingsColumn}>
        <SettingsSurface>
          <label style={styles.label}>
            Host
            <input
              type="text"
              value={settings.host}
              onChange={(event) => setSettings((current) => ({ ...current, host: event.target.value }))}
              style={styles.searchInput}
            />
          </label>

          <label style={styles.label}>
            Port
            <input
              type="number"
              min="1"
              max="65535"
              value={settings.port}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  port: Number(event.target.value) || DEFAULT_SETTINGS.port,
                }))
              }
              style={styles.searchInput}
            />
          </label>

          <label style={styles.label}>
            Password (optional)
            <input
              type="password"
              value={settings.password}
              onChange={(event) => setSettings((current) => ({ ...current, password: event.target.value }))}
              style={styles.searchInput}
            />
          </label>

          <div style={styles.settingsFooterRow}>
            <button type="button" style={styles.secondaryButton} disabled={isBusy} onClick={() => void testConnection()}>
              Test connection
            </button>
            <button type="button" style={styles.primaryButton} disabled={isBusy} onClick={() => void saveSettings()}>
              Save
            </button>
            <span style={styles.selectionPill}>{obsStats.connected ? 'Connected' : 'Offline'}</span>
          </div>

          {statusMessage ? <p style={styles.message}>{statusMessage}</p> : null}
          {error ? <p style={styles.error}>{error}</p> : null}
        </SettingsSurface>

        <SettingsSurface>
          <h3 style={styles.settingsSubsectionTitle}>How to enable in OBS</h3>
          <ol style={styles.settingsOrderedList}>
            <li>Open OBS Studio 28+.</li>
            <li>Go to Tools → WebSocket Server Settings.</li>
            <li>Enable “Enable WebSocket server”.</li>
            <li>Copy the generated password and paste it above.</li>
          </ol>
          <p style={styles.settingsSecondaryText}>Current scene: {obsStats.sceneName} · Uptime: {obsStats.uptimeLabel}</p>
        </SettingsSurface>
      </div>
    </SettingsPageShell>
  );
}
