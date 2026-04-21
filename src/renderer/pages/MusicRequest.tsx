import { useEffect, useState } from 'react';

import type { MusicPlayerState, MusicRequestSettings, PermissionLevel } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { PermissionPicker } from '../components/PermissionPicker.js';

const copilot = (window as unknown as { copilot: import('../../shared/ipc.js').CopilotApi }).copilot;

const DEFAULT_SETTINGS: MusicRequestSettings = {
  enabled: false,
  volume: 0.5,
  maxQueueSize: 20,
  maxDurationSeconds: 600,
  requestTrigger: '!sr',
  skipTrigger: '!skip',
  queueTrigger: '!queue',
  cancelTrigger: '!cancel',
  requestPermissions: ['everyone'],
  skipPermissions: ['moderator', 'broadcaster'],
  cooldownSeconds: 5,
  userCooldownSeconds: 30,
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MusicRequestPage() {
  const { t } = useI18n();
  const [draft, setDraft] = useState<MusicRequestSettings>(DEFAULT_SETTINGS);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [playerState, setPlayerState] = useState<MusicPlayerState>({ currentItem: null, queue: [], isPlaying: false });

  useEffect(() => {
    copilot.getMusicSettings().then((settings) => {
      setDraft(settings);
      setIsLoaded(true);
    }).catch(() => {
      setError(t('Failed to load music settings'));
      setIsLoaded(true);
    });

    copilot.getMusicState().then(setPlayerState).catch(() => {});
  }, [t]);

  // Subscribe to live queue updates
  useEffect(() => {
    return copilot.onMusicStateUpdate((state) => {
      setPlayerState(state);
    });
  }, []);

  const updateDraft = (patch: Partial<MusicRequestSettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const saveSettings = async () => {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const saved = await copilot.saveMusicSettings(draft);
      setDraft(saved);
      setStatusMessage(t('Music request settings saved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Failed to save music settings'));
    } finally {
      setIsBusy(false);
    }
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
      <h2 className="text-lg font-semibold mb-1">{t('Music Request')}</h2>
      <p className="text-sm text-gray-400 mb-6">
        {t('Viewers request songs via chat commands. The system searches YouTube and plays audio in sequence.')}
      </p>

      <div className="flex gap-6">
        {/* ── Left column: Settings ─────────────────────────────────── */}
        <div className="w-[420px] shrink-0 space-y-4">
          {/* Enable toggle */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('Enabled')}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('Viewers request songs via chat commands. The system searches YouTube and plays audio in sequence.')}
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

          {/* Volume */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
            <h3 className="text-sm font-medium mb-3">{t('Volume')}</h3>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(draft.volume * 100)}
                onChange={(e) => updateDraft({ volume: Number(e.target.value) / 100 })}
                className="flex-1 accent-violet-500"
              />
              <span className="text-sm text-gray-400 w-10 text-right">{Math.round(draft.volume * 100)}%</span>
            </div>
          </div>

          {/* Triggers */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
            <h3 className="text-sm font-medium mb-3">{t('Triggers')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('Request trigger')}</label>
                <input
                  type="text"
                  value={draft.requestTrigger}
                  onChange={(e) => updateDraft({ requestTrigger: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('Skip trigger')}</label>
                <input
                  type="text"
                  value={draft.skipTrigger}
                  onChange={(e) => updateDraft({ skipTrigger: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('Queue trigger')}</label>
                <input
                  type="text"
                  value={draft.queueTrigger}
                  onChange={(e) => updateDraft({ queueTrigger: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('Cancel trigger')}</label>
                <input
                  type="text"
                  value={draft.cancelTrigger}
                  onChange={(e) => updateDraft({ cancelTrigger: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
          </div>

          {/* Permissions */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5 space-y-3">
            <PermissionPicker
              label={t('Request permissions')}
              selectedLevels={draft.requestPermissions}
              onChange={(levels: PermissionLevel[]) => updateDraft({ requestPermissions: levels })}
            />
            <PermissionPicker
              label={t('Skip permissions')}
              selectedLevels={draft.skipPermissions}
              onChange={(levels: PermissionLevel[]) => updateDraft({ skipPermissions: levels })}
            />
          </div>

          {/* Limits & Cooldowns */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
            <h3 className="text-sm font-medium mb-3">{t('Settings')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('Max queue size')}</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={draft.maxQueueSize}
                  onChange={(e) => updateDraft({ maxQueueSize: Number(e.target.value) })}
                  className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('Max duration (minutes)')}</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={Math.round(draft.maxDurationSeconds / 60)}
                  onChange={(e) => updateDraft({ maxDurationSeconds: Number(e.target.value) * 60 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('Cooldown Global (s)')}</label>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={draft.cooldownSeconds}
                  onChange={(e) => updateDraft({ cooldownSeconds: Number(e.target.value) })}
                  className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('Per-user Cooldown (s)')}</label>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={draft.userCooldownSeconds}
                  onChange={(e) => updateDraft({ userCooldownSeconds: Number(e.target.value) })}
                  className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500"
                />
              </div>
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

        {/* ── Right column: Live Queue ──────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Now Playing */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5 mb-4">
            <h3 className="text-sm font-medium mb-3">{t('Now Playing')}</h3>
            {playerState.currentItem ? (
              <div className="flex items-center gap-3">
                {playerState.currentItem.thumbnailUrl ? (
                  <img
                    src={playerState.currentItem.thumbnailUrl}
                    alt=""
                    className="w-16 h-12 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className="w-16 h-12 rounded bg-gray-700 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate font-medium">{playerState.currentItem.title}</p>
                  <p className="text-xs text-gray-500">
                    {t('Requested by')} @{playerState.currentItem.requestedBy} · {formatDuration(playerState.currentItem.durationSeconds)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copilot.musicSkip()}
                  className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors shrink-0"
                >
                  {t('Skip')}
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-500">{t('No song playing')}</p>
            )}
          </div>

          {/* Queue */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">{t('Queue')} ({playerState.queue.length})</h3>
              {playerState.queue.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void copilot.musicClearQueue()}
                  className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-red-300 transition-colors"
                >
                  {t('Clear Queue')}
                </button>
              ) : null}
            </div>

            {playerState.queue.length > 0 ? (
              <div className="space-y-1">
                {playerState.queue.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-700/30"
                  >
                    <span className="text-xs text-gray-600 w-5 text-right shrink-0">{index + 1}.</span>
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" className="w-10 h-7 rounded object-cover shrink-0" />
                    ) : null}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-300 truncate">{item.title}</p>
                      <p className="text-xs text-gray-500">@{item.requestedBy} · {formatDuration(item.durationSeconds)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 text-center py-4">{t('Queue is empty')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
