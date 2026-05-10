import { useEffect, useMemo, useState } from 'react';

import type {
  PlatformId,
  Poll,
  PollSnapshot,
  PollUpsertInput,
} from '../../shared/types.js';
import { PollEditorModal } from '../components/PollEditorModal.js';

interface PlatformOption {
  id: PlatformId;
  label: string;
  hint: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  tiktok: 'TikTok',
};

async function getConfiguredPlatformOptions(): Promise<PlatformOption[]> {
  const accounts = await window.copilot.accountsList();
  const byProvider = new Map<string, { count: number; channels: string[] }>();
  for (const account of accounts) {
    if (!account.enabled) continue;
    const bucket = byProvider.get(account.providerId) ?? { count: 0, channels: [] };
    bucket.count += 1;
    if (account.channel) bucket.channels.push(account.channel);
    byProvider.set(account.providerId, bucket);
  }
  return Array.from(byProvider.entries()).map(([providerId, info]) => ({
    id: providerId as PlatformId,
    label: PROVIDER_LABELS[providerId] ?? providerId,
    hint: info.count === 1 ? info.channels[0] ?? '' : `${info.count} accounts`,
  }));
}

function statusLabel(status: Poll['status']): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'active': return 'Active';
    case 'closed': return 'Closed';
    case 'cancelled': return 'Cancelled';
  }
}

function statusClass(status: Poll['status']): string {
  switch (status) {
    case 'active': return 'bg-green-900/40 text-green-300 border-green-700/50';
    case 'closed': return 'bg-amber-900/40 text-amber-300 border-amber-700/50';
    case 'cancelled': return 'bg-rose-900/40 text-rose-300 border-rose-700/50';
    default: return 'bg-gray-800 text-gray-400 border-gray-700';
  }
}

