import { useEffect, useState } from 'react';

import type {
  ScheduledAvailableTargets,
  ScheduledStatusItem,
  TextCommand,
  TextCommandUpsertInput,
  TextSettings,
} from '../../shared/types.js';
import { TextCommandModal } from '../components/TextCommandModal.js';
import { ToggleSwitch } from '../components/ToggleSwitch.js';

const DEFAULT_TEXT_SETTINGS: TextSettings = {
  defaultCooldownSeconds: 0,
  defaultUserCooldownSeconds: 0,
};

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function TextCommandsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TextCommand | null>(null);
  const [rows, setRows] = useState<TextCommand[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [occupiedTriggers, setOccupiedTriggers] = useState<Set<string>>(new Set());
  const [statusById, setStatusById] = useState<Record<string, ScheduledStatusItem>>({});
  const [availableTargets, setAvailableTargets] = useState<ScheduledAvailableTargets>({ supported: ['twitch', 'youtube'], connected: [] });

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
        const skipId = editTarget?.id;
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
  }, [editTarget, isModalOpen, rows]);

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

  const openCreate = () => {
    setEditTarget(null);
    setIsModalOpen(true);
  };

  const openEdit = (command: TextCommand) => {
    setEditTarget(command);
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditTarget(null);
  };

  const handleSave = async (data: TextCommandUpsertInput) => {
    const commands = await window.copilot.upsertTextCommand(data);
    setRows(commands);
    setIsModalOpen(false);
    setEditTarget(null);
  };

  const toggleEnabled = async (row: TextCommand) => {
    try {
      const commands = await window.copilot.upsertTextCommand({
        id: row.id,
        name: row.name ?? '',
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete text command');
    }
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
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Command</th>
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
                    <p className="font-medium text-gray-200">{row.name || row.response.slice(0, 24)}</p>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {row.commandEnabled && row.trigger ? <span className="font-mono text-xs text-violet-300">{row.trigger}</span> : null}
                      {row.schedule?.enabled ? <span className="text-xs text-cyan-400">Scheduled · every {Math.round(row.schedule.intervalSeconds / 60)} min · next {formatTime(statusById[`text:${row.id}`]?.nextFireAt ?? null)}</span> : null}
                      {!row.commandEnabled && !row.schedule?.enabled ? <span className="text-xs text-gray-500">No trigger</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{row.response}</td>
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

      <TextCommandModal
        open={isModalOpen}
        onClose={handleClose}
        onSave={handleSave}
        initialData={editTarget}
        settings={textSettings}
        occupiedTriggers={occupiedTriggers}
        availableTargets={availableTargets}
      />
    </>
  );
}
