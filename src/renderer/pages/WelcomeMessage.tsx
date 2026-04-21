import { useEffect, useState } from 'react';

import type { WelcomeSettings, WelcomeUserOverride } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { ToggleSwitch } from '../components/ToggleSwitch.js';

const copilot = (window as unknown as { copilot: import('../../shared/ipc.js').CopilotApi }).copilot;

const DEFAULT_SETTINGS: WelcomeSettings = {
  enabled: false,
  messageTemplate: 'Welcome, {username}!',
  soundFilePath: null,
  userOverrides: [],
};

export function WelcomeMessagePage() {
  const { t } = useI18n();
  const [draft, setDraft] = useState<WelcomeSettings>(DEFAULT_SETTINGS);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Per-user override form state
  const [overrideUsername, setOverrideUsername] = useState('');
  const [overrideMessage, setOverrideMessage] = useState('{global-welcome-message}');
  const [overrideSoundPath, setOverrideSoundPath] = useState<string | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  useEffect(() => {
    copilot.getWelcomeSettings().then((settings) => {
      setDraft({ ...settings, userOverrides: settings.userOverrides ?? [] });
      setIsLoaded(true);
    }).catch(() => {
      setError(t('Failed to load welcome settings'));
      setIsLoaded(true);
    });
  }, [t]);

  const updateDraft = (patch: Partial<WelcomeSettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const saveSettings = async () => {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const saved = await copilot.saveWelcomeSettings(draft);
      setDraft({ ...saved, userOverrides: saved.userOverrides ?? [] });
      setStatusMessage(t('Welcome settings saved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Failed to save welcome settings'));
    } finally {
      setIsBusy(false);
    }
  };

  const pickGlobalSoundFile = async () => {
    try {
      const filePath = await copilot.pickWelcomeSoundFile();
      if (filePath) updateDraft({ soundFilePath: filePath });
    } catch {
      setError(t('Failed to pick sound file'));
    }
  };

  const pickOverrideSoundFile = async () => {
    try {
      const filePath = await copilot.pickWelcomeSoundFile();
      if (filePath) setOverrideSoundPath(filePath);
    } catch {
      setOverrideError(t('Failed to pick sound file'));
    }
  };

  const addOverride = () => {
    setOverrideError(null);
    const username = overrideUsername.trim();
    if (!username) return;

    const exists = draft.userOverrides.some(
      (o) => o.username.toLowerCase() === username.toLowerCase(),
    );
    if (exists) {
      setOverrideError(t('User already has an override'));
      return;
    }

    const newOverride: WelcomeUserOverride = {
      username,
      messageTemplate: overrideMessage.trim() || null,
      soundFilePath: overrideSoundPath,
    };

    updateDraft({ userOverrides: [...draft.userOverrides, newOverride] });
    setOverrideUsername('');
    setOverrideMessage('{global-welcome-message}');
    setOverrideSoundPath(null);
  };

  const removeOverride = (username: string) => {
    updateDraft({
      userOverrides: draft.userOverrides.filter(
        (o) => o.username.toLowerCase() !== username.toLowerCase(),
      ),
    });
  };

  if (!isLoaded) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-400">{t('Loading...')}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-1">{t('Welcome Message')}</h2>
      <p className="text-sm text-gray-400 mb-6">
        {t('Welcome message sent to first-time chatters in each session.')}
      </p>

      <div className="flex gap-6">
        {/* ── Left column: Global settings ──────────────────────────── */}
        <div className="w-[400px] shrink-0 space-y-4">
          {/* Enable toggle */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('Enabled')}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('Welcome message sent to first-time chatters in each session.')}
                </p>
              </div>
              <ToggleSwitch checked={draft.enabled} onChange={(enabled) => updateDraft({ enabled })} />
            </div>
          </div>

          {/* Message template */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
            <h3 className="text-sm font-medium mb-1">{t('Message Template')}</h3>
            <p className="text-xs text-gray-500 mb-3">
              {t('Use {username} for the viewer name.')}
            </p>
            <textarea
              value={draft.messageTemplate}
              onChange={(e) => updateDraft({ messageTemplate: e.target.value })}
              rows={3}
              maxLength={500}
              className="w-full resize-none bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Global sound */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
            <h3 className="text-sm font-medium mb-1">{t('Global Sound')}</h3>
            <p className="text-xs text-gray-500 mb-3">
              {t('Optionally play a sound when a new chatter arrives.')}
            </p>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm text-gray-400 truncate">
                {draft.soundFilePath ? draft.soundFilePath.split(/[/\\]/).pop() : t('no file selected')}
              </span>
              <button
                type="button"
                onClick={() => void pickGlobalSoundFile()}
                className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors"
              >
                {t('Choose file...')}
              </button>
              {draft.soundFilePath ? (
                <button
                  type="button"
                  onClick={() => updateDraft({ soundFilePath: null })}
                  className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm text-red-300 transition-colors"
                >
                  {t('Clear')}
                </button>
              ) : null}
            </div>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void saveSettings()}
              className="px-3 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {t('Save')}
            </button>
            {statusMessage ? <p className="text-sm text-gray-400">{statusMessage}</p> : null}
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
          </div>
        </div>

        {/* ── Right column: Per-user overrides ──────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
            <h3 className="text-sm font-medium mb-1">{t('Per-user overrides')}</h3>
            <p className="text-xs text-gray-500 mb-4">
              {t('Custom welcome for specific users. Leave message empty to use global template.')}
            </p>

            {/* Add override form */}
            <div className="flex flex-col gap-2 mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('Username')}
                  value={overrideUsername}
                  onChange={(e) => setOverrideUsername(e.target.value)}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500 placeholder-gray-500"
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500 truncate max-w-[120px]">
                    {overrideSoundPath ? overrideSoundPath.split(/[/\\]/).pop() : t('no file selected')}
                  </span>
                  <button
                    type="button"
                    onClick={() => void pickOverrideSoundFile()}
                    className="px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs transition-colors shrink-0"
                    title={t('Choose file...')}
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                    </svg>
                  </button>
                  {overrideSoundPath ? (
                    <button
                      type="button"
                      onClick={() => setOverrideSoundPath(null)}
                      className="px-1.5 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs text-red-300 transition-colors shrink-0"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={addOverride}
                  className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors shrink-0"
                >
                  {t('Add')}
                </button>
              </div>
              <input
                type="text"
                placeholder={t('Message (use {global-welcome-message} for global template)')}
                value={overrideMessage}
                onChange={(e) => setOverrideMessage(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500 placeholder-gray-500"
              />
              {overrideError ? (
                <p className="text-xs text-red-300">{overrideError}</p>
              ) : null}
            </div>

            {/* Overrides table */}
            {draft.userOverrides.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-700">
                      <th className="pb-2 pr-3 font-medium">{t('Username')}</th>
                      <th className="pb-2 pr-3 font-medium">{t('Message')}</th>
                      <th className="pb-2 pr-3 font-medium">{t('Sound')}</th>
                      <th className="pb-2 font-medium w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {draft.userOverrides.map((override) => (
                      <tr key={override.username} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                        <td className="py-2 pr-3 text-gray-300 font-medium">{override.username}</td>
                        <td className="py-2 pr-3 text-gray-400 truncate max-w-[200px]">
                          {override.messageTemplate || <span className="text-gray-600 italic">{t('(global)')}</span>}
                        </td>
                        <td className="py-2 pr-3 text-gray-400 truncate max-w-[120px]">
                          {override.soundFilePath
                            ? override.soundFilePath.split(/[/\\]/).pop()
                            : <span className="text-gray-600 italic">{t('(global)')}</span>}
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => removeOverride(override.username)}
                            className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-300 transition-colors"
                            title={t('Delete')}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-500 text-center py-4">
                {t('No per-user overrides configured.')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