export function PollsPage() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [snapshot, setSnapshot] = useState<PollSnapshot | null>(null);
  const [platformOptions, setPlatformOptions] = useState<PlatformOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPoll, setEditingPoll] = useState<Poll | null>(null);

  const activePoll = useMemo(() => polls.find((p) => p.status === 'active') ?? null, [polls]);

  useEffect(() => {
    void load();

    const disconnectState = window.copilot.onPollState((payload) => {
      setSnapshot(payload);
      void window.copilot.listPolls().then(setPolls).catch(() => {});
    });
    const disconnectVote = window.copilot.onPollVote(() => {
      // The state push that follows already carries the updated tally.
    });
    const disconnectResult = window.copilot.onPollResult((payload) => {
      setSnapshot(payload);
      void window.copilot.listPolls().then(setPolls).catch(() => {});
    });

    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => {
      disconnectState();
      disconnectVote();
      disconnectResult();
      clearInterval(interval);
    };
  }, []);

  async function load(): Promise<void> {
    try {
      setError(null);
      const [rows, active, opts] = await Promise.all([
        window.copilot.listPolls(),
        window.copilot.getActivePoll(),
        getConfiguredPlatformOptions(),
      ]);
      setPolls(rows);
      setPlatformOptions(opts);
      if (active) {
        setSnapshot(await window.copilot.getPollSnapshot(active.id));
      } else {
        setSnapshot(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load polls');
    }
  }

  function openCreate(): void {
    setEditingPoll(null);
    setModalOpen(true);
    setError(null);
  }

  function openEdit(poll: Poll): void {
    setEditingPoll(poll);
    setModalOpen(true);
    setError(null);
  }

  async function handleSubmit(payload: PollUpsertInput, options: { startAfter: boolean }): Promise<void> {
    setSavedNote(null);
    const updated = await window.copilot.upsertPoll(payload);
    setPolls(updated);
    const saved = updated.find((p) => p.id === payload.id)
      ?? updated.find((p) => p.title === payload.title)
      ?? updated[updated.length - 1];

    if (options.startAfter && saved) {
      if (activePoll && activePoll.id !== saved.id) {
        throw new Error('Another poll is already running. Close it before starting a new one.');
      }
      const next = await window.copilot.controlPoll({ pollId: saved.id, action: 'start' });
      setSnapshot(next);
      setPolls(await window.copilot.listPolls());
      setSavedNote('Poll started — viewers can vote now.');
    } else {
      setSavedNote('Saved as draft.');
    }
  }

  async function deletePoll(id: string): Promise<void> {
    setBusy(true);
    try {
      const updated = await window.copilot.deletePoll({ id });
      setPolls(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete poll');
    } finally {
      setBusy(false);
    }
  }

  async function startPoll(id: string): Promise<void> {
    setBusy(true);
    try {
      const next = await window.copilot.controlPoll({ pollId: id, action: 'start' });
      setSnapshot(next);
      setPolls(await window.copilot.listPolls());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to start poll');
    } finally {
      setBusy(false);
    }
  }

  async function controlActive(action: 'cancel' | 'force_close'): Promise<void> {
    if (!activePoll) return;
    setBusy(true);
    try {
      const next = await window.copilot.controlPoll({ pollId: activePoll.id, action });
      setSnapshot(next);
      setPolls(await window.copilot.listPolls());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to control poll');
    } finally {
      setBusy(false);
    }
  }

  const remainingMs = activePoll?.closesAt ? new Date(activePoll.closesAt).getTime() - now : 0;
  const remainingLabel = activePoll?.closesAt
    ? remainingMs <= 0
      ? '00:00'
      : `${String(Math.floor(remainingMs / 60_000)).padStart(2, '0')}:${String(Math.floor((remainingMs % 60_000) / 1_000)).padStart(2, '0')}`
    : '—';

  return (
    <section className="p-6 max-w-5xl mx-auto space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Polls</h1>
          <p className="text-sm text-gray-400 mt-1">
            Create a question, list options, and viewers vote by typing the option number in chat (1, 2, 3…).
            One vote per user.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded bg-purple-700 text-white text-sm hover:bg-purple-600 shrink-0"
        >
          New poll
        </button>
      </header>

      {error ? (
        <div className="rounded border border-rose-800 bg-rose-950/40 text-rose-200 px-4 py-2 text-sm">{error}</div>
      ) : null}
      {savedNote ? (
        <div className="rounded border border-emerald-800 bg-emerald-950/40 text-emerald-200 px-4 py-2 text-sm">{savedNote}</div>
      ) : null}

      {snapshot && snapshot.poll.status === 'active' ? (
        <article className="rounded-lg border border-purple-700/50 bg-purple-950/20 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-purple-300">Live poll</p>
              <h2 className="text-xl font-semibold text-white">{snapshot.poll.title}</h2>
            </div>
            <div className="text-right">
              <p className="text-2xl font-mono text-purple-200">{remainingLabel}</p>
              <p className="text-xs text-gray-400">{snapshot.totalVotes} vote{snapshot.totalVotes === 1 ? '' : 's'}</p>
            </div>
          </div>
          <ul className="space-y-2">
            {snapshot.tally.map((entry) => (
              <li key={entry.optionId} className="relative rounded border border-gray-800 bg-gray-900/60 overflow-hidden">
                <div
                  className="absolute inset-0 bg-purple-700/30 transition-all"
                  style={{ width: `${entry.percent}%` }}
                />
                <div className="relative flex items-center justify-between px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-white">
                    <span className="inline-flex items-center justify-center min-w-[22px] h-6 px-1.5 rounded bg-purple-900/60 text-purple-200 font-mono">
                      {entry.index}
                    </span>
                    {entry.label}
                  </span>
                  <span className="text-xs text-gray-300 font-mono">
                    {entry.percent.toFixed(1)}% · <strong className="text-white">{entry.votes}</strong>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => controlActive('force_close')}
              className="px-3 py-1.5 rounded bg-amber-700/40 text-amber-100 text-sm hover:bg-amber-700/60 disabled:opacity-50"
            >
              Close now
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => controlActive('cancel')}
              className="px-3 py-1.5 rounded bg-rose-700/40 text-rose-100 text-sm hover:bg-rose-700/60 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </article>
      ) : null}

      <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white">Saved polls</h2>
        {polls.length === 0 ? (
          <p className="text-sm text-gray-500">No polls yet.</p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {polls.map((poll) => (
              <li key={poll.id} className="py-3 flex items-center gap-3">
                <span
                  className={`shrink-0 px-2 py-0.5 rounded border text-xs uppercase tracking-wider ${statusClass(poll.status)}`}
                >
                  {statusLabel(poll.status)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{poll.title || '(untitled)'}</p>
                  <p className="text-xs text-gray-500">
                    {poll.options.length} option{poll.options.length === 1 ? '' : 's'} · {poll.durationSeconds}s
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {poll.status === 'draft' || poll.status === 'closed' || poll.status === 'cancelled' ? (
                    <button
                      type="button"
                      disabled={busy || (activePoll !== null && activePoll.id !== poll.id)}
                      onClick={() => startPoll(poll.id)}
                      className="px-2 py-1 text-xs rounded bg-green-700/40 text-green-100 hover:bg-green-700/60 disabled:opacity-30"
                    >
                      Start
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openEdit(poll)}
                    className="px-2 py-1 text-xs rounded text-gray-300 hover:bg-gray-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy || poll.status === 'active'}
                    onClick={() => deletePoll(poll.id)}
                    className="px-2 py-1 text-xs rounded text-rose-300 hover:bg-rose-900/40 disabled:opacity-30"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PollEditorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialPoll={editingPoll}
        platformOptions={platformOptions}
        activePollId={activePoll?.id ?? null}
        onSubmit={handleSubmit}
      />
    </section>
  );
}
