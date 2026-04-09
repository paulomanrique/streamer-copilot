import { useEffect, useState } from 'react';

import type { PlatformId, ScheduledMessage } from '../../shared/types.js';

const PLATFORMS: { id: PlatformId; label: string; textClass: string; bgClass: string }[] = [
  { id: 'twitch',  label: 'Twitch',       textClass: 'text-purple-300', bgClass: 'bg-purple-500/20' },
  { id: 'youtube', label: 'YT Horizontal', textClass: 'text-red-300',    bgClass: 'bg-red-500/20'    },
  { id: 'kick',    label: 'Kick',          textClass: 'text-green-300',  bgClass: 'bg-green-500/20'  },
  { id: 'tiktok',  label: 'TikTok',        textClass: 'text-pink-300',   bgClass: 'bg-pink-500/20'   },
];

function formatLastSent(lastSentAt: string | null): string {
  if (!lastSentAt) return '—';
  const d = new Date(lastSentAt);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const EMPTY_FORM = {
  message: '',
  intervalMinutes: 15,
  randomWindowMinutes: 0,
  platforms: ['twitch', 'youtube', 'kick'] as PlatformId[],
  enabled: true,
};

export function ScheduledMessagesPage() {
  const [rows, setRows] = useState<ScheduledMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState(EMPTY_FORM.message);
  const [intervalMinutes, setIntervalMinutes] = useState(EMPTY_FORM.intervalMinutes);
  const [randomWindowMinutes, setRandomWindowMinutes] = useState(EMPTY_FORM.randomWindowMinutes);
  const [platforms, setPlatforms] = useState<PlatformId[]>(EMPTY_FORM.platforms);
  const [enabled, setEnabled] = useState(EMPTY_FORM.enabled);
  const [isBusy, setIsBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    try {
      const items = await window.copilot.listScheduledMessages();
      setRows(items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load scheduled messages');
    }
  };

  // ── Modal helpers ─────────────────────────────────────────────────────
  const openCreate = () => {
    setEditId(undefined);
    setMessage(EMPTY_FORM.message);
    setIntervalMinutes(EMPTY_FORM.intervalMinutes);
    setRandomWindowMinutes(EMPTY_FORM.randomWindowMinutes);
    setPlatforms(EMPTY_FORM.platforms);
    setEnabled(EMPTY_FORM.enabled);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEdit = (row: ScheduledMessage) => {
    setEditId(row.id);
    setMessage(row.message);
    setIntervalMinutes(Math.round(row.intervalSeconds / 60));
    setRandomWindowMinutes(Math.round(row.randomWindowSeconds / 60));
    setPlatforms(row.targetPlatforms);
    setEnabled(row.enabled);
    setModalError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalError(null);
  };

  const togglePlatform = (id: PlatformId) => {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  // ── Save ──────────────────────────────────────────────────────────────
  const save = async () => {
    if (!message.trim()) { setModalError('Message is required'); return; }
    if (intervalMinutes < 1) { setModalError('Interval must be at least 1 minute'); return; }
    if (platforms.length === 0) { setModalError('Select at least one platform'); return; }

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

  // ── Delete ────────────────────────────────────────────────────────────
  const deleteRow = async (id: string) => {
    try {
      const items = await window.copilot.deleteScheduledMessage({ id });
      setRows(items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete');
    }
  };

  // ── Toggle enabled ────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Scheduled Messages</h2>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
          >
            + New Message
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-4">Messages automatically sent in chat at configured intervals.</p>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Interval',       desc: 'Send on a fixed cadence in minutes.' },
            { label: 'Random Window',  desc: 'Add jitter so repeated promos feel less robotic.' },
            { label: 'Platforms',      desc: 'Choose which connected live outputs receive the message.' },
          ].map(({ label, desc }) => (
            <div key={label} className="bg-gray-800/40 rounded-xl border border-gray-700 p-4">
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">{label}</p>
              <p className="text-sm text-gray-300">{desc}</p>
            </div>
          ))}
        </div>

        {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

        <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/60">
                {['Message', 'Interval', 'Random Window', 'Platforms', 'Last Sent', 'Active', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{row.message}</td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{Math.round(row.intervalSeconds / 60)} min</td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {row.randomWindowSeconds > 0 ? `±${Math.round(row.randomWindowSeconds / 60)} min` : 'Exact'}
                  </td>
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
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatLastSent(row.lastSentAt)}</td>
                  <td className="px-4 py-3">
                    <label className="toggle-switch">
                      <input type="checkbox" checked={row.enabled} onChange={() => void toggleEnabled(row)} />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => openEdit(row)}
                        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">✏️</button>
                      <button type="button" onClick={() => void deleteRow(row.id)}
                        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white transition-colors">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-gray-500 text-center" colSpan={7}>No scheduled messages yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────── */}
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
                  placeholder="Remember to follow the channel! 💜"
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">
                    Interval (min) <span className="text-violet-400">*</span>
                  </label>
                  <input
                    type="number" min="1"
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Random Window (min)</label>
                  <p className="text-xs text-gray-600 mb-1">0 = exact interval</p>
                  <input
                    type="number" min="0"
                    value={randomWindowMinutes}
                    onChange={(e) => setRandomWindowMinutes(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Platforms</label>
                <div className="flex gap-3 flex-wrap">
                  {PLATFORMS.map(({ id, label, textClass }) => (
                    <label key={id} className="flex items-center gap-2 text-sm cursor-pointer text-gray-300">
                      <input
                        type="checkbox"
                        checked={platforms.includes(id)}
                        onChange={() => togglePlatform(id)}
                        className="accent-violet-500"
                      />
                      <span className={textClass}>{label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-1.5">Sent only to connected and live platforms.</p>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-violet-500" />
                Active
              </label>

              {modalError ? <p className="text-sm text-red-400">{modalError}</p> : null}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-gray-700">
              <button type="button" onClick={closeModal}
                className="flex-1 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
                Cancel
              </button>
              <button type="button" disabled={isBusy} onClick={() => void save()}
                className="flex-1 px-3 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors disabled:opacity-60">
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
