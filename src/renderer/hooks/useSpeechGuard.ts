import { useCallback, useEffect, useRef, useState } from 'react';

import type { SpeechGuardSettings } from '../../shared/types.js';
import { startMicLevelMonitor } from '../audio/mic-level-monitor.js';
import { SpeechGate } from '../audio/speech-gate.js';

/** How often a held queue re-checks the gate. */
const POLL_MS = 100;
/** Delay before re-opening the mic after the capture track ended. */
const RESTART_DELAY_MS = 3_000;
/** How long the queue waits for the first mic sample (device opening, OS
 *  permission prompt) before failing open. */
const FIRST_SAMPLE_TIMEOUT_MS = 3_000;

/**
 * Listens to the microphone (when the speech guard is enabled) and returns
 * `waitUntilClear`, which the audio queue awaits before playing each item.
 *
 * `sessionKey` is the running profile id: settings are per profile, so they
 * load only once a session exists and reload if it changes.
 *
 * Fails open: when the guard is off or the mic can't be opened, the queue is
 * never held — a broken mic must not silence every sound command.
 */
export function useSpeechGuard(onError: (message: string) => void, sessionKey: string | null): () => Promise<void> {
  const [settings, setSettings] = useState<SpeechGuardSettings | null>(null);
  const [restartToken, setRestartToken] = useState(0);
  const gateRef = useRef(new SpeechGate(0, 0));
  /** Capture is wanted (guard enabled, mic not known to be broken). */
  const activeRef = useRef(false);
  /** performance.now() of the current capture attempt; null once a sample arrived. */
  const awaitingSampleSinceRef = useRef<number | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    setSettings(null);
    if (!sessionKey) return undefined;
    // A push that lands before the initial fetch resolves is newer — keep it.
    let pushed = false;
    const unsubscribe = window.copilot.onSpeechGuardSettingsUpdate((next) => {
      pushed = true;
      setSettings(next);
    });
    void window.copilot.getSpeechGuardSettings()
      .then((loaded) => { if (!pushed) setSettings(loaded); })
      .catch(() => null);
    return unsubscribe;
  }, [sessionKey]);

  // Threshold / hold changes retune the gate in place — no capture restart,
  // so speech heard so far keeps counting and a held item stays held.
  const thresholdDb = settings?.thresholdDb;
  const holdSeconds = settings?.holdSeconds;
  useEffect(() => {
    if (thresholdDb === undefined || holdSeconds === undefined) return;
    gateRef.current.configure(thresholdDb, holdSeconds * 1000);
  }, [thresholdDb, holdSeconds]);

  const enabled = settings?.enabled ?? false;
  const deviceId = settings?.deviceId ?? null;
  useEffect(() => {
    if (!enabled) {
      activeRef.current = false;
      return undefined;
    }

    // Hold from the start: until the first sample arrives we don't know
    // whether the streamer is talking (bounded by FIRST_SAMPLE_TIMEOUT_MS).
    activeRef.current = true;
    awaitingSampleSinceRef.current = performance.now();

    let stop: (() => void) | null = null;
    let disposed = false;
    let restartTimer: number | null = null;
    const scheduleRestart = () => {
      if (disposed || restartTimer !== null) return;
      restartTimer = window.setTimeout(() => setRestartToken((token) => token + 1), RESTART_DELAY_MS);
    };

    void startMicLevelMonitor({
      deviceId,
      onLevel: (levelDb) => {
        if (disposed) return;
        awaitingSampleSinceRef.current = null;
        gateRef.current.sample(levelDb, performance.now());
      },
      // The track is dead — stop holding the queue until the mic is back.
      onEnded: () => {
        if (disposed) return;
        activeRef.current = false;
        scheduleRestart();
      },
    })
      .then((stopMonitor) => {
        if (disposed) {
          stopMonitor();
          return;
        }
        stop = stopMonitor;
      })
      .catch((cause) => {
        // A superseded attempt must not switch off the capture that replaced it.
        if (disposed) return;
        activeRef.current = false;
        onErrorRef.current(`Speech guard: could not open the microphone (${cause instanceof Error ? cause.message : String(cause)})`);
      });

    // A mic plugged back in shows up as a device change — reopen so the
    // guard recovers without a settings round-trip.
    navigator.mediaDevices.addEventListener('devicechange', scheduleRestart);

    return () => {
      // No activeRef reset here: a restart's next effect runs in the same
      // commit, and a disable sets it false itself — so a held item can't slip
      // out between the old capture closing and the new one opening.
      disposed = true;
      navigator.mediaDevices.removeEventListener('devicechange', scheduleRestart);
      if (restartTimer !== null) window.clearTimeout(restartTimer);
      stop?.();
    };
  }, [enabled, deviceId, restartToken]);

  // Unmount (main window closing) — nothing may wait on a dead guard.
  useEffect(() => () => { activeRef.current = false; }, []);

  return useCallback(async () => {
    while (activeRef.current) {
      const now = performance.now();
      const awaitingSince = awaitingSampleSinceRef.current;
      let wait: number;
      if (awaitingSince !== null) {
        if (now - awaitingSince >= FIRST_SAMPLE_TIMEOUT_MS) return;
        wait = POLL_MS;
      } else {
        wait = gateRef.current.msUntilClear(now);
        if (wait === 0) return;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(wait, POLL_MS)));
    }
  }, []);
}
