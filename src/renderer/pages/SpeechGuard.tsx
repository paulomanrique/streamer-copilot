import { useEffect, useRef, useState } from 'react';

import type { SpeechGuardSettings } from '../../shared/types.js';
import { SPEECH_GUARD_LIMITS } from '../../shared/schemas.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { listMicrophones, startMicLevelMonitor } from '../audio/mic-level-monitor.js';
import { SILENCE_DB, SpeechGate } from '../audio/speech-gate.js';
import { ToggleSwitch } from '../components/ToggleSwitch.js';

const DEFAULT_SETTINGS: SpeechGuardSettings = { enabled: false, deviceId: null, thresholdDb: -45, holdSeconds: 2 };
const METER_MIN_DB = SPEECH_GUARD_LIMITS.thresholdDb.min;

/** Position (0–100%) of a dB value on the meter scale. */
function meterPercent(db: number): number {
  return Math.min(100, Math.max(0, ((db - METER_MIN_DB) / -METER_MIN_DB) * 100));
}

export function SpeechGuardPage() {
  const { messages, t } = useI18n();
  const [settings, setSettings] = useState<SpeechGuardSettings>(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<SpeechGuardSettings>(DEFAULT_SETTINGS);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [level, setLevel] = useState(SILENCE_DB);
  const [holdLeftMs, setHoldLeftMs] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [meterToken, setMeterToken] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // Preview gate: replays the main window's decision with the draft values,
  // so the streamer sees "held / free" while tuning before saving.
  const gateRef = useRef(new SpeechGate(DEFAULT_SETTINGS.thresholdDb, DEFAULT_SETTINGS.holdSeconds * 1000));

  useEffect(() => {
    void window.copilot.getSpeechGuardSettings()
      .then((loaded) => {
        setSettings(loaded);
        setSavedSettings(loaded);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : t('Failed to load settings')));
  }, []);

  useEffect(() => {
    gateRef.current.configure(settings.thresholdDb, settings.holdSeconds * 1000);
  }, [settings.thresholdDb, settings.holdSeconds]);

  // Live meter for the selected mic (independent of the main window's own
  // capture). Reopens on device changes / a dead track so the meter and the
  // mic list never go stale while the page is open.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let disposed = false;
    const reopen = () => {
      if (!disposed) setMeterToken((token) => token + 1);
    };
    setMicError(null);
    setLevel(SILENCE_DB);
    navigator.mediaDevices.addEventListener('devicechange', reopen);
    void startMicLevelMonitor({
      deviceId: settings.deviceId,
      intervalMs: 60,
      onLevel: (db) => {
        if (disposed) return;
        const now = performance.now();
        gateRef.current.sample(db, now);
        setLevel(db);
        setHoldLeftMs(gateRef.current.msUntilClear(now));
      },
      onEnded: () => {
        if (disposed) return;
        setLevel(SILENCE_DB);
        setMicError(t('The microphone was disconnected'));
      },
    })
      .then(async (stopMonitor) => {
        if (disposed) {
          stopMonitor();
          return;
        }
        stop = stopMonitor;
        // Device labels are only exposed once mic permission is granted.
        setMicrophones(await listMicrophones());
      })
      .catch((cause) => {
        if (!disposed) setMicError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      disposed = true;
      navigator.mediaDevices.removeEventListener('devicechange', reopen);
      stop?.();
    };
  }, [settings.deviceId, meterToken]);

  const save = async () => {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const saved = await window.copilot.saveSpeechGuardSettings(settings);
      setSettings(saved);
      setSavedSettings(saved);
      setStatusMessage(t('Settings saved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Failed to save settings'));
    } finally {
      setIsBusy(false);
    }
  };

  const isDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const isTalking = level >= settings.thresholdDb;
  const isHeld = holdLeftMs > 0;
  const savedMicMissing = settings.deviceId !== null && microphones.length > 0 && !microphones.some((mic) => mic.deviceId === settings.deviceId);

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold mb-1">{t('Speech Guard')}</h2>
      <p className="text-sm text-gray-400 mb-6">
        {t('Holds queued sounds and text-to-speech while you are talking, so they never play over your voice.')}
      </p>

      <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-200">{t('Enable speech guard')}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('The app listens to your microphone while it is open.')}</p>
          </div>
          <ToggleSwitch checked={settings.enabled} onChange={(enabled) => setSettings((current) => ({ ...current, enabled }))} />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">{t('Microphone')}</label>
          <select
            value={settings.deviceId ?? ''}
            onChange={(event) => setSettings((current) => ({ ...current, deviceId: event.target.value || null }))}
            className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
          >
            <option value="">{t('System default')}</option>
            {microphones.map((mic, index) => (
              <option key={mic.deviceId} value={mic.deviceId}>{mic.label || `${t('Microphone')} ${index + 1}`}</option>
            ))}
            {savedMicMissing ? <option value={settings.deviceId ?? ''}>{t('Saved microphone (not connected)')}</option> : null}
          </select>
          {micError ? <p className="text-xs text-red-300 mt-1.5">{t('Could not open the microphone')}: {micError}</p> : null}
        </div>

        {/* ── live meter ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-gray-400">{t('Microphone level')}</span>
            <span className="text-xs font-mono text-gray-400 tabular-nums">{level <= SILENCE_DB ? '-∞' : level.toFixed(1)} dB</span>
          </div>
          <div className="relative h-3 rounded-full bg-gray-900 border border-gray-700 overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 transition-[width] duration-75 ${isTalking ? 'bg-red-500' : 'bg-emerald-500'}`}
              style={{ width: `${meterPercent(level)}%` }}
            />
            <div
              className="absolute inset-y-0 w-0.5 bg-white/90"
              style={{ left: `${meterPercent(settings.thresholdDb)}%` }}
              title={t('Threshold')}
            />
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${isHeld ? 'bg-red-500' : 'bg-emerald-500'}`} />
            <span className="text-gray-300">
              {isHeld ? `${t('Queue held')} · ${(holdLeftMs / 1000).toFixed(1)}s` : t('Queue free')}
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm text-gray-400">{t('Talking threshold')}</label>
            <span className="text-xs font-mono text-gray-300 tabular-nums">{settings.thresholdDb} dB</span>
          </div>
          <input
            type="range"
            min={SPEECH_GUARD_LIMITS.thresholdDb.min}
            max={SPEECH_GUARD_LIMITS.thresholdDb.max}
            step={1}
            value={settings.thresholdDb}
            onChange={(event) => setSettings((current) => ({ ...current, thresholdDb: Number(event.target.value) }))}
            className="w-full accent-violet-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            {t('Anything louder than this counts as talking. Speak normally and set it a little below where your voice peaks, above the room noise.')}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm text-gray-400">{t('Wait after you stop talking')}</label>
            <span className="text-xs font-mono text-gray-300 tabular-nums">{settings.holdSeconds.toFixed(1)} s</span>
          </div>
          <input
            type="range"
            min={SPEECH_GUARD_LIMITS.holdSeconds.min}
            max={SPEECH_GUARD_LIMITS.holdSeconds.max}
            step={0.5}
            value={settings.holdSeconds}
            onChange={(event) => setSettings((current) => ({ ...current, holdSeconds: Number(event.target.value) }))}
            className="w-full accent-violet-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            {t('How long the mic must stay quiet before the next queued sound plays.')}
          </p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            disabled={isBusy || !isDirty}
            onClick={() => void save()}
            className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {messages.common.save}
          </button>
          {statusMessage && !isDirty ? <p className="text-sm text-gray-400">{statusMessage}</p> : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
