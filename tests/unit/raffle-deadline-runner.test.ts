import { describe, expect, it, vi } from 'vitest';

import { RaffleDeadlineRunner } from '../../src/modules/raffles/raffle-deadline-runner.js';

describe('RaffleDeadlineRunner', () => {
  it('fires immediately and then on each interval', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const runner = new RaffleDeadlineRunner({ onTick, intervalMs: 500 });

    runner.start();
    expect(onTick).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_500);
    expect(onTick).toHaveBeenCalledTimes(4);

    runner.stop();
    vi.advanceTimersByTime(1_000);
    expect(onTick).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
});
