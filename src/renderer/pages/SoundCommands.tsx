import { useEffect, useRef, useState } from 'react';

import { PERMISSION_LEVELS } from '../../shared/constants.js';
import type { PermissionLevel, ScheduledStatusItem, SoundCommand, SoundCommandUpsertInput, SoundSettings } from '../../shared/types.js';

const EMPTY_FORM: SoundCommandUpsertInput = {
  trigger: '!',
  filePath: '',
  permissions: ['everyone'],
  cooldownSeconds: null,
  userCooldownSeconds: null,
  commandEnabled: true,
  schedule: null,
  enabled: true,
};

const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  defaultCooldownSeconds: 0,
  defaultUserCooldownSeconds: 0,
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

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SoundCommandsPage() {
  const triggerInputRef = useRef<HTMLInputElement | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [levels, setLevels] = useState<PermissionLevel[]>(EMPTY_FORM.permissions);
  const [rows, setRows] = useState<SoundCommand[]>([]);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [trigger, setTrigger] = useState(EMPTY_FORM.trigger);
  const [filePath, setFilePath] = useState(EMPTY_FORM.filePath);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [userCooldownSeconds, setUserCooldownSeconds] = useState(0);
  const [useGlobalCooldown, setUseGlobalCooldown] = useState(true);
  const [commandEnabled, setCommandEnabled] = useState(EMPTY_FORM.commandEnabled);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleIntervalMinutes, setScheduleIntervalMinutes] = useState(15);
  const [scheduleRandomWindowMinutes, setScheduleRandomWindowMinutes] = useState(0);
  const [enabled, setEnabled] = useState(EMPTY_FORM.enabled);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusById, setStatusById] = useState<Record<string, ScheduledStatusItem>>({});

  // Global sound settings
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(DEFAULT_SOUND_SETTINGS);
  const [draftSettings, setDraftSettings] = useState<SoundSettings>(DEFAULT_SOUND_SETTINGS);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [commands, settings] = await Promise.all([
          window.copilot.listSoundCommands(),
          window.copilot.getSoundSettings(),
        ]);
        setRows(commands);
        setSoundSettings(settings);
        setDraftSettings(settings);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to load sound commands');
      }
    };

    void load();

    const disconnect = window.copilot.onScheduledStatus((items) => {
      const next: Record<string, ScheduledStatusItem> = {};
      for (const item of items) next[item.id] = item;
      setStatusById(next);
    });

    return () => disconnect();
  }, []);

  const saveSettings = async () => {
    setSettingsBusy(true);
    setSettingsError(null);
    setSettingsSaved(false);
    try {
      const saved = await window.copilot.saveSoundSettings(draftSettings);
      setSoundSettings(saved);
      setDraftSettings(saved);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : 'Failed to save settings');
    } finally {
      setSettingsBusy(false);
    }
  };

  const settingsDirty =
    draftSettings.defaultCooldownSeconds !== soundSettings.defaultCooldownSeconds ||
    draftSettings.defaultUserCooldownSeconds !== soundSettings.defaultUserCooldownSeconds;

  const resetForm = () => {
    setDraftId(undefined);
    setTrigger(EMPTY_FORM.trigger);
    setFilePath(EMPTY_FORM.filePath);
    setLevels(EMPTY_FORM.permissions);
    setCooldownSeconds(soundSettings.defaultCooldownSeconds);
    setUserCooldownSeconds(soundSettings.defaultUserCooldownSeconds);
    setUseGlobalCooldown(true);
    setCommandEnabled(EMPTY_FORM.commandEnabled);
    setScheduleEnabled(false);
    setScheduleIntervalMinutes(15);
    setScheduleRandomWindowMinutes(0);
    setEnabled(EMPTY_FORM.enabled);
    setError(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
    requestAnimationFrame(() => triggerInputRef.current?.focus());
  };

  const openEdit = (command: SoundCommand) => {
    const isGlobal = command.cooldownSeconds === null && command.userCooldownSeconds === null;
    setDraftId(command.id);
    setTrigger(command.trigger ?? '!');
    setFilePath(command.filePath);
    setLevels(command.permissions);
    setUseGlobalCooldown(isGlobal);
    setCooldownSeconds(command.cooldownSeconds ?? soundSettings.defaultCooldownSeconds);
    setUserCooldownSeconds(command.userCooldownSeconds ?? soundSettings.defaultUserCooldownSeconds);
    setCommandEnabled(command.commandEnabled);
    setScheduleEnabled(Boolean(command.schedule?.enabled));
    setScheduleIntervalMinutes(Math.round((command.schedule?.intervalSeconds ?? 900) / 60));
    setScheduleRandomWindowMinutes(Math.round((command.schedule?.randomWindowSeconds ?? 0) / 60));
    setEnabled(command.enabled);
    setError(null);
    setIsModalOpen(true);
  };

  const saveCommand = async () => {
    if (!commandEnabled && !scheduleEnabled) {
      setError('Enable command trigger or schedule');
      return;
    }
    if (commandEnabled) {
      const normalizedTrigger = trigger?.trim() ?? '';
      if (!normalizedTrigger.startsWith('!') || normalizedTrigger.length < 2) {
        setError('Command must start with ! and include a trigger name');
        return;
      }
    }
    if (scheduleEnabled && scheduleIntervalMinutes < 1) {
      setError('Schedule interval must be at least 1 minute');
      return;
    }
    if (!filePath) {
      setError('Pick a sound file before saving');
      return;
    }
    setIsBusy(true);

    try {
      const commands = await window.copilot.upsertSoundCommand({
        id: draftId,
        trigger: commandEnabled ? trigger?.trim() ?? null : null,
        filePath,
        permissions: levels,
        cooldownSeconds: useGlobalCooldown ? null : cooldownSeconds,
        userCooldownSeconds: useGlobalCooldown ? null : userCooldownSeconds,
        commandEnabled,
        schedule: scheduleEnabled
          ? {
              intervalSeconds: scheduleIntervalMinutes * 60,
              randomWindowSeconds: scheduleRandomWindowMinutes * 60,
              targetPlatforms: [],
              enabled: true,
            }
          : null,
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
      await window.copilot.previewPlay({ filePath: nextPath });
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Sound Commands</h2>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
          >
            + New Command
          </button>
        </div>

        {/* Global cooldown settings */}
        <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Default Cooldown Settings</h3>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Global Cooldown (s)</label>
              <input
                type="number"
                min="0"
                value={draftSettings.defaultCooldownSeconds}
                onChange={(e) => setDraftSettings({ ...draftSettings, defaultCooldownSeconds: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Per-user Cooldown (s)</label>
              <input
                type="number"
                min="0"
                value={draftSettings.defaultUserCooldownSeconds}
                onChange={(e) => setDraftSettings({ ...draftSettings, defaultUserCooldownSeconds: Number(e.target.value) })}
                className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              disabled={!settingsDirty || settingsBusy}
              onClick={() => void saveSettings()}
              className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-xs font-medium transition-colors disabled:opacity-50"
            >
              Save
            </button>
            {settingsSaved ? <span className="text-xs text-green-400">Saved</span> : null}
            {settingsError ? <span className="text-xs text-red-300">{settingsError}</span> : null}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            These defaults apply to all sounds that use the global cooldown setting.
          </p>
        </div>

        <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/60">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Modes</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">File</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Permissions</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Cooldown</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Active</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {row.commandEnabled && row.trigger ? <span className="font-mono text-violet-300">{row.trigger}</span> : null}
                      {row.schedule?.enabled ? <span className="text-xs text-cyan-300">Scheduled</span> : null}
                      {!row.commandEnabled && !row.schedule?.enabled ? <span className="text-xs text-gray-500">No mode</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{getFileName(row.filePath)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {row.permissions.map((level) => (
                        <span key={level} className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                          {level}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {row.schedule?.enabled ? (
                      <span>{Math.round(row.schedule.intervalSeconds / 60)} min · next {formatTime(statusById[`sound:${row.id}`]?.nextFireAt ?? null)}</span>
                    ) : row.cooldownSeconds === null && row.userCooldownSeconds === null ? (
                      <span className="text-gray-500">Global default</span>
                    ) : (
                      <span>{row.cooldownSeconds ?? 0}s / {row.userCooldownSeconds ?? 0}s per user</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <label className="toggle-switch">
                      <input type="checkbox" checked={row.enabled} readOnly />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void previewCommand(row.filePath)}
                        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-violet-600 text-gray-300 hover:text-white transition-colors"
                      >
                        ▶ Test
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteCommand(row.id)}
                        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white transition-colors"
                      >
                        🗑️
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
                  Command trigger
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-2">
                  <input type="checkbox" checked={commandEnabled} onChange={(event) => setCommandEnabled(event.target.checked)} className="accent-violet-500" />
                  Play when chat sends this command
                </label>
                <input
                  ref={triggerInputRef}
                  type="text"
                  value={trigger}
                  disabled={!commandEnabled}
                  onChange={(event) => setTrigger(event.target.value)}
                  placeholder="!cat"
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600 font-mono disabled:opacity-50"
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
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={useGlobalCooldown}
                    disabled={!commandEnabled}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setUseGlobalCooldown(checked);
                      if (checked) {
                        setCooldownSeconds(soundSettings.defaultCooldownSeconds);
                        setUserCooldownSeconds(soundSettings.defaultUserCooldownSeconds);
                      }
                    }}
                    className="accent-violet-500"
                  />
                  Use global cooldown defaults
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Global Cooldown (s)</label>
                    <input
                      type="number"
                      min="0"
                      value={useGlobalCooldown ? soundSettings.defaultCooldownSeconds : cooldownSeconds}
                      disabled={!commandEnabled || useGlobalCooldown}
                      onChange={(event) => setCooldownSeconds(Number(event.target.value))}
                      className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Per-user Cooldown (s)</label>
                    <input
                      type="number"
                      min="0"
                      value={useGlobalCooldown ? soundSettings.defaultUserCooldownSeconds : userCooldownSeconds}
                      disabled={!commandEnabled || useGlobalCooldown}
                      onChange={(event) => setUserCooldownSeconds(Number(event.target.value))}
                      className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} className="accent-violet-500" />
                  Play this sound on a schedule
                </label>
                {scheduleEnabled ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1.5">Interval (min)</label>
                      <input
                        type="number"
                        min="1"
                        value={scheduleIntervalMinutes}
                        onChange={(event) => setScheduleIntervalMinutes(Number(event.target.value))}
                        className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1.5">Random Window (min)</label>
                      <input
                        type="number"
                        min="0"
                        value={scheduleRandomWindowMinutes}
                        onChange={(event) => setScheduleRandomWindowMinutes(Number(event.target.value))}
                        className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="accent-violet-500" />
                Active
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
