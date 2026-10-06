/** Floor reported for digital silence, so the level is always finite. */
export const SILENCE_DB = -100;

/** RMS level of a block of samples in dBFS (0 = full scale). */
export function rmsToDb(samples: ArrayLike<number>): number {
  if (samples.length === 0) return SILENCE_DB;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
  const rms = Math.sqrt(sumSquares / samples.length);
  if (rms <= 0) return SILENCE_DB;
  return Math.max(SILENCE_DB, 20 * Math.log10(rms));
}

/**
 * Decides whether the audio queue may play: it is clear once the mic level
 * has stayed below the threshold for `holdMs` since the last loud sample.
 * Time is passed in so the logic stays deterministic under test.
 */
export class SpeechGate {
  private lastLoudAt = Number.NEGATIVE_INFINITY;
  /** Whether the most recent sample was loud — holds even with a 0s hold. */
  private talking = false;

  constructor(private thresholdDb: number, private holdMs: number) {}

  configure(thresholdDb: number, holdMs: number): void {
    this.thresholdDb = thresholdDb;
    this.holdMs = holdMs;
  }

  /** Feeds one level measurement; returns whether it counts as talking. */
  sample(levelDb: number, now: number): boolean {
    const loud = levelDb >= this.thresholdDb;
    if (loud) this.lastLoudAt = now;
    this.talking = loud;
    return loud;
  }

  /** Milliseconds until the queue may play; 0 when it already may. While
   *  the streamer is still talking the real answer is unknown, so this is at
   *  least 1 (callers re-check). */
  msUntilClear(now: number): number {
    const afterHold = Math.max(0, this.lastLoudAt + this.holdMs - now);
    return this.talking ? Math.max(1, afterHold) : afterHold;
  }

  isClear(now: number): boolean {
    return this.msUntilClear(now) === 0;
  }

  reset(): void {
    this.lastLoudAt = Number.NEGATIVE_INFINITY;
    this.talking = false;
  }
}
