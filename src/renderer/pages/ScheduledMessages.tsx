import { useEffect, useState } from 'react';

import type {
  PlatformId,
  ScheduledAvailableTargets,
  ScheduledMessage,
  ScheduledStatusItem,
} from '../../shared/types.js';

const PLATFORMS: { id: 'twitch' | 'youtube'; label: string; textClass: string; bgClass: string }[] = [
  { id: 'twitch', label: 'Twitch', textClass: 'text-purple-300', bgClass: 'bg-purple-500/20' },
  { id: 'youtube', label: 'YouTube (H/V)', textClass: 'text-red-300', bgClass: 'bg-red-500/20' },
];

const EMPTY_FORM = {
  message: '',
  intervalMinutes: 15,
  randomWindowMinutes: 0,
  platforms: ['twitch', 'youtube'] as PlatformId[],
  enabled: true,
};

function formatTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatResult(status: ScheduledStatusItem | undefined): string {
  if (!status || !status.lastResult) return '—';
  const base = status.lastResult.toUpperCase();
  return status.lastResultDetail ? `${base} · ${status.lastResultDetail}` : base;
}

export function ScheduledMessagesPage() {
  const [rows, setRows] = useState<ScheduledMessage[]>([]);
  const [statusById, setStatusById] = useState<Record<string, ScheduledStatusItem>>({});
  const [availableTargets, setAvailableTargets] = useState<ScheduledAvailableTargets>({
    supported: ['twitch', 'youtube'],
    connected: [],
  });
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState(EMPTY_FORM.message);
  const [intervalMinutes, setIntervalMinutes] = useState(EMPTY_FORM.intervalMinutes);
  const [randomWindowMinutes, setRandomWindowMinutes] = useState(EMPTY_FORM.randomWindowMinutes);
  const [platforms, setPlatforms] = useState<PlatformId[]>(EMPTY_FORM.platforms);
  const [enabled, setEnabled] = useState(EMPTY_FORM.enabled);
  const [isBusy, setIsBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    void load();

    const disconnect = window.copilot.onScheduledStatus((items) => {
      const next: Record<string, ScheduledStatusItem> = {};
      for (const item of items) next[item.id] = item;
      setStatusById(next);
    });

    return () => {
      disconnect();
    };
  }, []);

  const refreshTargets = async () => {
    const next = await window.copilot.getScheduledAvailableTargets();
    setAvailableTargets(next);
    return next;
  };

  const load = async () => {
    try {
      const [items, targets] = await Promise.all([
        window.copilot.listScheduledMessages(),
        window.copilot.getScheduledAvailableTargets(),
      ]);
      setRows(items);
      setAvailableTargets(targets);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load scheduled messages');
    }
  };

  const openCreate = async () => {
    const targets = await refreshTargets();
    const defaultPlatforms = targets.connected.length > 0 ? targets.connected : targets.supported;

    setEditId(undefined);
    setMessage(EMPTY_FORM.message);
    setIntervalMinutes(EMPTY_FORM.intervalMinutes);
    setRandomWindowMinutes(EMPTY_FORM.randomWindowMinutes);
    setPlatforms(defaultPlatforms);
    setEnabled(EMPTY_FORM.enabled);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEdit = async (row: ScheduledMessage) => {
    await refreshTargets();
    setEditId(row.id);
    setMessage(row.message);
    setIntervalMinutes(Math.round(row.intervalSeconds / 60));
    setRandomWindowMinutes(Math.round(row.randomWindowSeconds / 60));
    setPlatforms(row.targetPlatforms.filter((id) => id === 'twitch' || id === 'youtube'));
    setEnabled(row.enabled);
    setModalError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalError(null);
  };

  const togglePlatform = (id: PlatformId) => {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const save = async () => {
    if (!message.trim()) {
      setModalError('Message is required');
      return;
    }
    if (intervalMinutes < 1) {
      setModalError('Interval must be at least 1 minute');
      return;
    }
    if (platforms.length === 0) {
      setModalError('Select at least one platform');
      return;
    }

    const disconnectedSelection = platforms.filter((id) => !availableTargets.connected.includes(id));
    if (disconnectedSelection.length > 0) {
      setModalError(`Only connected targets can be selected: ${disconnectedSelection.join(', ')}`);
      return;
    }

    setIsBusy(true);
    setModalError(null);
    try {
      const items = await window.copilot.upsertScheduledMessage({
        id: editId,
        message: message.trim(),
        intervalSeconds: intervalMinutes * 60,
        randomWindowSeconds: randomWindowMinutes * 60,
        targetPlatforms: platforms,
        enabled,
      });
      setRows(items);
      closeModal();
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : 'Failed to save');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteRow = async (id: string) => {
    try {
      const items = await window.copilot.deleteScheduledMessage({ id });
      setRows(items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete');
    }
  };

  const toggleEnabled = async (row: ScheduledMessage) => {
    try {
      const items = await window.copilot.upsertScheduledMessage({
        id: row.id,
        message: row.message,
        intervalSeconds: row.intervalSeconds,
        randomWindowSeconds: row.randomWindowSeconds,
        targetPlatforms: row.targetPlatforms,
        enabled: !row.enabled,
      });
      setRows(items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to update');
    }
  };

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Scheduled Messages</h2>
          <button
            type="button"
            onClick={() => {
              void openCreate();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
          >
            + New Message
          </button>
        </div>

        {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

        <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/60">
                {['Message', 'Interval', 'Random', 'Targets', 'Next Fire', 'Last Run', 'Result', 'Active', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = statusById[row.id];
                return (
                  <tr key={row.id} className="border-b border-gray-800 hover:bg-gray-800/50 align-top">
                    <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{row.message}</td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{Math.round(row.intervalSeconds / 60)} min</td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{row.randomWindowSeconds > 0 ? `+${Math.round(row.randomWindowSeconds / 60)} min` : 'Exact'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {row.targetPlatforms.map((pid) => {
                          const meta = PLATFORMS.find((p) => p.id === pid);
                          return (
                            <span key={pid} className={`text-xs px-2 py-0.5 rounded-full ${meta?.bgClass ?? 'bg-gray-700'} ${meta?.textClass ?? 'text-gray-300'}`}>
                              {meta?.label ?? pid}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatTime(status?.nextFireAt ?? null)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatTime(status?.lastRunAt ?? row.lastSentAt)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-sm">{formatResult(status)}</td>
                    <td className="px-4 py-3">
                      <label className="toggle-switch">
                        <input type="checkbox" checked={row.enabled} onChange={() => void toggleEnabled(row)} />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void openEdit(row);
                          }}
                          className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteRow(row.id)}
                          className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white transition-colors"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-gray-500 text-center" colSpan={9}>No scheduled messages yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <h3 className="font-semibold">{editId ? 'Edit Message' : 'New Scheduled Message'}</h3>
              <button type="button" onClick={closeModal} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  Message <span className="text-violet-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Remember to follow the channel!"
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">
                    Interval (min) <span className="text-violet-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Random Window (min)</label>
                  <p className="text-xs text-gray-600 mb-1">0 = exact interval</p>
                  <input
                    type="number"
                    min="0"
                    value={randomWindowMinutes}
                    onChange={(e) => setRandomWindowMinutes(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Targets</label>
                <div className="space-y-2">
                  {PLATFORMS.map(({ id, label, textClass }) => {
                    const isConnected = availableTargets.connected.includes(id);
                    const isSelected = platforms.includes(id);
                    const canToggle = isConnected || isSelected;

                    return (
                      <label key={id} className={`flex items-center justify-between gap-3 text-sm ${canToggle ? 'cursor-pointer text-gray-300' : 'text-gray-600'}`}>
                        <span className={textClass}>{label}</span>
                        <span className="flex items-center gap-2">
                          {!isConnected ? <span className="text-[11px] text-yellow-500">Disconnected</span> : null}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!canToggle}
                            onChange={() => togglePlatform(id)}
                            className="accent-violet-500"
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-600 mt-1.5">YouTube sends to active streams (horizontal and vertical) when available.</p>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-violet-500" />
                Active
              </label>

              {modalError ? <p className="text-sm text-red-400">{modalError}</p> : null}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-gray-700">
              <button type="button" onClick={closeModal} className="flex-1 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
                Cancel
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  void save();
                }}
                className="flex-1 px-3 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
