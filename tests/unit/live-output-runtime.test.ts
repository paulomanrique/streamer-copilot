import { describe, expect, it } from 'vitest';

import { createDefaultChronoDownOutput, createDefaultCountdownOutput, createDefaultPlayingNowOutput, createDefaultTextRotatorOutput } from '../../src/modules/live-outputs/defaults.js';
import { createPlayingNowFeature } from '../../src/modules/live-outputs/features/playing-now-feature.js';
import { chronoDownFeature, countdownFeature } from '../../src/modules/live-outputs/features/timer-features.js';
import { textRotatorFeature } from '../../src/modules/live-outputs/features/text-rotator-feature.js';

describe('live output runtimes', () => {
  it('completes a chrono-down once and resets cleanly', async () => {
    const config = { ...createDefaultChronoDownOutput(), enabled: true, initialSeconds: 2 };
    const runtime = chronoDownFeature.createRuntime(config, 1_000);

    await chronoDownFeature.control?.(config, runtime, { id: config.id, action: 'start' }, 1_000);
    const running = await chronoDownFeature.tick(config, runtime, 2_000);
    const completed = await chronoDownFeature.tick(config, runtime, 3_100);
    const stillCompleted = await chronoDownFeature.tick(config, runtime, 4_000);

    expect(running.renderedText).toBe('00:00:01');
    expect(completed).toMatchObject({ status: 'completed', renderedText: 'Chrono Down is done!', completedNow: true });
    expect(stillCompleted.completedNow).toBe(false);

    await chronoDownFeature.control?.(config, runtime, { id: config.id, action: 'reset' }, 5_000);
    expect((await chronoDownFeature.tick(config, runtime, 5_000)).renderedText).toBe('00:00:02');
  });

  it('rotates only enabled valid text lines', async () => {
    const config = {
      ...createDefaultTextRotatorOutput(),
      enabled: true,
      startOnProfileLoad: true,
      intervalSeconds: 1,
      lines: [
        { id: 'one', text: 'One', enabled: true, allowEmpty: false },
        { id: 'hidden', text: 'Hidden', enabled: false, allowEmpty: false },
        { id: 'two', text: 'Two', enabled: true, allowEmpty: false },
      ],
    };
    const runtime = textRotatorFeature.createRuntime(config, 0);
    expect((await textRotatorFeature.tick(config, runtime, 0)).renderedText).toBe('One');
    expect((await textRotatorFeature.tick(config, runtime, 1_100)).renderedText).toBe('Two');
  });

  it('moves a use-today countdown to the current date in its timezone', async () => {
    const now = Date.parse('2026-08-02T12:00:00.000Z');
    const config = {
      ...createDefaultCountdownOutput(),
      enabled: true,
      startOnProfileLoad: true,
      useTodayOnProfileLoad: true,
      timeZone: 'UTC',
      targetAt: '2030-01-10T13:30:00.000Z',
    };
    const runtime = countdownFeature.createRuntime(config, now);
    expect((await countdownFeature.tick(config, runtime, now)).renderedText).toBe('00:01:30:00');
    await countdownFeature.control?.(config, runtime, { id: config.id, action: 'start' }, now + 3_600_000);
    expect((await countdownFeature.tick(config, runtime, now + 3_600_000)).renderedText).toBe('00:00:30:00');
  });

  it('supports the documented Playing Now uppercase tokens', async () => {
    const config = {
      ...createDefaultPlayingNowOutput(),
      enabled: true,
      format: '$artist_upper — $song_upper — $album_upper',
    };
    const feature = createPlayingNowFeature(async () => ({
      sourceId: 'player', sourceLabel: 'Player', state: 'playing',
      artist: 'Artist', song: 'Song', album: 'Album', artworkPath: null,
      positionSeconds: 1, durationSeconds: 2,
    }));
    const runtime = feature.createRuntime(config, 0);
    expect((await feature.tick(config, runtime, 0)).renderedText).toBe('ARTIST — SONG — ALBUM');
  });
});
