import { useEffect, useState } from 'react';

import { PERMISSION_LEVELS } from '../../shared/constants.js';
import type {
  PermissionLevel,
  ScheduledAvailableTargets,
  TextCommand,
  TextCommandUpsertInput,
  TextSettings,
} from '../../shared/types.js';
import { ToggleSwitch } from './ToggleSwitch.js';

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  everyone: 'Everyone',
  follower: 'Followers',
  subscriber: 'Subscribers',
  vip: 'VIP',
  moderator: 'Moderators',
  broadcaster: 'Broadcaster',
};

const SCHEDULE_PLATFORMS: { id: 'twitch' | 'youtube'; label: string }[] = [
  { id: 'twitch', label: 'Twitch' },
  { id: 'youtube', label: 'YouTube (H/V)' },
];

interface TextCommandModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: TextCommandUpsertInput) => Promise<void>;
  initialData?: TextCommand | null;
  settings: TextSettings;
  occupiedTriggers: Set<string>;
  availableTargets: ScheduledAvailableTargets;
}

type Step = 'content' | 'activation';

export function TextCommandModal({
  open,
  onClose,
  onSave,
  initialData,
  settings,
  occupiedTriggers,
  availableTargets,
}: TextCommandModalProps) {
  const [step, setStep] = useState<Step>('content');

  const [name, setName] = useState('');
  const [response, setResponse] = useState('');

  const [commandEnabled, setCommandEnabled] = useState(true);
  const [trigger, setTrigger] = useState('!');
  const [levels, setLevels] = useState<PermissionLevel[]>(['everyone']);
  const [useGlobalCooldown, setUseGlobalCooldown] = useState(true);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [userCooldownSeconds, setUserCooldownSeconds] = useState(0);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleIntervalMinutes, setScheduleIntervalMinutes] = useState(15);
  const [scheduleRandomWindowMinutes, setScheduleRandomWindowMinutes] = useState(0);
  const [schedulePlatforms, setSchedulePlatforms] = useState<('twitch' | 'youtube')[]>(['twitch', 'youtube']);
  const [enabled, setEnabled] = useState(true);

  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('content');
    setError(null);
    if (initialData) {
      setName(initialData.name ?? '');
      setResponse(initialData.response);
      setCommandEnabled(initialData.commandEnabled);
      setTrigger(initialData.trigger ?? '!');
      setLevels(initialData.permissions);
      const isGlobal = initialData.cooldownSeconds === null && initialData.userCooldownSeconds === null;
      setUseGlobalCooldown(isGlobal);
      setCooldownSeconds(initialData.cooldownSeconds ?? settings.defaultCooldownSeconds);
      setUserCooldownSeconds(initialData.userCooldownSeconds ?? settings.defaultUserCooldownSeconds);
      setScheduleEnabled(Boolean(initialData.schedule?.enabled));
      setScheduleIntervalMinutes(Math.round((initialData.schedule?.intervalSeconds ?? 900) / 60));
      setScheduleRandomWindowMinutes(Math.round((initialData.schedule?.randomWindowSeconds ?? 0) / 60));
      setSchedulePlatforms(
        (initialData.schedule?.targetPlatforms.filter(
          (p): p is 'twitch' | 'youtube' => p === 'twitch' || p === 'youtube',
        ) ?? ['twitch', 'youtube']),
      );
      setEnabled(initialData.enabled);
    } else {
      setName('');
      setResponse('');
      setCommandEnabled(true);
      setTrigger('!');
      setLevels(['everyone']);
      setUseGlobalCooldown(true);
      setCooldownSeconds(settings.defaultCooldownSeconds);
      setUserCooldownSeconds(settings.defaultUserCooldownSeconds);
      setScheduleEnabled(false);
      setScheduleIntervalMinutes(15);
      setScheduleRandomWindowMinutes(0);
      setSchedulePlatforms(['twitch', 'youtube']);
      setEnabled(true);
    }
  }, [open, initialData, settings]);

  const toggleLevel = (level: PermissionLevel) => {
    setLevels((current) => {
      if (current.includes(level)) {
        const next = current.filter((l) => l !== level);
        return next.length > 0 ? next : ['everyone'];
      }
      return [...current, level];
    });
  };

  const toggleSchedulePlatform = (platform: 'twitch' | 'youtube') => {
    setSchedulePlatforms((current) =>
      current.includes(platform) ? current.filter((p) => p !== platform) : [...current, platform],
    );
  };

  const handleContinue = () => {
    if (!name.trim()) { setError('Give the command a name to continue'); return; }
    if (!response.trim()) { setError('Response text is required'); return; }
    setError(null);
    setStep('activation');
  };

  const handleSave = async () => {
    if (!commandEnabled && !scheduleEnabled) {
      setError('Enable at least one trigger type');
      return;
    }
    if (commandEnabled) {
      const t = trigger.trim();
      if (!t.startsWith('!') || t.length < 2) {
        setError('Command must start with ! and include a name (e.g. !site)');
        return;
      }
      const lower = t.toLowerCase();
      if (occupiedTriggers.has(lower) && lower !== initialData?.trigger?.toLowerCase()) {
        setError('This trigger is already used by another command');
        return;
      }
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
    setError(null);
    try {
      await onSave({
        id: initialData?.id,
        name: name.trim(),
        trigger: commandEnabled ? trigger.trim() : null,
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save');
    } finally {
      setIsBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <h3 className="font-semibold">{initialData ? 'Edit Text Command' : 'New Text Command'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="flex items-center gap-2 px-5 pt-4 pb-1 shrink-0">
          <div className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold shrink-0 ${step === 'content' ? 'bg-violet-600 text-white' : 'bg-violet-600/40 text-violet-300'}`}>1</div>
          <span className={`text-xs ${step === 'content' ? 'text-gray-200' : 'text-gray-400'}`}>Name & Response</span>
          <div className="flex-1 h-px bg-gray-700" />
          <div className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold shrink-0 ${step === 'activation' ? 'bg-violet-600 text-white' : 'bg-gray-700 text-gray-500'}`}>2</div>
          <span className={`text-xs ${step === 'activation' ? 'text-gray-200' : 'text-gray-500'}`}>Activation</span>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {step === 'content' ? (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Name <span className="text-violet-400">*</span></label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My website"
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600"
                />
                <p className="text-xs text-gray-600 mt-1">Displayed in the commands list</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Response <span className="text-violet-400">*</span></label>
                <textarea
                  rows={4}
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="https://www.example.com"
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600 resize-none"
                />
              </div>
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
            </>
          ) : (
            <>
              <div className={`rounded-lg border overflow-hidden transition-colors ${commandEnabled ? 'border-violet-600/50' : 'border-gray-700'}`}>
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/60 hover:bg-gray-800/80 transition-colors"
                  onClick={() => setCommandEnabled((v) => !v)}
                >
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-200">Chat command</p>
                    <p className="text-xs text-gray-500 mt-0.5">Replies when someone types a trigger in chat</p>
                  </div>
                  <ToggleSwitch checked={commandEnabled} onChange={setCommandEnabled} />
                </button>
                {commandEnabled ? (
                  <div className="px-4 pb-4 pt-3 border-t border-gray-700 space-y-3 bg-gray-900/30">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">Trigger</label>
                      <input
                        type="text"
                        value={trigger}
                        onChange={(e) => setTrigger(e.target.value)}
                        placeholder="!site"
                        className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 font-mono placeholder-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">Permissions</label>
                      <div className="flex flex-wrap gap-1.5">
                        {PERMISSION_LEVELS.map((level) => {
                          const active = levels.includes(level);
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => toggleLevel(level)}
                              className={active
                                ? 'px-2.5 py-1 rounded-full bg-violet-600 text-white text-xs font-medium'
                                : 'px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 text-gray-300 text-xs'}
                            >
                              {PERMISSION_LABELS[level]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={useGlobalCooldown}
                          onChange={(e) => {
                            setUseGlobalCooldown(e.target.checked);
                            if (e.target.checked) {
                              setCooldownSeconds(settings.defaultCooldownSeconds);
                              setUserCooldownSeconds(settings.defaultUserCooldownSeconds);
                            }
                          }}
                          className="accent-violet-500"
                        />
                        Use global cooldown defaults
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Global cooldown (s)</label>
                          <input
                            type="number"
                            min="0"
                            max="3600"
                            value={useGlobalCooldown ? settings.defaultCooldownSeconds : cooldownSeconds}
                            disabled={useGlobalCooldown}
                            onChange={(e) => setCooldownSeconds(Number(e.target.value))}
                            className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500 disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Per-user cooldown (s)</label>
                          <input
                            type="number"
                            min="0"
                            max="3600"
                            value={useGlobalCooldown ? settings.defaultUserCooldownSeconds : userCooldownSeconds}
                            disabled={useGlobalCooldown}
                            onChange={(e) => setUserCooldownSeconds(Number(e.target.value))}
                            className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500 disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={`rounded-lg border overflow-hidden transition-colors ${scheduleEnabled ? 'border-cyan-600/50' : 'border-gray-700'}`}>
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/60 hover:bg-gray-800/80 transition-colors"
                  onClick={() => setScheduleEnabled((v) => !v)}
                >
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-200">Schedule</p>
                    <p className="text-xs text-gray-500 mt-0.5">Sends automatically at regular intervals</p>
                  </div>
                  <ToggleSwitch checked={scheduleEnabled} onChange={setScheduleEnabled} />
                </button>
                {scheduleEnabled ? (
                  <div className="px-4 pb-4 pt-3 border-t border-gray-700 space-y-3 bg-gray-900/30">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Interval (min)</label>
                        <input
                          type="number"
                          min="1"
                          value={scheduleIntervalMinutes}
                          onChange={(e) => setScheduleIntervalMinutes(Number(e.target.value))}
                          className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Random window (min)</label>
                        <input
                          type="number"
                          min="0"
                          value={scheduleRandomWindowMinutes}
                          onChange={(e) => setScheduleRandomWindowMinutes(Number(e.target.value))}
                          className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400">Targets</p>
                      {SCHEDULE_PLATFORMS.map(({ id, label }) => {
                        const connected = availableTargets.connected.includes(id);
                        return (
                          <label key={id} className="flex items-center justify-between text-sm text-gray-300 cursor-pointer">
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
                  </div>
                ) : null}
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-violet-500" />
                Active
              </label>

              {error ? <p className="text-sm text-red-300">{error}</p> : null}
            </>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-700 shrink-0">
          {step === 'content' ? (
            <>
              <button type="button" onClick={onClose} className="flex-1 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleContinue} className="flex-1 px-3 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors">
                Continue →
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { setStep('content'); setError(null); }} className="flex-1 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
                ← Back
              </button>
              <button type="button" disabled={isBusy} onClick={() => void handleSave()} className="flex-1 px-3 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors disabled:opacity-60">
                Save
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
