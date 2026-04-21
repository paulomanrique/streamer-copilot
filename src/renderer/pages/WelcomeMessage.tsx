import { useEffect, useState } from 'react';

import type { WelcomeSettings } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';

const copilot = (window as unknown as { copilot: import('../../shared/ipc.js').CopilotApi }).copilot;

const DEFAULT_SETTINGS: WelcomeSettings = {
  enabled: false,
  messageTemplate: 'Welcome, {username}!',
  soundFilePath: null,
};

export function WelcomeMessagePage() {
  const { t } = useI18n();
  const [draft, setDraft] = useState<WelcomeSettings>(DEFAULT_SETTINGS);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    copilot.getWelcomeSettings().then((settings) => {
      setDraft(settings);
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
      setDraft(saved);
      setStatusMessage(t('Welcome settings saved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Failed to save welcome settings'));
    } finally {
      setIsBusy(false);
    }
  };

  const pickSoundFile = async () => {
    try {
      const filePath = await copilot.pickWelcomeSoundFile();
      if (filePath) updateDraft({ soundFilePath: filePath });
    } catch {
      setError(t('Failed to pick sound file'));
    }
  };

  if (!isLoaded) {
    return (
      <div className="p-6 max-w-lg">
        <p className="text-sm text-gray-400">{t('Loading...')}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-lg font-semibold mb-1">{t('Welcome Message')}</h2>
      <p className="text-sm text-gray-400 mb-6">
        {t('Welcome message sent to first-time chatters in each session.')}
      </p>

      <div className="space-y-4">
        {/* Enable toggle */}
        <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('Enabled')}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('Welcome message sent to first-time chatters in each session.')}
              </p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => updateDraft({ enabled: e.target.checked })}
              />
              <span className="toggle-slider" />
            </label>
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

        {/* Welcome sound */}
        <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
          <h3 className="text-sm font-medium mb-1">{t('Welcome Sound')}</h3>
          <p className="text-xs text-gray-500 mb-3">
            {t('Optionally play a sound when a new chatter arrives.')}
          </p>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-gray-400 truncate">
              {draft.soundFilePath ? draft.soundFilePath.split(/[/\\]/).pop() : t('no file selected')}
            </span>
            <button
              type="button"
              onClick={() => void pickSoundFile()}
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
    </div>
  );
}
