import { useState } from 'react';

import type { PermissionLevel } from '../../shared/types.js';
import { LanguagePicker } from '../components/LanguagePicker.js';
import { PermissionPicker } from '../components/PermissionPicker.js';
import { styles } from '../components/app-styles.js';
import { VOICE_COMMAND_ROWS } from '../settings-mock-data.js';

export function VoiceCommandsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [languageCode, setLanguageCode] = useState('en-US');
  const [levels, setLevels] = useState<PermissionLevel[]>(['everyone']);

  return (
    <section style={styles.previewCard}>
      <div style={styles.previewHeader}>
        <div>
          <h2 style={styles.subtitle}>Voice Commands</h2>
          <p style={styles.helper}>Voice command table, editor shell, and TTS settings powered by reusable pickers.</p>
        </div>
        <button type="button" style={styles.primaryButton} onClick={() => setIsModalOpen((value) => !value)}>
          {isModalOpen ? 'Close editor' : 'Add command'}
        </button>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.tableHeadCell}>Trigger</th>
              <th style={styles.tableHeadCell}>Template</th>
              <th style={styles.tableHeadCell}>Language</th>
              <th style={styles.tableHeadCell}>Permissions</th>
              <th style={styles.tableHeadCell}>Cooldown</th>
              <th style={styles.tableHeadCell}>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {VOICE_COMMAND_ROWS.map((row) => (
              <tr key={row.id}>
                <td style={styles.tableCell}>
                  <span style={styles.codeText}>{row.trigger}</span>
                </td>
                <td style={styles.tableCell}>{row.template ?? 'Dynamic text after trigger'}</td>
                <td style={styles.tableCell}>{row.languageCode}</td>
                <td style={styles.tableCell}>{row.allowedLevels.join(', ')}</td>
                <td style={styles.tableCell}>{row.cooldownSeconds}s</td>
                <td style={styles.tableCell}>{row.enabled ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section style={styles.settingsGrid}>
        <section style={styles.previewCard}>
          <h3 style={styles.sectionTitle}>TTS Settings</h3>
          <p style={styles.helper}>Language, volume, rate, max chars, and announce-username toggle shell.</p>
          <div style={styles.settingsGrid}>
            <LanguagePicker selectedCode={languageCode} onChange={setLanguageCode} />
            <div style={styles.platformCard}>
              <span style={styles.statLabel}>Volume</span>
              <input type="range" min="0" max="100" defaultValue="80" />
              <span style={styles.statLabel}>Rate</span>
              <input type="range" min="50" max="200" defaultValue="100" />
              <span style={styles.statLabel}>Max chars</span>
              <input type="number" defaultValue="180" style={styles.searchInput} />
            </div>
          </div>
        </section>

        {isModalOpen ? (
          <section style={styles.modalShell}>
            <input type="text" defaultValue="!say" style={styles.searchInput} />
            <input type="text" defaultValue="Optional fixed text" style={styles.searchInput} />
            <LanguagePicker selectedCode={languageCode} onChange={setLanguageCode} />
            <PermissionPicker selectedLevels={levels} onChange={setLevels} />
          </section>
        ) : null}
      </section>
    </section>
  );
}
