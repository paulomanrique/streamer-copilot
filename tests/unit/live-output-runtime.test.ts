import { describe, expect, it } from 'vitest';

import { createDefaultChronoDownOutput, createDefaultTextRotatorOutput } from '../../src/modules/live-outputs/defaults.js';
import { chronoDownFeature } from '../../src/modules/live-outputs/features/timer-features.js';
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
});
