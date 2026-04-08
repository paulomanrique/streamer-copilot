import { useEffect, useMemo, useState } from 'react';

import { LANGUAGE_OPTIONS, PERMISSION_LEVELS } from '../../shared/constants.js';
import type { PermissionLevel, VoiceCommand, VoiceCommandUpsertInput } from '../../shared/types.js';

interface VoiceCommandsPageProps {
  voiceRate: number;
  voiceVolume: number;
  onChangeVoiceRate: (value: number) => void;
  onChangeVoiceVolume: (value: number) => void;
}

const EMPTY_FORM: VoiceCommandUpsertInput = {
  trigger: '!say',
  template: null,
  language: 'en-US',
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

export function VoiceCommandsPage(props: VoiceCommandsPageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [defaultLanguageCode, setDefaultLanguageCode] = useState(EMPTY_FORM.language);
  const [languageCode, setLanguageCode] = useState(EMPTY_FORM.language);
  const [levels, setLevels] = useState<PermissionLevel[]>(EMPTY_FORM.permissions);
  const [rows, setRows] = useState<VoiceCommand[]>([]);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [trigger, setTrigger] = useState(EMPTY_FORM.trigger);
  const [template, setTemplate] = useState(EMPTY_FORM.template ?? '');
  const [cooldownSeconds, setCooldownSeconds] = useState(EMPTY_FORM.cooldownSeconds);
  const [enabled, setEnabled] = useState(EMPTY_FORM.enabled);
  const [characterLimit, setCharacterLimit] = useState(200);
  const [announceUsername, setAnnounceUsername] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewText = useMemo(() => {
    const trimmedTemplate = template.trim();
    if (trimmedTemplate) return trimmedTemplate;
    return 'Preview voice output';
  }, [template]);

  useEffect(() => {
    const load = async () => {
      try {
        const commands = await window.copilot.listVoiceCommands();
        setRows(commands);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to load voice commands');
      }
    };

    void load();
  }, []);

  const resetForm = () => {
    setDraftId(undefined);
    setTrigger(EMPTY_FORM.trigger);
    setTemplate('');
    setLanguageCode(defaultLanguageCode);
    setLevels(EMPTY_FORM.permissions);
    setCooldownSeconds(EMPTY_FORM.cooldownSeconds);
    setEnabled(EMPTY_FORM.enabled);
    setError(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (command: VoiceCommand) => {
    setDraftId(command.id);
    setTrigger(command.trigger);
    setTemplate(command.template ?? '');
    setLanguageCode(command.language);
    setLevels(command.permissions);
    setCooldownSeconds(command.cooldownSeconds);
    setEnabled(command.enabled);
    setError(null);
    setIsModalOpen(true);
  };

  const saveCommand = async () => {
    setIsBusy(true);

    try {
      const commands = await window.copilot.upsertVoiceCommand({
        id: draftId,
        trigger: trigger.trim(),
        template: template.trim() || null,
        language: languageCode,
        permissions: levels,
        cooldownSeconds,
        enabled,
      });
      setRows(commands);
      setIsModalOpen(false);
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save voice command');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteCommand = async (id: string) => {
    try {
      const commands = await window.copilot.deleteVoiceCommand({ id });
      setRows(commands);
      if (draftId === id) {
        setIsModalOpen(false);
        resetForm();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete voice command');
    }
  };

  const previewCommand = async (text = previewText, lang = languageCode) => {
    try {
      await window.copilot.previewVoiceSpeak({ text, lang });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to preview voice command');
    }
  };

  const saveTtsSettings = () => {
    setStatusMessage('TTS settings updated');
    setError(null);
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
          <h2 className="text-lg font-semibold">Voice Commands (TTS)</h2>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
          >
            + New Command
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          Use TTS to speak chat messages aloud. Ex:{' '}
          <code className="text-violet-300 text-xs bg-gray-800 px-1 py-0.5 rounded">!voice good morning</code>
        </p>

        <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/60">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Command</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Fixed Text</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Language</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Permissions</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Cooldown</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Active</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-mono text-violet-300">{row.trigger}</td>
                  <td className="px-4 py-3 text-gray-300 text-sm">
                    {row.template ?? <span className="text-gray-500 italic">free text after the trigger</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-sm">{row.language}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {row.permissions.map((level) => (
                        <span key={level} className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                          {level}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-sm">{row.cooldownSeconds}s</td>
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
                  <td className="px-4 py-4 text-sm text-gray-500" colSpan={7}>No voice commands saved yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
          <h3 className="font-semibold mb-4">TTS Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Default language</label>
              <select
                value={defaultLanguageCode}
                onChange={(event) => setDefaultLanguageCode(event.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Volume</label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(props.voiceVolume * 100)}
                onChange={(event) => props.onChangeVoiceVolume(Number(event.target.value) / 100)}
                className="w-full accent-violet-500"
              />
              <span className="text-xs text-gray-500">{Math.round(props.voiceVolume * 100)}%</span>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Rate</label>
              <input
                type="range"
                min="50"
                max="200"
                value={Math.round(props.voiceRate * 100)}
                onChange={(event) => props.onChangeVoiceRate(Number(event.target.value) / 100)}
                className="w-full accent-violet-500"
              />
              <span className="text-xs text-gray-500">{props.voiceRate === 1 ? 'Normal (1x)' : `${props.voiceRate.toFixed(2)}x`}</span>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Character limit</label>
              <input
                type="number"
                value={characterLimit}
                onChange={(event) => setCharacterLimit(Number(event.target.value))}
                className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={announceUsername}
                onChange={(event) => setAnnounceUsername(event.target.checked)}
                className="accent-violet-500"
              />
              Announce username
            </label>
            <div className="flex items-center gap-3">
              {statusMessage ? <span className="text-xs text-gray-500">{statusMessage}</span> : null}
              <button type="button" onClick={saveTtsSettings} className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors">
                Save
              </button>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <h3 className="font-semibold">{draftId ? 'Edit Voice Command' : 'New Voice Command'}</h3>
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
                  placeholder="!voice"
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Fixed Text <span className="text-gray-600">(optional)</span>
                </label>
                <p className="text-xs text-gray-600 mb-1.5">If empty, speaks the text after the command typed in chat.</p>
                <input
                  type="text"
                  value={template}
                  onChange={(event) => setTemplate(event.target.value)}
                  placeholder="e.g.: good morning everyone!"
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Language</label>
                <select
                  value={languageCode}
                  onChange={(event) => setLanguageCode(event.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>{option.label}</option>
                  ))}
                </select>
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
                <label className="block text-sm text-gray-400 mb-1.5">Per-user Cooldown (s)</label>
                <input
                  type="number"
                  min="0"
                  value={cooldownSeconds}
                  onChange={(event) => setCooldownSeconds(Number(event.target.value))}
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                />
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
                Preview
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
