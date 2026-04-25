import { useEffect, useState } from 'react';

import type { ScheduledStatusItem, SoundCommand, SoundCommandUpsertInput, SoundSettings } from '../../shared/types.js';
import { SoundCommandModal } from '../components/SoundCommandModal.js';
import { ToggleSwitch } from '../components/ToggleSwitch.js';

const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  defaultCooldownSeconds: 0,
  defaultUserCooldownSeconds: 0,
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SoundCommand | null>(null);
  const [rows, setRows] = useState<SoundCommand[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusById, setStatusById] = useState<Record<string, ScheduledStatusItem>>({});

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

  const openCreate = () => {
    setEditTarget(null);
    setIsModalOpen(true);
  };

  const openEdit = (command: SoundCommand) => {
    setEditTarget(command);
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditTarget(null);
  };

  const handleSave = async (data: SoundCommandUpsertInput) => {
    const commands = await window.copilot.upsertSoundCommand(data);
    setRows(commands);
    setIsModalOpen(false);
    setEditTarget(null);
  };

  const toggleEnabled = async (row: SoundCommand) => {
    try {
      const commands = await window.copilot.upsertSoundCommand({
        id: row.id,
        name: row.name ?? '',
        trigger: row.trigger,
        filePath: row.filePath,
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
      const commands = await window.copilot.deleteSoundCommand({ id });
      setRows(commands);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete sound command');
    }
  };

  const previewSound = async (filePath: string) => {
    try {
      await window.copilot.previewPlay({ filePath });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to preview sound');
    }
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

        {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

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
                <tr key={row.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-200">{row.name || getFileName(row.filePath)}</p>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {row.commandEnabled && row.trigger ? <span className="font-mono text-xs text-violet-300">{row.trigger}</span> : null}
                      {row.schedule?.enabled ? <span className="text-xs text-cyan-400">Scheduled · every {Math.round(row.schedule.intervalSeconds / 60)} min · next {formatTime(statusById[`sound:${row.id}`]?.nextFireAt ?? null)}</span> : null}
                      {!row.commandEnabled && !row.schedule?.enabled ? <span className="text-xs text-gray-500">No trigger</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{getFileName(row.filePath)}</td>
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
                    {row.cooldownSeconds === null && row.userCooldownSeconds === null ? (
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
                        onClick={() => void previewSound(row.filePath)}
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

      <SoundCommandModal
        open={isModalOpen}
        onClose={handleClose}
        onSave={handleSave}
        initialData={editTarget}
        settings={soundSettings}
      />
    </>
  );
}
