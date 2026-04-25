import { useEffect, useRef, useState } from 'react';

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

interface PlatformOption {
  id: PlatformId;
  label: string;
  hint: string;
}

const DEFAULT_FORM: RaffleCreateInput = {
  title: '',
  entryCommand: '!join',
  mode: 'single-winner',
  entryDeadlineAt: null,
  acceptedPlatforms: [],
  staffTriggerCommand: '!roll',
  openAnnouncementTemplate: '',
  eliminationAnnouncementTemplate: '',
  winnerAnnouncementTemplate: 'Parabens {winner}, voce venceu o sorteio {title}!',
  spinSoundFile: null,
  eliminatedSoundFile: null,
  winnerSoundFile: null,
  enabled: true,
};

interface RaffleFormState extends RaffleCreateInput {
  id?: string;
  deadlineInput: string;
}

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
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function createFormState(raffle: Raffle | null, platformOptions: PlatformOption[]): RaffleFormState {
  const defaultPlatforms = platformOptions.map((platform) => platform.id);

  if (!raffle) {
    return {
      ...DEFAULT_FORM,
      acceptedPlatforms: defaultPlatforms,
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
    acceptedPlatforms: raffle.acceptedPlatforms.filter((platform) => defaultPlatforms.includes(platform)),
    staffTriggerCommand: raffle.staffTriggerCommand,
    openAnnouncementTemplate: raffle.openAnnouncementTemplate,
    eliminationAnnouncementTemplate: raffle.eliminationAnnouncementTemplate,
    winnerAnnouncementTemplate: raffle.winnerAnnouncementTemplate,
    spinSoundFile: raffle.spinSoundFile,
    eliminatedSoundFile: raffle.eliminatedSoundFile,
    winnerSoundFile: raffle.winnerSoundFile,
    enabled: raffle.enabled,
  };
}

function canRunAction(status: Raffle['status'], action: RaffleControlAction): boolean {
  switch (action) {
    case 'open_entries':
      return status === 'draft';
    case 'close_entries':
      return status === 'collecting';
    case 'spin':
      return status === 'ready_to_spin';
    case 'finalize':
      return status === 'paused_top2';
    case 'cancel':
      return ['draft', 'collecting', 'ready_to_spin', 'spinning', 'paused_top2'].includes(status);
    case 'reset':
      return status === 'completed' || status === 'cancelled';
  }
}

async function getConfiguredPlatformOptions(): Promise<PlatformOption[]> {
  const [twitchCreds, youtubeSettings] = await Promise.all([
    window.copilot.twitchGetCredentials(),
    window.copilot.youtubeGetSettings(),
  ]);

  const options: PlatformOption[] = [];

  if (twitchCreds?.channel) {
    options.push({
      id: 'twitch',
      label: 'Twitch',
      hint: `Configured for #${twitchCreds.channel}`,
    });
  }

  const enabledYouTubeChannels = youtubeSettings.channels.filter((channel) => channel.enabled);
  if (enabledYouTubeChannels.length > 0) {
    options.push({
      id: 'youtube',
      label: 'YouTube',
      hint: `${enabledYouTubeChannels.length} configured channel${enabledYouTubeChannels.length > 1 ? 's' : ''}`,
    });
  }

  return options;
}

export function RafflesPage() {
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [snapshot, setSnapshot] = useState<RaffleSnapshot | null>(null);
  const [overlayInfo, setOverlayInfo] = useState<RaffleOverlayInfo | null>(null);
  const [platformOptions, setPlatformOptions] = useState<PlatformOption[]>([]);
  const [form, setForm] = useState<RaffleFormState>(createFormState(null, []));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [availableSounds, setAvailableSounds] = useState<Record<'spinning' | 'eliminated' | 'winner', string[]>>({ spinning: [], eliminated: [], winner: [] });

  const topTwoEntries = snapshot
    ? snapshot.entries.filter((entry) => snapshot.raffle.top2EntryIds.includes(entry.id))
    : [];
  const currentStatus = snapshot?.raffle.status ?? raffle?.status ?? 'draft';

  useEffect(() => {
    void load();

    const disconnectState = window.copilot.onRaffleState((payload) => {
      setSnapshot(payload);
      void window.copilot.listRaffles().then((rows) => setRaffle(rows[0] ?? null)).catch(() => {});
    });
    const disconnectEntry = window.copilot.onRaffleEntry((entry) => {
      setSnapshot((current) => {
        if (!current || current.raffle.id !== entry.raffleId) return current;
        const nextEntries = [...current.entries, entry];
        return {
          ...current,
          entries: nextEntries,
          activeEntries: nextEntries.filter((item) => !item.isEliminated && !item.isWinner),
        };
      });
    });
    const disconnectResult = window.copilot.onRaffleResult((result) => {
      setSnapshot((current) => {
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
    if (!raffle) {
      setOverlayInfo(null);
      return;
    }
    void window.copilot.getRaffleOverlayInfo()
      .then(setOverlayInfo)
      .catch(() => setOverlayInfo(null));
  }, [raffle?.id]);

  useEffect(() => {
    if (!isModalOpen) return;
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }, [isModalOpen]);

  async function load(): Promise<void> {
    try {
      setError(null);
      const [rows, active, nextPlatformOptions, sounds] = await Promise.all([
        window.copilot.listRaffles(),
        window.copilot.getActiveRaffle(),
        getConfiguredPlatformOptions(),
        window.copilot.listRaffleSounds(),
      ]);
      setAvailableSounds(sounds);
      setRaffle(rows[0] ?? null);
      setPlatformOptions(nextPlatformOptions);
      setForm((current) => current.id ? current : createFormState(null, nextPlatformOptions));
      if (active) setSnapshot(await window.copilot.getRaffleSnapshot(active.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load raffles');
    }
  }

  function resetForm(): void {
    setForm(createFormState(null, platformOptions));
    setModalError(null);
  }

  function openCreate(): void {
    resetForm();
    setIsModalOpen(true);
  }

  function openEdit(r: Raffle): void {
    setForm(createFormState(r, platformOptions));
    setModalError(null);
    setIsModalOpen(true);
  }

  function closeModal(): void {
    setIsModalOpen(false);
    resetForm();
  }

  function updateForm<K extends keyof RaffleFormState>(key: K, value: RaffleFormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function togglePlatform(platformId: PlatformId): void {
    setForm((current) => ({
      ...current,
      acceptedPlatforms: current.acceptedPlatforms.includes(platformId)
        ? current.acceptedPlatforms.filter((id) => id !== platformId)
        : [...current.acceptedPlatforms, platformId],
    }));
  }

  async function save(): Promise<void> {
    if (!form.title.trim()) {
      setModalError('Title is required');
      return;
    }
    if (!form.entryCommand.trim()) {
      setModalError('Entry command is required');
      return;
    }
    if (!form.staffTriggerCommand.trim()) {
      setModalError('Staff trigger is required');
      return;
    }
    if (form.acceptedPlatforms.length === 0) {
      setModalError('Select at least one platform configured in Connections');
      return;
    }

    setIsSaving(true);
    setModalError(null);
    try {
      const payload: RaffleCreateInput = {
        title: form.title.trim(),
        entryCommand: form.entryCommand.trim(),
        mode: form.mode,
        entryDeadlineAt: form.deadlineInput ? new Date(form.deadlineInput).toISOString() : null,
        acceptedPlatforms: form.acceptedPlatforms,
        staffTriggerCommand: form.staffTriggerCommand.trim(),
        openAnnouncementTemplate: form.openAnnouncementTemplate.trim(),
        eliminationAnnouncementTemplate: form.eliminationAnnouncementTemplate.trim(),
        winnerAnnouncementTemplate: form.winnerAnnouncementTemplate.trim(),
        spinSoundFile: form.spinSoundFile || null,
        eliminatedSoundFile: form.eliminatedSoundFile || null,
        winnerSoundFile: form.winnerSoundFile || null,
        enabled: form.enabled,
      };

      const rows = form.id
        ? await window.copilot.updateRaffle({ ...payload, id: form.id } satisfies RaffleUpdateInput)
        : await window.copilot.createRaffle(payload);

      setRaffle(rows[0] ?? null);
      closeModal();
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : 'Failed to save raffle');
    } finally {
      setIsSaving(false);
    }
  }

  async function runAction(action: RaffleControlAction): Promise<void> {
    if (!raffle) return;
    if (!canRunAction(raffle.status, action)) return;
    setIsBusy(true);
    setError(null);
    try {
      const snap = await window.copilot.controlRaffle({ raffleId: raffle.id, action });
      setSnapshot(snap);
      const rows = await window.copilot.listRaffles();
      setRaffle(rows[0] ?? null);
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
    } catch {
      setCopyMessage('Clipboard unavailable');
    }
    window.setTimeout(() => setCopyMessage(null), 1800);
  }

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Raffle</h2>
          <button
            type="button"
            onClick={raffle ? () => openEdit(raffle) : openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors"
          >
            Edit Settings
          </button>
        </div>

        {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

        {raffle ? (
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4 flex items-center gap-4 mb-6">
            <div className="flex-1 min-w-0">
              <span className="text-gray-100 font-medium">{raffle.title}</span>
              <span className="ml-3 font-mono text-violet-300 text-sm">{raffle.entryCommand}</span>
              <span className="ml-3 text-gray-400 text-sm">{raffle.mode === 'single-winner' ? 'Single winner' : 'Survivor final'}</span>
              <div className="mt-1 flex gap-1 flex-wrap">
                {raffle.acceptedPlatforms.map((platform) => (
                  <span key={platform} className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">{platform}</span>
                ))}
              </div>
            </div>
            <span className="text-sm text-gray-400">{statusLabel(raffle.status)}</span>
          </div>
        ) : (
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4 mb-6">
            <p className="text-sm text-gray-500">No raffle configured yet. Click <strong className="text-gray-300">Edit Settings</strong> to set one up.</p>
          </div>
        )}

        {snapshot ? (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Status', value: statusLabel(snapshot.raffle.status) },
                { label: 'Entries', value: String(snapshot.raffle.entriesCount) },
                { label: 'Active', value: String(snapshot.raffle.activeEntriesCount) },
                { label: 'Round', value: String(snapshot.raffle.currentRound) },
              ].map((item) => (
                <div key={item.label} className="bg-gray-800/40 rounded-xl border border-gray-700 p-4">
                  <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">{item.label}</p>
                  <p className="text-xl text-gray-100 font-semibold">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-100">{snapshot.raffle.title}</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {snapshot.raffle.entryCommand} · {snapshot.raffle.mode === 'single-winner' ? 'Single winner' : 'Survivor final'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Deadline {formatDateTime(snapshot.raffle.entryDeadlineAt)} · Staff trigger {snapshot.raffle.staffTriggerCommand}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={isBusy || !canRunAction(currentStatus, 'open_entries')} onClick={() => void runAction('open_entries')} className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-emerald-600 text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-gray-700 disabled:hover:text-gray-300">Open</button>
                  <button type="button" disabled={isBusy || !canRunAction(currentStatus, 'close_entries')} onClick={() => void runAction('close_entries')} className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-sky-600 text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-gray-700 disabled:hover:text-gray-300">Close</button>
                  <button type="button" disabled={isBusy || !canRunAction(currentStatus, 'spin')} onClick={() => void runAction('spin')} className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-violet-600 text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-gray-700 disabled:hover:text-gray-300">Spin</button>
                  <button type="button" disabled={isBusy || !canRunAction(currentStatus, 'finalize')} onClick={() => void runAction('finalize')} className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-fuchsia-600 text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-gray-700 disabled:hover:text-gray-300">Finalize</button>
                  <button type="button" disabled={isBusy || !canRunAction(currentStatus, 'cancel')} onClick={() => void runAction('cancel')} className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-gray-700 disabled:hover:text-gray-300">Cancel</button>
                  <button type="button" disabled={isBusy || !canRunAction(currentStatus, 'reset')} onClick={() => void runAction('reset')} className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-40 disabled:hover:bg-gray-700">Reset</button>
                </div>
              </div>

              {snapshot.raffle.status === 'completed' && snapshot.raffle.winnerEntryId ? (() => {
                const winner = snapshot.entries.find((e) => e.id === snapshot.raffle.winnerEntryId);
                return winner ? (
                  <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-400/30">
                    <span className="text-yellow-400 font-bold text-sm">Winner</span>
                    <span className="text-yellow-100 font-semibold">{winner.displayName}</span>
                    <span className="text-yellow-400/60 text-xs">{winner.platform}</span>
                  </div>
                ) : null;
              })() : null}
              {topTwoEntries.length > 0 ? (
                <div className="mt-4 flex gap-2 flex-wrap">
                  {topTwoEntries.map((entry) => (
                    <span key={entry.id} className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                      Top 2 · {entry.displayName}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
              <div className="space-y-6">
                <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/60">
                    <h3 className="text-sm font-semibold">Participants</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 bg-gray-800/40">
                        {['Name', 'Platform', 'Entered', 'State'].map((heading) => (
                          <th key={heading} className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.entries.map((entry: RaffleEntry) => (
                        <tr key={entry.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                          <td className="px-4 py-3 text-gray-100">{entry.displayName}</td>
                          <td className="px-4 py-3 text-gray-400">{entry.platform}</td>
                          <td className="px-4 py-3 text-gray-400">{formatDateTime(entry.enteredAt)}</td>
                          <td className="px-4 py-3 text-gray-300">
                            {entry.isWinner
                              ? 'Winner'
                              : entry.isEliminated
                                ? `Eliminated #${entry.eliminationOrder ?? '—'}`
                                : snapshot.raffle.status === 'completed' && snapshot.raffle.mode === 'survivor-final'
                                  ? 'Runner-up'
                                  : 'Active'}
                          </td>
                        </tr>
                      ))}
                      {snapshot.entries.length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-sm text-gray-500" colSpan={4}>No entries yet.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/60">
                    <h3 className="text-sm font-semibold">Round History</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 bg-gray-800/40">
                        {['Round', 'Action', 'Result', 'Selected', 'Remaining'].map((heading) => (
                          <th key={heading} className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.history.map((item: RaffleRoundResult) => (
                        <tr key={item.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                          <td className="px-4 py-3 text-gray-100">#{item.roundNumber}</td>
                          <td className="px-4 py-3 text-gray-400">{item.actionType}</td>
                          <td className="px-4 py-3 text-gray-400">{item.resultType}</td>
                          <td className="px-4 py-3 text-gray-300">{item.selectedEntryName}</td>
                          <td className="px-4 py-3 text-gray-400">{item.participantCountAfter}</td>
                        </tr>
                      ))}
                      {snapshot.history.length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-sm text-gray-500" colSpan={5}>No rounds executed yet.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4">
                  <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">OBS Overlay</p>
                  <div className="flex gap-2">
                    <input
                      value={overlayInfo?.overlayUrl ?? ''}
                      readOnly
                      className="flex-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-300 px-3 py-2"
                    />
                    <button type="button" onClick={() => void copyOverlayUrl()} className="px-3 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm transition-colors">
                      Copy
                    </button>
                  </div>
                  {copyMessage ? <p className="text-xs text-violet-300 mt-2">{copyMessage}</p> : null}
                  <p className="text-xs text-gray-500 mt-3">
                    Add this URL to an OBS Browser Source. The wheel preview below uses the same source.
                  </p>
                </div>

                <div className="bg-gray-950 rounded-xl border border-gray-700 overflow-hidden">
                  {overlayInfo?.overlayUrl ? (
                    <iframe title="Raffle overlay preview" src={overlayInfo.overlayUrl} className="w-full h-[480px] bg-transparent" />
                  ) : (
                    <div className="h-[480px] grid place-items-center text-sm text-gray-500">Overlay preview unavailable.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
              <h3 className="font-semibold">{form.id ? 'Edit Raffle' : 'New Raffle'}</h3>
              <button type="button" onClick={closeModal} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  Title <span className="text-violet-400">*</span>
                </label>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={form.title}
                  onChange={(event) => updateForm('title', event.target.value)}
                  placeholder="Friday giveaway"
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">
                    Entry Command <span className="text-violet-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.entryCommand}
                    onChange={(event) => updateForm('entryCommand', event.target.value)}
                    placeholder="!join"
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">
                    Staff Trigger <span className="text-violet-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.staffTriggerCommand}
                    onChange={(event) => updateForm('staffTriggerCommand', event.target.value)}
                    placeholder="!roll"
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Mode</label>
                  <select
                    value={form.mode}
                    onChange={(event) => updateForm('mode', event.target.value as Raffle['mode'])}
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                  >
                    <option value="single-winner">Single winner</option>
                    <option value="survivor-final">Survivor final</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Entry Deadline</label>
                  <input
                    type="datetime-local"
                    value={form.deadlineInput}
                    onChange={(event) => updateForm('deadlineInput', event.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Accepted Platforms</label>
                {platformOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {platformOptions.map((platform) => {
                      const active = form.acceptedPlatforms.includes(platform.id);
                      return (
                        <button
                          key={platform.id}
                          type="button"
                          onClick={() => togglePlatform(platform.id)}
                          className={
                            active
                              ? 'px-3 py-1.5 rounded-full bg-violet-600 text-white text-xs font-medium'
                              : 'px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300 text-xs'
                          }
                        >
                          {platform.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-yellow-400">
                    No configurable platforms found yet. Configure Twitch or YouTube in Connections first.
                  </p>
                )}
                {platformOptions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {platformOptions.map((platform) => (
                      <span key={`${platform.id}-hint`} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">
                        {platform.label}: {platform.hint}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Open Announcement</label>
                <textarea
                  value={form.openAnnouncementTemplate}
                  onChange={(event) => updateForm('openAnnouncementTemplate', event.target.value)}
                  rows={2}
                  placeholder="Optional. Sent to chat when entries open."
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600"
                />
                <p className="text-xs text-gray-600 mt-1">Sent when the raffle opens. Placeholders: <code>{'{title}'}</code> and <code>{'{command}'}</code>.</p>
              </div>

              {form.mode === 'survivor-final' ? (
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Elimination Announcement</label>
                  <textarea
                    value={form.eliminationAnnouncementTemplate}
                    onChange={(event) => updateForm('eliminationAnnouncementTemplate', event.target.value)}
                    rows={2}
                    placeholder="Optional. Sent to chat when a participant is eliminated."
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600"
                  />
                  <p className="text-xs text-gray-600 mt-1">Placeholders: <code>{'{eliminated}'}</code> and <code>{'{title}'}</code>.</p>
                </div>
              ) : null}

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Winner Announcement</label>
                <textarea
                  value={form.winnerAnnouncementTemplate}
                  onChange={(event) => updateForm('winnerAnnouncementTemplate', event.target.value)}
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600"
                />
                <p className="text-xs text-gray-600 mt-1">Placeholders: <code>{'{winner}'}</code> and <code>{'{title}'}</code>.</p>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <p className="text-sm font-medium text-gray-300 mb-3">Sounds</p>
                <div className="space-y-3">
                  {(
                    [
                      { label: 'Spin sound', field: 'spinSoundFile' as const, event: 'spinning' as const },
                      { label: 'Elimination sound', field: 'eliminatedSoundFile' as const, event: 'eliminated' as const },
                      { label: 'Winner sound', field: 'winnerSoundFile' as const, event: 'winner' as const },
                    ] as const
                  ).map(({ label, field, event }) => (
                    <div key={field} className="flex items-center gap-2">
                      <label className="text-sm text-gray-400 w-36 shrink-0">{label}</label>
                      <select
                        value={form[field] ?? ''}
                        onChange={(e) => updateForm(field, e.target.value || null)}
                        className="flex-1 bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500"
                      >
                        <option value="">— none —</option>
                        {availableSounds[event].map((filename) => (
                          <option key={filename} value={filename}>{filename.replace(/\.[^.]+$/, '')}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!form[field]}
                        onClick={() => { if (form[field]) void window.copilot.previewRaffleSound(event, form[field]!); }}
                        title="Preview"
                        className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={form.enabled} onChange={(event) => updateForm('enabled', event.target.checked)} />
                Enabled
              </label>

              {modalError ? <p className="text-sm text-red-400">{modalError}</p> : null}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-700 shrink-0">
              <button type="button" onClick={closeModal} className="px-4 py-2 rounded bg-gray-700 text-sm text-gray-300 hover:bg-gray-600">
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void save()}
                className="px-4 py-2 rounded bg-violet-600 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
              >
                {isSaving ? 'Saving…' : form.id ? 'Save Raffle' : 'Create Raffle'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
