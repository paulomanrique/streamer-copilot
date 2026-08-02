import type { LiveOutputFeatureRegistry } from './feature-registry.js';
import type { PlatformLiveMetricReader } from './features/platform-live-feature.js';
import type { PlayingNowReader } from './features/playing-now-feature.js';
import { chronoDownFeature, chronoUpFeature, countdownFeature } from './features/timer-features.js';
import { dateFeature, timeFeature } from './features/time-date-features.js';
import { textRotatorFeature } from './features/text-rotator-feature.js';
import { createSystemInfoFeature } from './features/system-info-feature.js';
import { createPlatformLiveFeature } from './features/platform-live-feature.js';
import { createPlayingNowFeature } from './features/playing-now-feature.js';

export function registerAllLiveOutputFeatures(
  registry: LiveOutputFeatureRegistry,
  dependencies: { readPlatformMetric: PlatformLiveMetricReader; readPlayingNow: PlayingNowReader },
): void {
  registry.register(timeFeature);
  registry.register(dateFeature);
  registry.register(countdownFeature);
  registry.register(chronoDownFeature);
  registry.register(chronoUpFeature);
  registry.register(textRotatorFeature);
  registry.register(createSystemInfoFeature());
  registry.register(createPlatformLiveFeature(dependencies.readPlatformMetric));
  registry.register(createPlayingNowFeature(dependencies.readPlayingNow));
}
