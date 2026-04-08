import { useState } from 'react';

import { SettingsInfoTile, SettingsPageShell, SettingsSurface } from '../components/SettingsScaffold.js';
import { styles } from '../components/app-styles.js';
import { SCHEDULED_MESSAGE_ROWS } from '../settings-mock-data.js';

export function ScheduledMessagesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <SettingsPageShell
      title="Scheduled Messages"
      description="Messages sent in chat at configured intervals."
      action={<button type="button" style={styles.primaryButton} onClick={() => setIsModalOpen((value) => !value)}>+ New Message</button>}
      maxWidth="1160px"
    >
      <div style={styles.settingsColumn}>
        <div style={styles.settingsInfoGrid}>
          <SettingsInfoTile label="Interval" text="Send on a fixed cadence in minutes." />
          <SettingsInfoTile label="Random window" text="Add jitter so repeated promos feel less robotic." />
          <SettingsInfoTile label="Platforms" text="Choose which connected live outputs receive the message." />
        </div>

        <div style={styles.settingsSurfaceTable}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeadCell}>Message</th>
                <th style={styles.tableHeadCell}>Interval</th>
                <th style={styles.tableHeadCell}>Random window</th>
                <th style={styles.tableHeadCell}>Platforms</th>
                <th style={styles.tableHeadCell}>Last sent</th>
                <th style={styles.tableHeadCell}>Active</th>
              </tr>
            </thead>
            <tbody>
              {SCHEDULED_MESSAGE_ROWS.map((row) => (
                <tr key={row.id}>
                  <td style={styles.tableCell}>{row.message}</td>
                  <td style={styles.tableCell}>{row.intervalMinutes} min</td>
                  <td style={styles.tableCell}>{row.randomWindowMinutes} min</td>
                  <td style={styles.tableCell}>{row.platforms.join(', ')}</td>
                  <td style={styles.tableCell}>{row.lastSentLabel}</td>
                  <td style={styles.tableCell}>{row.enabled ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isModalOpen ? (
          <SettingsSurface>
            <h3 style={styles.settingsSubsectionTitle}>New Scheduled Message</h3>
            <label style={styles.label}>
              Message
              <textarea defaultValue="Remember to follow the channel." style={styles.textArea} />
            </label>
            <div style={styles.settingsTwoColumnGrid}>
              <label style={styles.label}>
                Interval (minutes)
                <input type="number" defaultValue="15" style={styles.searchInput} />
              </label>
              <label style={styles.label}>
                Random window (minutes)
                <input type="number" defaultValue="5" style={styles.searchInput} />
              </label>
            </div>
            <label style={styles.label}>
              Platforms
              <input type="text" defaultValue="twitch, youtube, kick" style={styles.searchInput} />
            </label>
            <div style={styles.settingsFooterRow}>
              <button type="button" style={styles.secondaryButton} onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button type="button" style={styles.primaryButton}>Save message</button>
            </div>
          </SettingsSurface>
        ) : null}
      </div>
    </SettingsPageShell>
  );
}
