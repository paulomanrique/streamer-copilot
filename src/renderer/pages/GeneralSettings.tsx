import { useEffect, useState } from 'react';

import type { GeneralSettings } from '../../shared/types.js';
import { styles } from '../components/app-styles.js';

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
    <section style={styles.previewCard}>
      <div style={styles.previewHeader}>
        <div>
          <h2 style={styles.subtitle}>General Settings</h2>
          <p style={styles.helper}>Tray behavior, autostart, and app-level runtime toggles persisted in app settings.</p>
        </div>
      </div>

      <div style={styles.settingsGrid}>
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={draft.startOnLogin}
            onChange={(event) => updateDraft({ startOnLogin: event.target.checked })}
          />
          Start on login
        </label>

        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={draft.minimizeToTray}
            onChange={(event) => updateDraft({ minimizeToTray: event.target.checked })}
          />
          Minimize to tray when the window closes
        </label>

        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={draft.eventNotifications}
            onChange={(event) => updateDraft({ eventNotifications: event.target.checked })}
          />
          Event notifications
        </label>

        <div style={styles.buttonRow}>
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
