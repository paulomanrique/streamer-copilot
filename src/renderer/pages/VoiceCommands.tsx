import { useEffect, useRef, useState } from 'react';

import { PERMISSION_LEVELS } from '../../shared/constants.js';
import type { PermissionLevel, VoiceCommand } from '../../shared/types.js';
import { ToggleSwitch } from '../components/ToggleSwitch.js';

const GOOGLE_TTS_LANGUAGES = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh-CN', label: '中文 (简体)' },
  { code: 'zh-TW', label: '中文 (繁體)' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'pt', label: 'Português (Portugal)' },
  { code: 'sv', label: 'Svenska' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'uk', label: 'Українська' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ไทย' },
  { code: 'cs', label: 'Čeština' },
  { code: 'da', label: 'Dansk' },
  { code: 'fi', label: 'Suomi' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'he', label: 'עברית' },
  { code: 'hu', label: 'Magyar' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'no', label: 'Norsk' },
  { code: 'ro', label: 'Română' },
  { code: 'fil', label: 'Filipino' },
];

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  everyone: 'Everyone',
  follower: 'Followers',
  subscriber: 'Subscribers',
  vip: 'VIP',
  moderator: 'Moderators',
  broadcaster: 'Broadcaster',
};

interface VoiceCommandsPageProps {
  voiceRate: number;
  voiceVolume: number;
  onChangeVoiceRate: (value: number) => void;
  onChangeVoiceVolume: (value: number) => void;
}

