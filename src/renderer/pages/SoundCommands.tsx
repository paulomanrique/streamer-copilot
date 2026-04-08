import { useEffect, useState } from 'react';

import { PERMISSION_LEVELS } from '../../shared/constants.js';
import type { PermissionLevel, SoundCommand, SoundCommandUpsertInput } from '../../shared/types.js';

const EMPTY_FORM: SoundCommandUpsertInput = {
  trigger: '!drumroll',
  filePath: '',
  permissions: ['everyone'],
  cooldownSeconds: 0,
  enabled: true,
};

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  everyone: 'Everyone',
  follower: 'Followers',
  subscriber: 'Subscribers',
  moderator: 'Moderators',
  broadcaster: 'Broadcaster',
};

function getFileName(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  return segments[segments.length - 1] || filePath;
}

export function SoundCommandsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [levels, setLevels] = useState<PermissionLevel[]>(EMPTY_FORM.permissions);
  const [rows, setRows] = useState<SoundCommand[]>([]);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [trigger, setTrigger] = useState(EMPTY_FORM.trigger);
  const [filePath, setFilePath] = useState(EMPTY_FORM.filePath);
  const [cooldownSeconds, setCooldownSeconds] = useState(EMPTY_FORM.cooldownSeconds);
  const [userCooldownSeconds, setUserCooldownSeconds] = useState(30);
  const [enabled, setEnabled] = useState(EMPTY_FORM.enabled);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const commands = await window.copilot.listSoundCommands();
        setRows(commands);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to load sound commands');
      }
    };

    void load();
  }, []);

  const resetForm = () => {
    setDraftId(undefined);
    setTrigger(EMPTY_FORM.trigger);
    setFilePath(EMPTY_FORM.filePath);
    setLevels(EMPTY_FORM.permissions);
    setCooldownSeconds(EMPTY_FORM.cooldownSeconds);
    setUserCooldownSeconds(30);
    setEnabled(EMPTY_FORM.enabled);
    setError(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (command: SoundCommand) => {
    setDraftId(command.id);
    setTrigger(command.trigger);
    setFilePath(command.filePath);
    setLevels(command.permissions);
    setCooldownSeconds(command.cooldownSeconds);
    setUserCooldownSeconds(Math.max(command.cooldownSeconds, 5));
    setEnabled(command.enabled);
    setError(null);
    setIsModalOpen(true);
  };

  const saveCommand = async () => {
    setIsBusy(true);

    try {
      const commands = await window.copilot.upsertSoundCommand({
        id: draftId,
        trigger: trigger.trim(),
        filePath,
        permissions: levels,
        cooldownSeconds,
        enabled,
      });
      setRows(commands);
      setIsModalOpen(false);
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save sound command');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteCommand = async (id: string) => {
    try {
      const commands = await window.copilot.deleteSoundCommand({ id });
      setRows(commands);
      if (draftId === id) {
        setIsModalOpen(false);
        resetForm();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete sound command');
    }
  };

  const pickSoundFile = async () => {
    try {
      const selectedPath = await window.copilot.pickSoundFile();
      if (selectedPath) setFilePath(selectedPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to pick sound file');
    }
  };

  const previewCommand = async (targetPath?: string) => {
    const nextPath = targetPath ?? filePath;
    if (!nextPath) {
      setError('Pick a sound file before previewing');
      return;
    }

    try {
      await window.copilot.previewSoundPlay({ filePath: nextPath });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to preview sound command');
    }
  };

  const toggleLevel = (level: PermissionLevel) => {
    if (levels.includes(level)) {
      const nextLevels = levels.filter((item) => item !== level);
      setLevels(nextLevels.length > 0 ? nextLevels : ['everyone']);
      return;
    }

    setLevels([...levels, level]);
  };

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Sound Commands</h2>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
          >
            + New Command
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Configure chat triggers that play copied audio files. Example:{' '}
          <code className="text-violet-300 text-xs bg-gray-800 px-1 py-0.5 rounded">!cat</code>
        </p>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">File Picker</p>
            <p className="text-sm text-gray-300">Import `.mp3`, `.ogg`, or `.wav` and copy the asset into the app sounds folder.</p>
          </div>
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Permissions</p>
            <p className="text-sm text-gray-300">Use compact permission chips to define exactly who can trigger the command.</p>
          </div>
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Test Action</p>
            <p className="text-sm text-gray-300">Preview playback from the table before going live.</p>
          </div>
        </div>

        <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/60">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Command</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">File</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Permissions</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Cooldown</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Active</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-800/80 last:border-b-0">
                  <td className="px-4 py-3 text-gray-300 font-mono">{row.trigger}</td>
                  <td className="px-4 py-3 text-gray-300">{getFileName(row.filePath)}</td>
                  <td className="px-4 py-3 text-gray-300">{row.permissions.map((level) => PERMISSION_LABELS[level]).join(', ')}</td>
                  <td className="px-4 py-3 text-gray-300">{row.cooldownSeconds}s</td>
                  <td className="px-4 py-3 text-gray-300">{row.enabled ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => void previewCommand(row.filePath)}
                        className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors"
                      >
                        Test
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteCommand(row.id)}
                        className="px-3 py-1.5 rounded bg-red-500/15 hover:bg-red-500/25 text-red-300 text-sm transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-gray-500" colSpan={6}>No sound commands saved yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <h3 className="font-semibold">{draftId ? 'Edit Sound Command' : 'New Sound Command'}</h3>
              <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  Command <span className="text-violet-400">*</span>
                </label>
                <input
                  type="text"
                  value={trigger}
                  onChange={(event) => setTrigger(event.target.value)}
                  placeholder="!cat"
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  Audio File <span className="text-violet-400">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={filePath}
                    readOnly
                    placeholder="no file selected yet"
                    className="flex-1 bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600"
                  />
                  <button
                    type="button"
                    onClick={() => void pickSoundFile()}
                    className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors whitespace-nowrap"
                  >
                    Choose file...
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Supported formats: MP3, OGG, WAV. The imported file is copied into the profile assets folder.
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Permissions</label>
                <div className="flex flex-wrap gap-2">
                  {PERMISSION_LEVELS.map((level) => {
                    const active = levels.includes(level);
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => toggleLevel(level)}
                        className={
                          active
                            ? 'px-3 py-1.5 rounded-full bg-violet-600 text-white text-xs font-medium'
                            : 'px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300 text-xs'
                        }
                      >
                        {PERMISSION_LABELS[level]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Cooldown Global (s)</label>
                  <input
                    type="number"
                    min="0"
                    value={cooldownSeconds}
                    onChange={(event) => setCooldownSeconds(Number(event.target.value))}
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Per-user Cooldown (s)</label>
                  <input
                    type="number"
                    min="0"
                    value={userCooldownSeconds}
                    onChange={(event) => setUserCooldownSeconds(Number(event.target.value))}
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="accent-violet-500" />
                Active command
              </label>
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-gray-700">
              <button
                type="button"
                onClick={() => { setIsModalOpen(false); resetForm(); }}
                className="flex-1 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void previewCommand()}
                className="flex-1 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors"
              >
                Test
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void saveCommand()}
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
