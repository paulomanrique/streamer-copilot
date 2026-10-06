import { describe, expect, it } from 'vitest';

import { rmsToDb, SILENCE_DB, SpeechGate } from '../../src/renderer/audio/speech-gate.js';

describe('rmsToDb', () => {
  it('reports full-scale square wave as 0 dBFS', () => {
    expect(rmsToDb([1, -1, 1, -1])).toBeCloseTo(0, 5);
  });

  it('reports half amplitude as about -6 dBFS', () => {
    expect(rmsToDb([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(-6.02, 1);
  });

  it('floors digital silence and empty blocks', () => {
    expect(rmsToDb([0, 0, 0])).toBe(SILENCE_DB);
    expect(rmsToDb([])).toBe(SILENCE_DB);
  });
});

describe('SpeechGate', () => {
  it('is clear before anything loud was heard', () => {
    const gate = new SpeechGate(-40, 2000);
    gate.sample(-60, 0);
    expect(gate.isClear(0)).toBe(true);
  });

  it('holds while talking and for the hold time after the last loud sample', () => {
    const gate = new SpeechGate(-40, 2000);
    expect(gate.sample(-30, 1000)).toBe(true);
    expect(gate.isClear(1000)).toBe(false);
    gate.sample(-60, 1500);
    expect(gate.msUntilClear(1500)).toBe(1500);
    expect(gate.isClear(2999)).toBe(false);
    expect(gate.isClear(3000)).toBe(true);
  });

  it('counts a level exactly at the threshold as talking', () => {
    const gate = new SpeechGate(-40, 1000);
    expect(gate.sample(-40, 0)).toBe(true);
    expect(gate.isClear(500)).toBe(false);
  });

  it('restarts the hold on every loud sample', () => {
    const gate = new SpeechGate(-40, 1000);
    gate.sample(-20, 0);
    gate.sample(-20, 900);
    gate.sample(-60, 950);
    expect(gate.isClear(1500)).toBe(false);
    expect(gate.isClear(1900)).toBe(true);
  });

  it('holds while the latest sample is loud even with a zero hold time', () => {
    const gate = new SpeechGate(-40, 0);
    gate.sample(-20, 0);
    expect(gate.isClear(0)).toBe(false);
    expect(gate.isClear(50)).toBe(false);
    gate.sample(-60, 50);
    expect(gate.isClear(50)).toBe(true);
  });

  it('applies a new configuration and forgets past speech on reset', () => {
    const gate = new SpeechGate(-40, 1000);
    gate.sample(-30, 0);
    gate.sample(-60, 0);
    gate.configure(-20, 5000);
    expect(gate.msUntilClear(0)).toBe(5000);
    gate.reset();
    expect(gate.isClear(0)).toBe(true);
  });
});
