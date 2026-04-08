import { useEffect, useState } from 'react';

import type { ObsConnectionSettings, ObsStatsSnapshot } from '../../shared/types.js';
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
    <section style={styles.previewCard}>
      <div style={styles.previewHeader}>
        <div>
          <h2 style={styles.subtitle}>OBS WebSocket</h2>
          <p style={styles.helper}>Encrypted OBS connection settings stored in app settings with a live test flow.</p>
        </div>
        <span style={styles.selectionPill}>{obsStats.connected ? 'Connected' : 'Offline'}</span>
      </div>

      <div style={styles.settingsGrid}>
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
          Password
          <input
            type="password"
            value={settings.password}
            onChange={(event) => setSettings((current) => ({ ...current, password: event.target.value }))}
            style={styles.searchInput}
          />
        </label>

        <div style={styles.platformCard}>
          <span style={styles.statLabel}>Current scene</span>
          <span style={styles.statValue}>{obsStats.sceneName}</span>
          <span style={styles.statLabel}>Uptime</span>
          <span style={styles.statValue}>{obsStats.uptimeLabel}</span>
        </div>

        <div style={styles.buttonRow}>
          <button type="button" style={styles.secondaryButton} disabled={isBusy} onClick={() => void testConnection()}>
            Test connection
          </button>
          <button type="button" style={styles.primaryButton} disabled={isBusy} onClick={() => void saveSettings()}>
            Save settings
          </button>
        </div>

        {statusMessage ? <p style={styles.message}>{statusMessage}</p> : null}
        {error ? <p style={styles.error}>{error}</p> : null}
      </div>
    </section>
  );
}
