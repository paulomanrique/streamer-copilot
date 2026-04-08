import { useEffect, useState } from 'react';

import type { EventLogEntry, EventLogFilters } from '../../shared/types.js';
import { styles } from '../components/app-styles.js';

const DEFAULT_FILTERS: EventLogFilters = {
  level: 'all',
  category: '',
  query: '',
};

export function EventLogPage() {
  const [filters, setFilters] = useState<EventLogFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<EventLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextFilters: EventLogFilters) => {
    try {
      const entries = await window.copilot.listEventLogs(nextFilters);
      setRows(entries);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load activity log');
    }
  };

  useEffect(() => {
    void load(filters);
  }, []);

  const updateFilters = (nextFilters: EventLogFilters) => {
    setFilters(nextFilters);
    void load(nextFilters);
  };

  return (
    <section style={styles.previewCard}>
      <div style={styles.previewHeader}>
        <div>
          <h2 style={styles.subtitle}>Activity Log</h2>
          <p style={styles.helper}>Recent operational events from the desktop app, filterable by level, scope, and text.</p>
        </div>
      </div>

      <div style={styles.settingsGrid}>
        <div style={styles.buttonRow}>
          <select
            value={filters.level ?? 'all'}
            onChange={(event) => updateFilters({ ...filters, level: event.target.value as EventLogFilters['level'] })}
            style={styles.select}
          >
            <option value="all">All levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <input
            type="text"
            value={filters.category ?? ''}
            onChange={(event) => updateFilters({ ...filters, category: event.target.value })}
            style={styles.searchInput}
            placeholder="Category"
          />
          <input
            type="text"
            value={filters.query ?? ''}
            onChange={(event) => updateFilters({ ...filters, query: event.target.value })}
            style={styles.searchInput}
            placeholder="Search message"
          />
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeadCell}>Time</th>
                <th style={styles.tableHeadCell}>Level</th>
                <th style={styles.tableHeadCell}>Category</th>
                <th style={styles.tableHeadCell}>Message</th>
                <th style={styles.tableHeadCell}>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={styles.tableCell}>{row.createdAt.replace('T', ' ').replace('Z', '')}</td>
                  <td style={styles.tableCell}>{row.level}</td>
                  <td style={styles.tableCell}>{row.category}</td>
                  <td style={styles.tableCell}>{row.message}</td>
                  <td style={styles.tableCell}>{row.metadataJson ?? '—'}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td style={styles.tableCell} colSpan={5}>
                    No log entries match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {error ? <p style={styles.error}>{error}</p> : null}
      </div>
    </section>
  );
}
