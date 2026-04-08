import { useEffect, useState } from 'react';

import type { GeneralSettings } from '../../shared/types.js';
import { styles } from '../components/app-styles.js';
import { SettingsPageShell, SettingsSurface, SettingsToggleRow } from '../components/SettingsScaffold.js';

interface GeneralSettingsPageProps {
  settings: GeneralSettings;
  onSave: (settings: GeneralSettings) => Promise<void>;
}

export function GeneralSettingsPage({ settings, onSave }: GeneralSettingsPageProps) {
  const [draft, setDraft] = useState<GeneralSettings>(settings);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const updateDraft = (patch: Partial<GeneralSettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const saveSettings = async () => {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);

    try {
      await onSave(draft);
      setStatusMessage('General settings saved');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save general settings');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <SettingsPageShell title="General Settings" description="Application behavior.">
      <div style={styles.settingsColumn}>
        <SettingsSurface>
          <SettingsToggleRow
            title="Start on login"
            description="Open automatically when the computer starts."
            checked={draft.startOnLogin}
            onChange={(checked) => updateDraft({ startOnLogin: checked })}
            bordered={false}
          />
          <SettingsToggleRow
            title="Minimize to tray"
            description="Keep the app running in the background when the window closes."
            checked={draft.minimizeToTray}
            onChange={(checked) => updateDraft({ minimizeToTray: checked })}
          />
          <SettingsToggleRow
            title="Event notifications"
            description="System notifications for raids, subscriptions, and other stream events."
            checked={draft.eventNotifications}
            onChange={(checked) => updateDraft({ eventNotifications: checked })}
          />
        </SettingsSurface>

        <SettingsSurface>
          <h3 style={styles.settingsSubsectionTitle}>Diagnostic Log</h3>
          <div style={styles.buttonRow}>
            <select defaultValue="info" style={{ ...styles.select, flex: 1 }}>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
              <option value="warn">Warn</option>
            </select>
            <button type="button" style={styles.secondaryButton}>Open Logs Folder</button>
          </div>
        </SettingsSurface>

        <div style={styles.settingsFooterRow}>
          <button type="button" style={styles.primaryButton} disabled={isBusy} onClick={() => void saveSettings()}>
            Save settings
          </button>
          {statusMessage ? <p style={styles.message}>{statusMessage}</p> : null}
          {error ? <p style={styles.error}>{error}</p> : null}
        </div>

        <p style={styles.settingsVersionText}>Streamer Copilot v0.1.0 · Electron 35</p>
      </div>
    </SettingsPageShell>
  );
}
