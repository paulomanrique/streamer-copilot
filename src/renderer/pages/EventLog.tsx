import { useEffect, useState } from 'react';

import type { EventLogEntry, EventLogFilters } from '../../shared/types.js';

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
    const interval = setInterval(() => void load(filters), 3000);
    return () => clearInterval(interval);
  }, [filters]);

  const updateFilters = (nextFilters: EventLogFilters) => {
    setFilters(nextFilters);
    void load(nextFilters);
  };

  return (
    <div className="p-6 max-w-[1160px]">
      <h2 className="text-lg font-semibold mb-1">Activity Log</h2>
      <p className="text-sm text-gray-400 mb-6">Recent operational events from the desktop app.</p>

      <div className="grid gap-4">
        <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
          <div className="flex flex-wrap gap-2">
            <select
              value={filters.level ?? 'all'}
              onChange={(event) => updateFilters({ ...filters, level: event.target.value as EventLogFilters['level'] })}
              className="min-w-[140px] bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
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
              className="flex-1 bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
              placeholder="Category"
            />
            <input
              type="text"
              value={filters.query ?? ''}
              onChange={(event) => updateFilters({ ...filters, query: event.target.value })}
              className="flex-[1.4] bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
              placeholder="Search message"
            />
          </div>
        </div>

        <div className="bg-gray-800/40 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/60">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Time</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Level</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Category</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Message</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-gray-300 text-xs align-top font-mono whitespace-nowrap">{row.createdAt.replace('T', ' ').replace('Z', '')}</td>
                  <td className="px-4 py-3 text-gray-300 text-xs align-top">{row.level}</td>
                  <td className="px-4 py-3 text-gray-300 text-xs align-top">{row.category}</td>
                  <td className="px-4 py-3 text-gray-200 text-xs align-top">{row.message}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs align-top font-mono break-all">{row.metadataJson ?? '—'}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-gray-500" colSpan={5}>No log entries match the current filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}