export function VoiceCommandsPage(props: VoiceCommandsPageProps) {
  const triggerInputRef = useRef<HTMLInputElement | null>(null);

  const [commandId, setCommandId] = useState<string | undefined>(undefined);
  const [commandLoaded, setCommandLoaded] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [trigger, setTrigger] = useState('!voice');
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  const [characterLimit, setCharacterLimit] = useState(200);
  const [announceUsername, setAnnounceUsername] = useState(true);
  const [permissions, setPermissions] = useState<PermissionLevel[]>(['everyone']);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [userCooldownSeconds, setUserCooldownSeconds] = useState(0);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [soundTriggers, setSoundTriggers] = useState<Set<string>>(new Set());
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) setVoices(list);
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const commands = await window.copilot.listVoiceCommands();
        if (commands.length > 0) {
          const cmd = commands[0];
          setCommandId(cmd.id);
          setEnabled(cmd.enabled);
          setTrigger(cmd.trigger);
          setSelectedVoiceName(cmd.language);
          setCharacterLimit(cmd.characterLimit);
          setAnnounceUsername(cmd.announceUsername);
          setPermissions(cmd.permissions);
          setCooldownSeconds(cmd.cooldownSeconds);
          setUserCooldownSeconds(cmd.userCooldownSeconds);
        }
        setCommandLoaded(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to load voice command');
        setCommandLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const sounds = await window.copilot.listSoundCommands();
        setSoundTriggers(new Set(sounds.map((s) => s.trigger?.toLowerCase()).filter((t): t is string => Boolean(t))));
      } catch { /* non-critical */ }
    })();
  }, []);

  useEffect(() => {
    if (voices.length === 0 || !commandLoaded) return;
    const match = voices.find((v) => v.name === selectedVoiceName);
    if (!match && !selectedVoiceName.startsWith('google:')) {
      const defaultVoice = voices.find((v) => v.default) ?? voices[0];
      setSelectedVoiceName(defaultVoice.name);
    }
  }, [voices, commandLoaded]);

  const validateTrigger = (value: string): string | null => {
    if (!value.startsWith('!')) return 'Command must start with !';
    if (value.trim().length < 2) return 'Command must have at least one character after !';
    if (soundTriggers.has(value.toLowerCase())) return 'Already used by a Sound Command';
    return null;
  };

  const handleTriggerChange = (value: string) => {
    setTrigger(value);
    setTriggerError(validateTrigger(value));
    setStatusMessage(null);
  };

  const buildInput = (overrides?: Partial<{ enabled: boolean; permissions: PermissionLevel[] }>) => ({
    id: commandId,
    trigger: trigger.trim(),
    template: null as null,
    language: selectedVoiceName,
    permissions: overrides?.permissions ?? permissions,
    cooldownSeconds,
    userCooldownSeconds,
    announceUsername,
    characterLimit,
    enabled: overrides?.enabled ?? enabled,
  });

  const save = async (overrides?: Partial<{ enabled: boolean; permissions: PermissionLevel[] }>) => {
    const validationError = validateTrigger(trigger);
    if (validationError) {
      setTriggerError(validationError);
      triggerInputRef.current?.focus();
      return;
    }
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const commands = await window.copilot.upsertVoiceCommand(buildInput(overrides));
      const saved = commands[0] as VoiceCommand | undefined;
      if (saved) setCommandId(saved.id);
      props.onChangeVoiceRate(props.voiceRate);
      props.onChangeVoiceVolume(props.voiceVolume);
      setStatusMessage('Saved');
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save');
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggle = (value: boolean) => {
    setEnabled(value);
    void save({ enabled: value });
  };

  const toggleLevel = (level: PermissionLevel) => {
    const next = permissions.includes(level)
      ? permissions.filter((l) => l !== level)
      : [...permissions, level];
    if (next.length === 0) return;
    setPermissions(next);
  };

  const preview = async () => {
    const text = previewText.trim() || 'Hello, I am your stream copilot!';
    try {
      await window.copilot.previewSpeak({ text, lang: selectedVoiceName });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preview failed');
    }
  };

  const isGoogleEngine = selectedVoiceName.startsWith('google:');
  const googleLangCode = isGoogleEngine ? selectedVoiceName.slice('google:'.length) : '';

  const setEngine = (engine: 'system' | 'google') => {
    if (engine === 'google') {
      setSelectedVoiceName('google:pt-BR');
    } else {
      const defaultVoice = voices.find((v) => v.default) ?? voices[0];
      setSelectedVoiceName(defaultVoice?.name ?? '');
    }
  };

  const voicesByLang = voices.reduce<Record<string, SpeechSynthesisVoice[]>>((acc, voice) => {
    const lang = voice.lang || 'Other';
    (acc[lang] ??= []).push(voice);
    return acc;
  }, {});
  const sortedLangs = Object.keys(voicesByLang).sort((a, b) => a.localeCompare(b));

  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-lg font-semibold mb-1">Voice (TTS)</h2>
      <p className="text-sm text-gray-400 mb-6">
        Speak chat messages aloud via a trigger command. Example:{' '}
        <code className="text-violet-300 text-xs bg-gray-800 px-1 py-0.5 rounded">!voice good morning</code>
      </p>

      <div className="bg-gray-800/40 rounded-xl border border-gray-700 divide-y divide-gray-700">

        {/* Enable toggle — auto-saves immediately */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-medium">Enable TTS</p>
            <p className="text-xs text-gray-500 mt-0.5">Respond to the trigger command in chat</p>
          </div>
          <ToggleSwitch checked={enabled} onChange={handleToggle} />
        </div>

        {/* Command trigger */}
        <div className="px-5 py-4">
          <label className="block text-sm text-gray-400 mb-1.5">
            Command <span className="text-violet-400">*</span>
          </label>
          <input
            ref={triggerInputRef}
            type="text"
            value={trigger}
            onChange={(e) => handleTriggerChange(e.target.value)}
            placeholder="!voice"
            className={`w-full bg-gray-700 border rounded text-sm text-gray-200 px-3 py-2 focus:outline-none font-mono ${
              triggerError ? 'border-red-500 focus:border-red-400' : 'border-gray-600 focus:border-violet-500'
            }`}
          />
          {triggerError ? (
            <p className="mt-1.5 text-xs text-red-400">{triggerError}</p>
          ) : (
            <p className="mt-1.5 text-xs text-gray-600">Text typed after the command is spoken aloud.</p>
          )}
        </div>

        {/* Permissions */}
        <div className="px-5 py-4">
          <label className="block text-sm text-gray-400 mb-2">Who can use</label>
          <div className="flex flex-wrap gap-2">
            {PERMISSION_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => toggleLevel(level)}
                className={
                  permissions.includes(level)
                    ? 'px-3 py-1 text-xs rounded-full bg-violet-600 text-white'
                    : 'px-3 py-1 text-xs rounded-full bg-gray-700 text-gray-400 hover:text-white'
                }
              >
                {PERMISSION_LABELS[level]}
              </button>
            ))}
          </div>
        </div>

        {/* Cooldowns */}
        <div className="px-5 py-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Global Cooldown (s)</label>
            <input
              type="number"
              min={0}
              max={3600}
              value={cooldownSeconds}
              onChange={(e) => setCooldownSeconds(Number(e.target.value))}
              className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-200 px-3 py-2 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Per-User Cooldown (s)</label>
            <input
              type="number"
              min={0}
              max={3600}
              value={userCooldownSeconds}
              onChange={(e) => setUserCooldownSeconds(Number(e.target.value))}
              className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-200 px-3 py-2 focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>

        {/* TTS Engine */}
        <div className="px-5 py-4">
          <label className="block text-sm text-gray-400 mb-1.5">Engine</label>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setEngine('system')}
              className={`px-3 py-1.5 rounded text-sm transition-colors border ${
                !isGoogleEngine
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white'
              }`}
            >
              System
            </button>
            <button
              type="button"
              onClick={() => setEngine('google')}
              className={`px-3 py-1.5 rounded text-sm transition-colors border ${
                isGoogleEngine
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white'
              }`}
            >
              Google Translate
            </button>
          </div>
          <p className="text-xs text-gray-600">
            {isGoogleEngine
              ? 'Uses Google Translate TTS. Requires internet.'
              : 'Uses voices installed on this computer.'}
          </p>
        </div>

        {/* Voice / Language select */}
        <div className="px-5 py-4">
          {isGoogleEngine ? (
            <>
              <label className="block text-sm text-gray-400 mb-1.5">Language</label>
              <select
                value={googleLangCode}
                onChange={(e) => setSelectedVoiceName(`google:${e.target.value}`)}
                className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-200 px-3 py-2 focus:outline-none focus:border-violet-500"
              >
                {GOOGLE_TTS_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="block text-sm text-gray-400 mb-1.5">Voice</label>
              {voices.length === 0 ? (
                <p className="text-xs text-gray-500 italic">Loading voices…</p>
              ) : (
                <select
                  value={selectedVoiceName}
                  onChange={(e) => setSelectedVoiceName(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-200 px-3 py-2 focus:outline-none focus:border-violet-500"
                >
                  {sortedLangs.map((lang) => (
                    <optgroup key={lang} label={lang}>
                      {voicesByLang[lang].map((voice) => (
                        <option key={voice.name} value={voice.name}>
                          {voice.name}{voice.default ? ' ★' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </>
          )}
        </div>

        {/* Rate & Volume (system voices only) */}
        {!isGoogleEngine ? (
          <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-400">Rate</span>
              <span className="text-xs text-gray-500 tabular-nums">
                {props.voiceRate === 1 ? 'Normal (1×)' : `${props.voiceRate.toFixed(2)}×`}
              </span>
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-400">Volume</span>
              <span className="text-xs text-gray-500 tabular-nums">{Math.round(props.voiceVolume * 100)}%</span>
            </div>
            <input
              type="range" min="50" max="200"
              value={Math.round(props.voiceRate * 100)}
              onChange={(e) => props.onChangeVoiceRate(Number(e.target.value) / 100)}
              className="w-full accent-violet-500"
            />
            <input
              type="range" min="0" max="100"
              value={Math.round(props.voiceVolume * 100)}
              onChange={(e) => props.onChangeVoiceVolume(Number(e.target.value) / 100)}
              className="w-full accent-violet-500"
            />
          </div>
        ) : null}

        {/* Extra options */}
        <div className="px-5 py-4 flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <label className="text-sm text-gray-400 whitespace-nowrap">Char limit</label>
            <input
              type="number" min="10" max="500"
              value={characterLimit}
              onChange={(e) => setCharacterLimit(Number(e.target.value))}
              className="w-20 bg-gray-700 border border-gray-600 rounded text-sm text-gray-200 px-2 py-1.5 focus:outline-none focus:border-violet-500 text-center"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={announceUsername}
              onChange={(e) => setAnnounceUsername(e.target.checked)}
              className="accent-violet-500"
            />
            Announce username
          </label>
        </div>

        {/* Preview + Save */}
        <div className="px-5 py-4 flex items-center gap-2">
          <input
            type="text"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void preview(); }}
            placeholder="Type something to preview…"
            className="flex-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600"
          />
          <button
            type="button"
            onClick={() => void preview()}
            className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors flex items-center gap-1.5 shrink-0 border border-gray-600"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Preview
          </button>
          <button
            type="button"
            disabled={isBusy || !!triggerError}
            onClick={() => void save()}
            className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
          >
            {statusMessage ?? 'Save'}
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
