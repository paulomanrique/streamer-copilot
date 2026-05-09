import { useEffect, useMemo, useState } from 'react';

import type {
  PlatformId,
  Poll,
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

interface PollEditorModalProps {
  open: boolean;
  onClose: () => void;
  /** Existing poll being edited, or null to create a new one. */
  initialPoll: Poll | null;
  platformOptions: PlatformOption[];
  /** Active poll id, if any — used to disable "Save & start" while another poll is running. */
  activePollId: string | null;
  /** Called when the user submits. The page handles persistence/state updates. */
  onSubmit: (payload: PollUpsertInput, options: { startAfter: boolean }) => Promise<void>;
}

function emptyDraft(platformOptions: PlatformOption[]): PollDraft {
  return {
    title: '',
    options: [{ label: '' }, { label: '' }],
    durationSeconds: 60,
    acceptedPlatforms: platformOptions.map((o) => o.id),
    resultAnnouncementTemplate: DEFAULT_TEMPLATE,
  };
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

export function PollEditorModal({
  open,
  onClose,
  initialPoll,
  platformOptions,
  activePollId,
  onSubmit,
}: PollEditorModalProps) {
  const [draft, setDraft] = useState<PollDraft>(() =>
    initialPoll ? fromPoll(initialPoll) : emptyDraft(platformOptions),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-seed the draft whenever the modal opens with a different poll.
  useEffect(() => {
    if (!open) return;
    setDraft(initialPoll ? fromPoll(initialPoll) : emptyDraft(platformOptions));
    setError(null);
    setBusy(false);
  }, [open, initialPoll, platformOptions]);

  const editingExistingDraft = draft.id !== undefined;
  const startBlockedByOther = useMemo(
    () => activePollId !== null && activePollId !== draft.id,
    [activePollId, draft.id],
  );

  if (!open) return null;

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

  async function submit(options: { startAfter: boolean }): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const payload = toUpsert(draft);
      if (!payload.title) throw new Error('Title is required');
      if (payload.options.length < 2) throw new Error('At least 2 options with a label are required');
      if (payload.acceptedPlatforms.length === 0) {
        throw new Error(
          platformOptions.length === 0
            ? 'Configure at least one platform account in Connections before creating a poll.'
            : 'Pick at least one platform that will accept votes.',
        );
      }
      await onSubmit(payload, options);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save poll');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <h3 className="font-semibold text-white">{editingExistingDraft ? 'Edit poll' : 'New poll'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-gray-400">Title</span>
            <input
              type="text"
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              className="mt-1 w-full rounded border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-700"
              placeholder="What do you want to ask?"
              autoFocus
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

          {error ? (
            <div className="rounded border border-rose-800 bg-rose-950/40 text-rose-200 px-3 py-2 text-sm">{error}</div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t border-gray-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-sm text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit({ startAfter: false })}
            className="px-3 py-1.5 rounded border border-gray-700 text-gray-200 text-sm hover:bg-gray-800 disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            type="button"
            disabled={busy || startBlockedByOther}
            onClick={() => void submit({ startAfter: true })}
            className="px-4 py-1.5 rounded bg-purple-700 text-white text-sm hover:bg-purple-600 disabled:opacity-50"
            title={startBlockedByOther ? 'Close the active poll first' : ''}
          >
            {editingExistingDraft ? 'Save & start' : 'Create & start'}
          </button>
        </div>
      </div>
    </div>
  );
}
