import { useState } from 'react';

import { styles } from '../components/app-styles.js';
import { SCHEDULED_MESSAGE_ROWS } from '../settings-mock-data.js';

export function ScheduledMessagesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <section style={styles.previewCard}>
      <div style={styles.previewHeader}>
        <div>
          <h2 style={styles.subtitle}>Scheduled Messages</h2>
          <p style={styles.helper}>Interval, random window, platforms, last-sent state, and modal editor shell.</p>
        </div>
        <button type="button" style={styles.primaryButton} onClick={() => setIsModalOpen((value) => !value)}>
          {isModalOpen ? 'Close editor' : 'Add message'}
        </button>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.tableHeadCell}>Message</th>
              <th style={styles.tableHeadCell}>Interval</th>
              <th style={styles.tableHeadCell}>Random window</th>
              <th style={styles.tableHeadCell}>Platforms</th>
              <th style={styles.tableHeadCell}>Last sent</th>
              <th style={styles.tableHeadCell}>Enabled</th>
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
        <section style={styles.modalShell}>
          <textarea defaultValue="Remember to follow the channel." style={styles.textArea} />
          <div style={styles.buttonRow}>
            <input type="number" defaultValue="15" style={styles.searchInput} />
            <input type="number" defaultValue="5" style={styles.searchInput} />
          </div>
          <input type="text" defaultValue="twitch, youtube, kick" style={styles.searchInput} />
        </section>
      ) : null}
    </section>
  );
}
