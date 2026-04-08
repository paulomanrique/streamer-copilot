import { useState } from 'react';

import type { PermissionLevel } from '../../shared/types.js';
import { SOUND_COMMAND_ROWS } from '../settings-mock-data.js';
import { PermissionPicker } from '../components/PermissionPicker.js';
import { styles } from '../components/app-styles.js';

export function SoundCommandsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [levels, setLevels] = useState<PermissionLevel[]>(['everyone']);

  return (
    <section style={styles.previewCard}>
      <div style={styles.previewHeader}>
        <div>
          <h2 style={styles.subtitle}>Sound Commands</h2>
          <p style={styles.helper}>Trigger, file, permissions, cooldown, enabled state, and shell actions.</p>
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
              <th style={styles.tableHeadCell}>File</th>
              <th style={styles.tableHeadCell}>Permissions</th>
              <th style={styles.tableHeadCell}>Cooldown</th>
              <th style={styles.tableHeadCell}>Enabled</th>
              <th style={styles.tableHeadCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {SOUND_COMMAND_ROWS.map((row) => (
              <tr key={row.id}>
                <td style={styles.tableCell}>
                  <span style={styles.codeText}>{row.trigger}</span>
                </td>
                <td style={styles.tableCell}>{row.fileName}</td>
                <td style={styles.tableCell}>{row.allowedLevels.join(', ')}</td>
                <td style={styles.tableCell}>{row.cooldownSeconds}s</td>
                <td style={styles.tableCell}>{row.enabled ? 'Yes' : 'No'}</td>
                <td style={styles.tableCell}>
                  <div style={styles.buttonRow}>
                    <button type="button" style={styles.secondaryButton}>
                      Test
                    </button>
                    <button type="button" style={styles.secondaryButton}>
                      Edit
                    </button>
                    <button type="button" style={styles.dangerButton}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen ? (
        <section style={styles.modalShell}>
          <input type="text" defaultValue="!drumroll" style={styles.searchInput} />
          <input type="text" defaultValue="drumroll.wav" style={styles.searchInput} />
          <PermissionPicker selectedLevels={levels} onChange={setLevels} />
        </section>
      ) : null}
    </section>
  );
}
