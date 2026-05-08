import { useEffect, useMemo, useState } from 'react';

import type {
  PlatformId,
  Poll,
  PollSnapshot,
  PollUpsertInput,
} from '../../shared/types.js';

interface PlatformOption {
  id: PlatformId;
  label: string;
  hint: string;
}

interface OptionDraft {
  id?: string;
  label: string;
}

interface PollDraft {
  id?: string;
  title: string;
  options: OptionDraft[];
  durationSeconds: number;
  acceptedPlatforms: PlatformId[];
  resultAnnouncementTemplate: string;
}

const DEFAULT_TEMPLATE =
  'Resultado da enquete "{title}": {winner} venceu com {winner_votes} votos ({winner_percent}%). Total: {total_votes} votos.';

const DEFAULT_DRAFT: PollDraft = {
  title: '',
  options: [
    { label: '' },
    { label: '' },
  ],
  durationSeconds: 60,
  acceptedPlatforms: [],
  resultAnnouncementTemplate: DEFAULT_TEMPLATE,
};

async function getConfiguredPlatformOptions(): Promise<PlatformOption[]> {
  const [twitchCreds, youtubeSettings] = await Promise.all([
    window.copilot.twitchGetCredentials(),
    window.copilot.youtubeGetSettings(),
  ]);

  const options: PlatformOption[] = [];
  if (twitchCreds?.channel) {
    options.push({ id: 'twitch', label: 'Twitch', hint: `#${twitchCreds.channel}` });
  }
  const enabled = youtubeSettings.channels.filter((c) => c.enabled);
  if (enabled.length > 0) {
    options.push({ id: 'youtube', label: 'YouTube', hint: `${enabled.length} channel${enabled.length > 1 ? 's' : ''}` });
  }
  return options;
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

function fromPoll(poll: Poll): PollDraft {
  return {
    id: poll.id,
    title: poll.title,
    options: poll.options.map((opt) => ({ id: opt.id, label: opt.label })),
    durationSeconds: poll.durationSeconds,
    acceptedPlatforms: [...poll.acceptedPlatforms],
    resultAnnouncementTemplate: poll.resultAnnouncementTemplate,
  };
}

function toUpsert(draft: PollDraft): PollUpsertInput {
  return {
    id: draft.id,
    title: draft.title.trim(),
    options: draft.options
      .map((opt) => ({ id: opt.id, label: opt.label.trim() }))
      .filter((opt) => opt.label.length > 0),
    durationSeconds: draft.durationSeconds,
    acceptedPlatforms: draft.acceptedPlatforms,
    resultAnnouncementTemplate: draft.resultAnnouncementTemplate.trim(),
  };
}

export function PollsPage() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [snapshot, setSnapshot] = useState<PollSnapshot | null>(null);
  const [platformOptions, setPlatformOptions] = useState<PlatformOption[]>([]);
  const [draft, setDraft] = useState<PollDraft>(DEFAULT_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const activePoll = useMemo(() => polls.find((p) => p.status === 'active') ?? null, [polls]);
  const editingExistingDraft = draft.id !== undefined;

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
      setDraft((current) =>
        current.acceptedPlatforms.length === 0 && opts.length > 0
          ? { ...current, acceptedPlatforms: opts.map((o) => o.id) }
          : current,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load polls');
    }
  }

  function newDraft(): void {
    setDraft({ ...DEFAULT_DRAFT, acceptedPlatforms: platformOptions.map((o) => o.id) });
    setError(null);
  }

  function editPoll(poll: Poll): void {
    setDraft(fromPoll(poll));
    setError(null);
  }

  function setOption(index: number, label: string): void {
    setDraft((current) => {
      const next = [...current.options];
      next[index] = { ...next[index], label };
      return { ...current, options: next };
    });
  }

  function addOption(): void {
    setDraft((current) =>
      current.options.length >= 10
        ? current
        : { ...current, options: [...current.options, { label: '' }] },
    );
  }

  function removeOption(index: number): void {
    setDraft((current) =>
      current.options.length <= 2
        ? current
        : { ...current, options: current.options.filter((_, i) => i !== index) },
    );
  }

  function togglePlatform(id: PlatformId): void {
    setDraft((current) => ({
      ...current,
      acceptedPlatforms: current.acceptedPlatforms.includes(id)
        ? current.acceptedPlatforms.filter((p) => p !== id)
        : [...current.acceptedPlatforms, id],
    }));
  }

  async function savePoll(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const payload = toUpsert(draft);
      if (!payload.title) throw new Error('Title is required');
      if (payload.options.length < 2) throw new Error('At least 2 options are required');
      if (payload.acceptedPlatforms.length === 0) throw new Error('Pick at least one platform');
      const updated = await window.copilot.upsertPoll(payload);
      setPolls(updated);
      newDraft();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save poll');
    } finally {
      setBusy(false);
    }
  }

  async function deletePoll(id: string): Promise<void> {
    setBusy(true);
    try {
      const updated = await window.copilot.deletePoll({ id });
      setPolls(updated);
      if (draft.id === id) newDraft();
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
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Polls</h1>
          <p className="text-sm text-gray-400 mt-1">
            Create a question, list options, and viewers vote by typing the option number in chat (1, 2, 3…).
            One vote per user.
          </p>
        </div>
      </header>

      {error ? (
        <div className="rounded border border-rose-800 bg-rose-950/40 text-rose-200 px-4 py-2 text-sm">{error}</div>
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

      <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-white">{editingExistingDraft ? 'Edit poll' : 'New poll'}</h2>

        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-gray-400">Title</span>
          <input
            type="text"
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            className="mt-1 w-full rounded border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-700"
            placeholder="What do you want to ask?"
          />
        </label>

        <div>
          <span className="block text-xs uppercase tracking-wider text-gray-400">Options</span>
          <ul className="mt-2 space-y-2">
            {draft.options.map((option, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center min-w-[28px] h-8 px-2 rounded bg-gray-800 text-gray-300 font-mono text-sm">
                  {index + 1}
                </span>
                <input
                  type="text"
                  value={option.label}
                  onChange={(event) => setOption(index, event.target.value)}
                  className="flex-1 rounded border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-700"
                  placeholder={`Option ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  disabled={draft.options.length <= 2}
                  className="px-2 py-1.5 rounded text-sm text-gray-400 hover:text-rose-300 disabled:opacity-30"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={addOption}
            disabled={draft.options.length >= 10}
            className="mt-2 px-3 py-1.5 rounded border border-gray-800 text-gray-200 text-sm hover:bg-gray-800 disabled:opacity-50"
          >
            Add option
          </button>
        </div>

        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-gray-400">
            Duration (seconds) — {draft.durationSeconds}s
          </span>
          <input
            type="range"
            min={10}
            max={3600}
            step={10}
            value={draft.durationSeconds}
            onChange={(event) =>
              setDraft((current) => ({ ...current, durationSeconds: Number(event.target.value) }))
            }
            className="mt-2 w-full"
          />
        </label>

        <div>
          <span className="block text-xs uppercase tracking-wider text-gray-400">Accept votes from</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {platformOptions.length === 0 ? (
              <p className="text-sm text-gray-500">No platforms configured. Set them up in Connections.</p>
            ) : (
              platformOptions.map((option) => {
                const active = draft.acceptedPlatforms.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => togglePlatform(option.id)}
                    className={`px-3 py-1.5 rounded border text-sm transition ${
                      active
                        ? 'border-purple-600 bg-purple-700/30 text-white'
                        : 'border-gray-800 text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {option.label}
                    <span className="ml-2 text-xs text-gray-400">{option.hint}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-gray-400">Result announcement</span>
          <textarea
            value={draft.resultAnnouncementTemplate}
            onChange={(event) =>
              setDraft((current) => ({ ...current, resultAnnouncementTemplate: event.target.value }))
            }
            rows={2}
            className="mt-1 w-full rounded border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-700"
          />
          <span className="mt-1 block text-xs text-gray-500">
            Variables: {'{title}'}, {'{winner}'}, {'{winner_votes}'}, {'{winner_percent}'}, {'{total_votes}'}, {'{results}'}
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          {editingExistingDraft ? (
            <button
              type="button"
              onClick={newDraft}
              className="px-3 py-1.5 rounded text-sm text-gray-300 hover:bg-gray-800"
            >
              New
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={savePoll}
            className="px-4 py-1.5 rounded bg-purple-700 text-white text-sm hover:bg-purple-600 disabled:opacity-50"
          >
            {editingExistingDraft ? 'Save changes' : 'Create poll'}
          </button>
        </div>
      </section>

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
                    onClick={() => editPoll(poll)}
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
    </section>
  );
}
