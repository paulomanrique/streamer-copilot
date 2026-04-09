import { useEffect, useMemo, useState } from 'react';

import type {
  PlatformId,
  Raffle,
  RaffleControlAction,
  RaffleCreateInput,
  RaffleEntry,
  RaffleOverlayInfo,
  RaffleRoundResult,
  RaffleSnapshot,
  RaffleUpdateInput,
} from '../../shared/types.js';

const PLATFORM_OPTIONS: Array<{ id: PlatformId; label: string }> = [
  { id: 'twitch', label: 'Twitch' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'kick', label: 'Kick' },
];

const DEFAULT_FORM: RaffleCreateInput = {
  title: '',
  entryCommand: '!join',
  mode: 'single-winner',
  entryDeadlineAt: null,
  acceptedPlatforms: ['twitch', 'youtube', 'kick'],
  staffTriggerCommand: '!roll',
  winnerAnnouncementTemplate: 'Parabens {winner}, voce venceu o sorteio {title}!',
  enabled: true,
};

function statusLabel(status: Raffle['status']): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'collecting': return 'Collecting';
    case 'ready_to_spin': return 'Ready';
    case 'spinning': return 'Spinning';
    case 'paused_top2': return 'Top 2';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toLocalInputValue(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

interface RaffleFormState extends RaffleCreateInput {
  id?: string;
  deadlineInput: string;
}

function createFormState(raffle?: Raffle | null): RaffleFormState {
  if (!raffle) {
    return {
      ...DEFAULT_FORM,
      deadlineInput: '',
    };
  }
  return {
    id: raffle.id,
    title: raffle.title,
    entryCommand: raffle.entryCommand,
    mode: raffle.mode,
    entryDeadlineAt: raffle.entryDeadlineAt,
    deadlineInput: toLocalInputValue(raffle.entryDeadlineAt),
    acceptedPlatforms: raffle.acceptedPlatforms,
    staffTriggerCommand: raffle.staffTriggerCommand,
    winnerAnnouncementTemplate: raffle.winnerAnnouncementTemplate,
    enabled: raffle.enabled,
  };
}

export function RafflesPage() {
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [activeSnapshot, setActiveSnapshot] = useState<RaffleSnapshot | null>(null);
  const [selectedRaffleId, setSelectedRaffleId] = useState<string>('');
  const [selectedSnapshot, setSelectedSnapshot] = useState<RaffleSnapshot | null>(null);
  const [overlayInfo, setOverlayInfo] = useState<RaffleOverlayInfo | null>(null);
  const [form, setForm] = useState<RaffleFormState>(createFormState());
  const [isBusy, setIsBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const selectedRaffle = useMemo(
    () => raffles.find((raffle) => raffle.id === selectedRaffleId) ?? activeSnapshot?.raffle ?? null,
    [raffles, selectedRaffleId, activeSnapshot],
  );

  useEffect(() => {
    void load();
    const disconnectState = window.copilot.onRaffleState((payload) => {
      setActiveSnapshot(payload);
      if (payload) {
        setSelectedRaffleId((current) => current || payload.raffle.id);
      }
      void window.copilot.listRaffles().then(setRaffles).catch(() => {});
    });
    const disconnectEntry = window.copilot.onRaffleEntry((entry) => {
      setSelectedSnapshot((current) => {
        if (!current || current.raffle.id !== entry.raffleId) return current;
        const entries = [...current.entries, entry];
        return {
          ...current,
          entries,
          activeEntries: entries.filter((item) => !item.isEliminated && !item.isWinner),
        };
      });
    });
    const disconnectResult = window.copilot.onRaffleResult((result) => {
      setSelectedSnapshot((current) => {
        if (!current || current.raffle.id !== result.raffleId) return current;
        return { ...current, history: [...current.history, result] };
      });
    });
    return () => {
      disconnectState();
      disconnectEntry();
      disconnectResult();
    };
  }, []);

  useEffect(() => {
    if (!selectedRaffleId) return;
    void refreshSelected(selectedRaffleId);
  }, [selectedRaffleId]);

  useEffect(() => {
    if (!selectedRaffle?.id) {
      setOverlayInfo(null);
      return;
    }
    void window.copilot.getRaffleOverlayInfo(selectedRaffle.id)
      .then(setOverlayInfo)
      .catch(() => setOverlayInfo(null));
  }, [selectedRaffle?.id]);

  async function load(): Promise<void> {
    try {
      setError(null);
      const [list, active] = await Promise.all([
        window.copilot.listRaffles(),
        window.copilot.getActiveRaffle(),
      ]);
      setRaffles(list);
      const nextSelectedId = active?.id ?? list[0]?.id ?? '';
      setSelectedRaffleId(nextSelectedId);
      if (nextSelectedId) await refreshSelected(nextSelectedId);
      if (active) {
        setActiveSnapshot(await window.copilot.getRaffleSnapshot(active.id));
      } else {
        setActiveSnapshot(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load raffles');
    }
  }

  async function refreshSelected(raffleId: string): Promise<void> {
    try {
      const snapshot = await window.copilot.getRaffleSnapshot(raffleId);
      setSelectedSnapshot(snapshot);
    } catch (cause) {
      setSelectedSnapshot(null);
      setError(cause instanceof Error ? cause.message : 'Failed to load raffle snapshot');
    }
  }

  function updateForm<K extends keyof RaffleFormState>(key: K, value: RaffleFormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreate(): void {
    setForm(createFormState());
    setError(null);
  }

  function startEdit(raffle: Raffle): void {
    setForm(createFormState(raffle));
    setError(null);
  }

  async function save(): Promise<void> {
    setIsSaving(true);
    setError(null);
    try {
      const payload: RaffleCreateInput = {
        title: form.title,
        entryCommand: form.entryCommand,
        mode: form.mode,
        entryDeadlineAt: form.deadlineInput ? new Date(form.deadlineInput).toISOString() : null,
        acceptedPlatforms: form.acceptedPlatforms,
        staffTriggerCommand: form.staffTriggerCommand,
        winnerAnnouncementTemplate: form.winnerAnnouncementTemplate,
        enabled: form.enabled,
      };
      const rows = form.id
        ? await window.copilot.updateRaffle({ ...payload, id: form.id } satisfies RaffleUpdateInput)
        : await window.copilot.createRaffle(payload);
      setRaffles(rows);
      const selectedId = form.id ?? rows[0]?.id ?? '';
      if (selectedId) {
        setSelectedRaffleId(selectedId);
        await refreshSelected(selectedId);
      }
      if (!form.id) setForm(createFormState());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save raffle');
    } finally {
      setIsSaving(false);
    }
  }

  async function removeRaffle(id: string): Promise<void> {
    try {
      const rows = await window.copilot.deleteRaffle({ id });
      setRaffles(rows);
      const nextId = rows[0]?.id ?? '';
      setSelectedRaffleId(nextId);
      if (nextId) await refreshSelected(nextId);
      else setSelectedSnapshot(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete raffle');
    }
  }

  async function runAction(action: RaffleControlAction): Promise<void> {
    if (!selectedRaffle) return;
    setIsBusy(true);
    setError(null);
    try {
      const snapshot = await window.copilot.controlRaffle({ raffleId: selectedRaffle.id, action });
      setSelectedSnapshot(snapshot);
      setActiveSnapshot(snapshot.raffle.status === 'completed' || snapshot.raffle.status === 'cancelled' || snapshot.raffle.status === 'draft'
        ? null
        : snapshot);
      setRaffles(await window.copilot.listRaffles());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to run raffle action');
    } finally {
      setIsBusy(false);
    }
  }

  async function copyOverlayUrl(): Promise<void> {
    if (!overlayInfo?.overlayUrl) return;
    try {
      await navigator.clipboard.writeText(overlayInfo.overlayUrl);
      setCopyMessage('Overlay URL copied');
      window.setTimeout(() => setCopyMessage(null), 1800);
    } catch {
      setCopyMessage('Clipboard unavailable');
      window.setTimeout(() => setCopyMessage(null), 1800);
    }
  }

  const visibleSnapshot = selectedSnapshot ?? activeSnapshot;
  const topTwoEntries = visibleSnapshot
    ? visibleSnapshot.entries.filter((entry) => visibleSnapshot.raffle.top2EntryIds.includes(entry.id))
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Raffles</h2>
          <p className="text-sm text-gray-400">Create giveaways, collect entries from chat, then run the wheel in OBS.</p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="px-3 py-1.5 rounded bg-orange-500 hover:bg-orange-400 text-sm font-medium text-white transition-colors"
        >
          + New Raffle
        </button>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="grid xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] gap-6 items-start">
        <section className="bg-gray-800/40 rounded-2xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/70">
                {['Title', 'Mode', 'Status', 'Entries', 'Deadline', 'Actions'].map((heading) => (
                  <th key={heading} className="px-4 py-3 text-left text-xs uppercase tracking-wider text-gray-400">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {raffles.map((raffle) => (
                <tr
                  key={raffle.id}
                  className={`border-b border-gray-800 ${selectedRaffleId === raffle.id ? 'bg-gray-800/70' : 'hover:bg-gray-800/40'}`}
                >
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setSelectedRaffleId(raffle.id)} className="text-left">
                      <span className="block font-medium text-gray-100">{raffle.title}</span>
                      <span className="block text-xs text-gray-500">{raffle.entryCommand} · {raffle.staffTriggerCommand}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{raffle.mode === 'single-winner' ? 'Single' : 'Survivor'}</td>
                  <td className="px-4 py-3 text-gray-300">{statusLabel(raffle.status)}</td>
                  <td className="px-4 py-3 text-gray-400">{raffle.entriesCount} total · {raffle.activeEntriesCount} active</td>
                  <td className="px-4 py-3 text-gray-400">{formatDateTime(raffle.entryDeadlineAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => startEdit(raffle)} className="text-orange-300 hover:text-orange-200">Edit</button>
                      <button type="button" onClick={() => void removeRaffle(raffle.id)} className="text-red-300 hover:text-red-200">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {raffles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">No raffles created yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="bg-gray-800/40 rounded-2xl border border-gray-700 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">{form.id ? 'Edit raffle' : 'Create raffle'}</h3>
            <p className="text-xs text-gray-500 mt-1">Only one raffle can be active at a time.</p>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-1 text-sm">
              <span className="text-gray-300">Title</span>
              <input value={form.title} onChange={(event) => updateForm('title', event.target.value)} className="rounded bg-gray-900 border border-gray-700 px-3 py-2 text-gray-100" />
            </label>

            <div className="grid md:grid-cols-2 gap-4">
              <label className="grid gap-1 text-sm">
                <span className="text-gray-300">Entry command</span>
                <input value={form.entryCommand} onChange={(event) => updateForm('entryCommand', event.target.value)} className="rounded bg-gray-900 border border-gray-700 px-3 py-2 text-gray-100" />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-gray-300">Staff trigger</span>
                <input value={form.staffTriggerCommand} onChange={(event) => updateForm('staffTriggerCommand', event.target.value)} className="rounded bg-gray-900 border border-gray-700 px-3 py-2 text-gray-100" />
              </label>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <label className="grid gap-1 text-sm">
                <span className="text-gray-300">Mode</span>
                <select value={form.mode} onChange={(event) => updateForm('mode', event.target.value as Raffle['mode'])} className="rounded bg-gray-900 border border-gray-700 px-3 py-2 text-gray-100">
                  <option value="single-winner">Single winner</option>
                  <option value="survivor-final">Survivor final</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-gray-300">Entry deadline</span>
                <input type="datetime-local" value={form.deadlineInput} onChange={(event) => updateForm('deadlineInput', event.target.value)} className="rounded bg-gray-900 border border-gray-700 px-3 py-2 text-gray-100" />
              </label>
            </div>

            <label className="grid gap-2 text-sm">
              <span className="text-gray-300">Accepted platforms</span>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map((platform) => {
                  const active = form.acceptedPlatforms.includes(platform.id);
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => updateForm(
                        'acceptedPlatforms',
                        active
                          ? form.acceptedPlatforms.filter((id) => id !== platform.id)
                          : [...form.acceptedPlatforms, platform.id],
                      )}
                      className={active ? 'px-3 py-1.5 rounded-full bg-orange-500/20 text-orange-200 border border-orange-400/40' : 'px-3 py-1.5 rounded-full bg-gray-900 text-gray-400 border border-gray-700'}
                    >
                      {platform.label}
                    </button>
                  );
                })}
              </div>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-gray-300">Winner announcement</span>
              <textarea value={form.winnerAnnouncementTemplate} onChange={(event) => updateForm('winnerAnnouncementTemplate', event.target.value)} rows={3} className="rounded bg-gray-900 border border-gray-700 px-3 py-2 text-gray-100" />
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.enabled} onChange={(event) => updateForm('enabled', event.target.checked)} />
              Enabled
            </label>
          </div>

          <div className="flex gap-3">
            <button type="button" disabled={isSaving} onClick={() => void save()} className="px-3 py-2 rounded bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white text-sm font-medium">
              {form.id ? 'Save changes' : 'Create raffle'}
            </button>
            <button type="button" onClick={startCreate} className="px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-300">
              Clear
            </button>
          </div>
        </section>
      </div>

      {visibleSnapshot ? (
        <div className="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-6 items-start">
          <section className="space-y-6">
            <div className="grid md:grid-cols-4 gap-3">
              {[
                { label: 'Status', value: statusLabel(visibleSnapshot.raffle.status) },
                { label: 'Entries', value: String(visibleSnapshot.raffle.entriesCount) },
                { label: 'Active', value: String(visibleSnapshot.raffle.activeEntriesCount) },
                { label: 'Round', value: String(visibleSnapshot.raffle.currentRound) },
              ].map((item) => (
                <article key={item.label} className="bg-gray-800/40 rounded-2xl border border-gray-700 p-4">
                  <p className="text-xs uppercase tracking-wider text-gray-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-100">{item.value}</p>
                </article>
              ))}
            </div>

            <section className="bg-gray-800/40 rounded-2xl border border-gray-700 p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-100">{visibleSnapshot.raffle.title}</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {visibleSnapshot.raffle.entryCommand} on {visibleSnapshot.raffle.acceptedPlatforms.join(', ')} · staff trigger {visibleSnapshot.raffle.staffTriggerCommand}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Deadline: {formatDateTime(visibleSnapshot.raffle.entryDeadlineAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={isBusy} onClick={() => void runAction('open_entries')} className="px-3 py-2 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 disabled:opacity-50">Open entries</button>
                  <button type="button" disabled={isBusy} onClick={() => void runAction('close_entries')} className="px-3 py-2 rounded bg-sky-500/20 text-sky-200 border border-sky-400/30 disabled:opacity-50">Close entries</button>
                  <button type="button" disabled={isBusy} onClick={() => void runAction('spin')} className="px-3 py-2 rounded bg-orange-500/20 text-orange-200 border border-orange-400/30 disabled:opacity-50">Spin</button>
                  <button type="button" disabled={isBusy} onClick={() => void runAction('finalize')} className="px-3 py-2 rounded bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-400/30 disabled:opacity-50">Finalize</button>
                  <button type="button" disabled={isBusy} onClick={() => void runAction('cancel')} className="px-3 py-2 rounded bg-red-500/20 text-red-200 border border-red-400/30 disabled:opacity-50">Cancel</button>
                  <button type="button" disabled={isBusy} onClick={() => void runAction('reset')} className="px-3 py-2 rounded bg-gray-900 text-gray-200 border border-gray-700 disabled:opacity-50">Reset</button>
                </div>
              </div>

              {topTwoEntries.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {topTwoEntries.map((entry) => (
                    <span key={entry.id} className="px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-100 text-sm">
                      Top 2: {entry.displayName}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="bg-gray-800/40 rounded-2xl border border-gray-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-700">
                <h3 className="text-base font-semibold text-gray-100">Participants</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800/70 border-b border-gray-700">
                    {['Name', 'Platform', 'Entered', 'State'].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-left text-xs uppercase tracking-wider text-gray-400">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleSnapshot.entries.map((entry: RaffleEntry) => (
                    <tr key={entry.id} className="border-b border-gray-800">
                      <td className="px-4 py-3 text-gray-100">{entry.displayName}</td>
                      <td className="px-4 py-3 text-gray-400">{entry.platform}</td>
                      <td className="px-4 py-3 text-gray-400">{formatDateTime(entry.enteredAt)}</td>
                      <td className="px-4 py-3 text-gray-300">
                        {entry.isWinner ? 'Winner' : entry.isEliminated ? `Eliminated #${entry.eliminationOrder ?? '—'}` : 'Active'}
                      </td>
                    </tr>
                  ))}
                  {visibleSnapshot.entries.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">No entries yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </section>

            <section className="bg-gray-800/40 rounded-2xl border border-gray-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-700">
                <h3 className="text-base font-semibold text-gray-100">Round history</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800/70 border-b border-gray-700">
                    {['Round', 'Action', 'Result', 'Selected', 'Remaining'].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-left text-xs uppercase tracking-wider text-gray-400">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleSnapshot.history.map((item: RaffleRoundResult) => (
                    <tr key={item.id} className="border-b border-gray-800">
                      <td className="px-4 py-3 text-gray-100">#{item.roundNumber}</td>
                      <td className="px-4 py-3 text-gray-400">{item.actionType}</td>
                      <td className="px-4 py-3 text-gray-400">{item.resultType}</td>
                      <td className="px-4 py-3 text-gray-300">{item.selectedEntryName}</td>
                      <td className="px-4 py-3 text-gray-400">{item.participantCountAfter}</td>
                    </tr>
                  ))}
                  {visibleSnapshot.history.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No rounds executed yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </section>
          </section>

          <section className="space-y-4">
            <div className="bg-gray-800/40 rounded-2xl border border-gray-700 p-5 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-gray-100">OBS Overlay</h3>
                <p className="text-sm text-gray-400 mt-1">Use the URL below in an OBS Browser Source.</p>
              </div>

              <div className="grid gap-2">
                <label className="text-xs uppercase tracking-wider text-gray-500">Overlay URL</label>
                <div className="flex gap-2">
                  <input value={overlayInfo?.overlayUrl ?? ''} readOnly className="flex-1 rounded bg-gray-900 border border-gray-700 px-3 py-2 text-gray-100 text-sm" />
                  <button type="button" onClick={() => void copyOverlayUrl()} className="px-3 py-2 rounded bg-orange-500 hover:bg-orange-400 text-white text-sm">
                    Copy
                  </button>
                </div>
                {copyMessage ? <p className="text-xs text-orange-200">{copyMessage}</p> : null}
              </div>

              <div className="text-xs text-gray-500 space-y-1">
                <p>1. Add a Browser Source in OBS.</p>
                <p>2. Paste the URL above.</p>
                <p>3. Set width/height to match your scene layout.</p>
              </div>
            </div>

            <div className="bg-gray-950 rounded-2xl border border-gray-700 overflow-hidden">
              {overlayInfo?.overlayUrl ? (
                <iframe title="Raffle overlay preview" src={overlayInfo.overlayUrl} className="w-full h-[480px] bg-transparent" />
              ) : (
                <div className="h-[480px] grid place-items-center text-sm text-gray-500">Overlay preview unavailable.</div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
