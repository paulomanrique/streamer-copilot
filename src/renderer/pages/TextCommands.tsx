import { useEffect, useRef, useState } from 'react';

import { PERMISSION_LEVELS } from '../../shared/constants.js';
import type {
  PermissionLevel,
  TextCommand,
  TextSettings,
  ScheduledAvailableTargets,
  ScheduledStatusItem,
  TextCommandUpsertInput,
} from '../../shared/types.js';
import { ToggleSwitch } from '../components/ToggleSwitch.js';

const EMPTY_FORM: TextCommandUpsertInput = {
  trigger: '!',
  response: '',
  permissions: ['everyone'],
  cooldownSeconds: null,
  userCooldownSeconds: null,
  commandEnabled: true,
  schedule: null,
  enabled: true,
};

const DEFAULT_TEXT_SETTINGS: TextSettings = {
  defaultCooldownSeconds: 0,
  defaultUserCooldownSeconds: 0,
};

const SCHEDULE_PLATFORMS: { id: 'twitch' | 'youtube'; label: string }[] = [
  { id: 'twitch', label: 'Twitch' },
  { id: 'youtube', label: 'YouTube (H/V)' },
];

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  everyone: 'Everyone',
  follower: 'Followers',
  subscriber: 'Subscribers',
  vip: 'VIP',
  moderator: 'Moderators',
  broadcaster: 'Broadcaster',
};

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function TextCommandsPage() {
  const triggerInputRef = useRef<HTMLInputElement | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rows, setRows] = useState<TextCommand[]>([]);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [trigger, setTrigger] = useState(EMPTY_FORM.trigger);
  const [response, setResponse] = useState(EMPTY_FORM.response);
  const [levels, setLevels] = useState<PermissionLevel[]>(EMPTY_FORM.permissions);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [userCooldownSeconds, setUserCooldownSeconds] = useState(0);
  const [useGlobalCooldown, setUseGlobalCooldown] = useState(true);
  const [commandEnabled, setCommandEnabled] = useState(EMPTY_FORM.commandEnabled);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleIntervalMinutes, setScheduleIntervalMinutes] = useState(15);
  const [scheduleRandomWindowMinutes, setScheduleRandomWindowMinutes] = useState(0);
  const [schedulePlatforms, setSchedulePlatforms] = useState<('twitch' | 'youtube')[]>(['twitch', 'youtube']);
  const [enabled, setEnabled] = useState(EMPTY_FORM.enabled);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [occupiedTriggers, setOccupiedTriggers] = useState<Set<string>>(new Set());
  const [statusById, setStatusById] = useState<Record<string, ScheduledStatusItem>>({});
  const [availableTargets, setAvailableTargets] = useState<ScheduledAvailableTargets>({ supported: ['twitch', 'youtube'], connected: [] });

  // Global text settings
  const [textSettings, setTextSettings] = useState<TextSettings>(DEFAULT_TEXT_SETTINGS);
  const [draftSettings, setDraftSettings] = useState<TextSettings>(DEFAULT_TEXT_SETTINGS);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [commands, settings] = await Promise.all([
          window.copilot.listTextCommands(),
          window.copilot.getTextSettings(),
        ]);
        setRows(commands);
        setTextSettings(settings);
        setDraftSettings(settings);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to load text commands');
      }
    };

    void load();

    const disconnect = window.copilot.onScheduledStatus((items) => {
      const next: Record<string, ScheduledStatusItem> = {};
      for (const item of items) next[item.id] = item;
      setStatusById(next);
    });
    void window.copilot.getScheduledAvailableTargets().then(setAvailableTargets).catch(() => null);

    return () => disconnect();
  }, []);

  useEffect(() => {
    const loadOccupiedTriggers = async () => {
      try {
        const [sounds, voices, texts] = await Promise.all([
          window.copilot.listSoundCommands(),
          window.copilot.listVoiceCommands(),
          window.copilot.listTextCommands(),
        ]);
        const skipId = draftId;
        const occupied = new Set<string>([
          ...sounds.map((item) => item.trigger?.toLowerCase()).filter((item): item is string => Boolean(item)),
          ...voices.map((item) => item.trigger.toLowerCase()),
          ...texts
            .filter((item) => item.id !== skipId)
            .map((item) => item.trigger?.toLowerCase())
            .filter((item): item is string => Boolean(item)),
        ]);
        setOccupiedTriggers(occupied);
      } catch {
        // non-critical
      }
    };

    void loadOccupiedTriggers();
  }, [draftId, isModalOpen, rows]);

  const saveSettings = async () => {
    setSettingsBusy(true);
    setSettingsError(null);
    setSettingsSaved(false);
    try {
      const saved = await window.copilot.saveTextSettings(draftSettings);
      setTextSettings(saved);
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
    draftSettings.defaultCooldownSeconds !== textSettings.defaultCooldownSeconds ||
    draftSettings.defaultUserCooldownSeconds !== textSettings.defaultUserCooldownSeconds;

  const validateTrigger = (value: string): string | null => {
    if (!commandEnabled) return null;
    const normalized = value.trim();
    if (!normalized.startsWith('!')) return 'Command must start with !';
    if (normalized.length < 2) return 'Command must have at least one character after !';
    if (occupiedTriggers.has(normalized.toLowerCase())) return 'This trigger is already used by another command';
    return null;
  };

  const resetForm = () => {
    setDraftId(undefined);
    setTrigger(EMPTY_FORM.trigger);
    setResponse(EMPTY_FORM.response);
    setLevels(EMPTY_FORM.permissions);
    setCooldownSeconds(textSettings.defaultCooldownSeconds);
    setUserCooldownSeconds(textSettings.defaultUserCooldownSeconds);
    setUseGlobalCooldown(true);
    setCommandEnabled(EMPTY_FORM.commandEnabled);
    setScheduleEnabled(false);
    setScheduleIntervalMinutes(15);
    setScheduleRandomWindowMinutes(0);
    setSchedulePlatforms(['twitch', 'youtube']);
    setEnabled(EMPTY_FORM.enabled);
    setError(null);
    setTriggerError(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
    requestAnimationFrame(() => triggerInputRef.current?.focus());
  };

  const openEdit = (command: TextCommand) => {
    const isGlobal = command.cooldownSeconds === null && command.userCooldownSeconds === null;
    setDraftId(command.id);
    setTrigger(command.trigger ?? '!');
    setResponse(command.response);
    setLevels(command.permissions);
    setUseGlobalCooldown(isGlobal);
    setCooldownSeconds(command.cooldownSeconds ?? textSettings.defaultCooldownSeconds);
    setUserCooldownSeconds(command.userCooldownSeconds ?? textSettings.defaultUserCooldownSeconds);
    setCommandEnabled(command.commandEnabled);
    setScheduleEnabled(Boolean(command.schedule?.enabled));
    setScheduleIntervalMinutes(Math.round((command.schedule?.intervalSeconds ?? 900) / 60));
    setScheduleRandomWindowMinutes(Math.round((command.schedule?.randomWindowSeconds ?? 0) / 60));
    setSchedulePlatforms((command.schedule?.targetPlatforms.filter((item) => item === 'twitch' || item === 'youtube') as ('twitch' | 'youtube')[] | undefined) ?? ['twitch', 'youtube']);
    setEnabled(command.enabled);
    setError(null);
    setTriggerError(null);
    setIsModalOpen(true);
  };

  const saveCommand = async () => {
    const nextError = validateTrigger(trigger ?? '');
    if (nextError) {
      setTriggerError(nextError);
      triggerInputRef.current?.focus();
      return;
    }

    if (!response.trim()) {
      setError('Response text is required');
      return;
    }
    if (!commandEnabled && !scheduleEnabled) {
      setError('Enable command trigger or schedule');
      return;
    }
    if (scheduleEnabled && schedulePlatforms.length === 0) {
      setError('Select at least one schedule target');
      return;
    }
    if (scheduleEnabled && scheduleIntervalMinutes < 1) {
      setError('Schedule interval must be at least 1 minute');
      return;
    }

    setIsBusy(true);

    try {
      const commands = await window.copilot.upsertTextCommand({
        id: draftId,
        trigger: commandEnabled ? trigger?.trim() ?? null : null,
        response: response.trim(),
        permissions: levels,
        cooldownSeconds: useGlobalCooldown ? null : cooldownSeconds,
        userCooldownSeconds: useGlobalCooldown ? null : userCooldownSeconds,
        commandEnabled,
        schedule: scheduleEnabled
          ? {
              intervalSeconds: scheduleIntervalMinutes * 60,
              randomWindowSeconds: scheduleRandomWindowMinutes * 60,
              targetPlatforms: schedulePlatforms,
              enabled: true,
            }
          : null,
        enabled,
      });
      setRows(commands);
      setIsModalOpen(false);
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save text command');
    } finally {
      setIsBusy(false);
    }
  };

  const toggleEnabled = async (row: TextCommand) => {
    try {
      const commands = await window.copilot.upsertTextCommand({
        id: row.id,
        trigger: row.trigger,
        response: row.response,
        permissions: row.permissions,
        cooldownSeconds: row.cooldownSeconds,
        userCooldownSeconds: row.userCooldownSeconds,
        commandEnabled: row.commandEnabled,
        schedule: row.schedule ? {
          intervalSeconds: row.schedule.intervalSeconds,
          randomWindowSeconds: row.schedule.randomWindowSeconds,
          targetPlatforms: row.schedule.targetPlatforms,
          enabled: row.schedule.enabled,
        } : null,
        enabled: !row.enabled,
      });
      setRows(commands);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to update command');
    }
  };

  const deleteCommand = async (id: string) => {
    try {
      const commands = await window.copilot.deleteTextCommand({ id });
      setRows(commands);
      if (draftId === id) {
        setIsModalOpen(false);
        resetForm();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete text command');
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

  const toggleSchedulePlatform = (platform: 'twitch' | 'youtube') => {
    setSchedulePlatforms((current) => (
      current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]
    ));
  };

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Text Commands</h2>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
          >
            + New Command
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Configure chat triggers that automatically reply with text. Example:{' '}
          <code className="text-violet-300 text-xs bg-gray-800 px-1 py-0.5 rounded">!site</code>
        </p>

        {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

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
            These defaults apply to all text commands that use the global cooldown setting.
          </p>
        </div>

        <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/60">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Modes</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Response</th>
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
                  <td className="px-4 py-3 text-gray-300 max-w-xl truncate">{row.response}</td>
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
                      <span>{Math.round(row.schedule.intervalSeconds / 60)} min · next {formatTime(statusById[`text:${row.id}`]?.nextFireAt ?? null)}</span>
                    ) : row.cooldownSeconds === null && row.userCooldownSeconds === null ? (
                      <span className="text-gray-500">Global default</span>
                    ) : (
                      <span>{row.cooldownSeconds ?? 0}s / {row.userCooldownSeconds ?? 0}s per user</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ToggleSwitch checked={row.enabled} onChange={() => void toggleEnabled(row)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
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
                  <td className="px-4 py-4 text-sm text-gray-500" colSpan={6}>No text commands saved yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <h3 className="font-semibold">{draftId ? 'Edit Text Command' : 'New Text Command'}</h3>
              <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  Command trigger
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-2">
                  <input type="checkbox" checked={commandEnabled} onChange={(event) => {
                    setCommandEnabled(event.target.checked);
                    if (!event.target.checked) setTriggerError(null);
                  }} className="accent-violet-500" />
                  Respond when chat sends this command
                </label>
                <input
                  ref={triggerInputRef}
                  type="text"
                  value={trigger ?? ''}
                  disabled={!commandEnabled}
                  onChange={(event) => {
                    setTrigger(event.target.value);
                    setTriggerError(validateTrigger(event.target.value));
                  }}
                  placeholder="!site"
                  className={`w-full bg-gray-800 border rounded text-sm text-gray-300 px-3 py-2 focus:outline-none font-mono disabled:opacity-50 ${
                    triggerError ? 'border-red-500 focus:border-red-400' : 'border-gray-600 focus:border-violet-500'
                  }`}
                />
                {triggerError ? <p className="mt-1.5 text-xs text-red-400">{triggerError}</p> : null}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  Response <span className="text-violet-400">*</span>
                </label>
                <textarea
                  rows={4}
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  placeholder="https://www.example.com"
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600 resize-none"
                />
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
                        setCooldownSeconds(textSettings.defaultCooldownSeconds);
                        setUserCooldownSeconds(textSettings.defaultUserCooldownSeconds);
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
                      max="3600"
                      value={useGlobalCooldown ? textSettings.defaultCooldownSeconds : cooldownSeconds}
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
                      max="3600"
                      value={useGlobalCooldown ? textSettings.defaultUserCooldownSeconds : userCooldownSeconds}
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
                  Send this response on a schedule
                </label>
                {scheduleEnabled ? (
                  <>
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
                    <div className="space-y-2">
                      <p className="text-sm text-gray-400">Targets</p>
                      {SCHEDULE_PLATFORMS.map(({ id, label }) => {
                        const connected = availableTargets.connected.includes(id);
                        return (
                          <label key={id} className="flex items-center justify-between text-sm text-gray-300">
                            <span>{label}</span>
                            <span className="flex items-center gap-2">
                              {!connected ? <span className="text-[11px] text-yellow-500">Disconnected</span> : null}
                              <input
                                type="checkbox"
                                checked={schedulePlatforms.includes(id)}
                                onChange={() => toggleSchedulePlatform(id)}
                                className="accent-violet-500"
                              />
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="accent-violet-500" />
                Active
              </label>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="flex-1 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors"
              >
                Cancel
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
