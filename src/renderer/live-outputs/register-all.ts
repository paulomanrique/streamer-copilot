import {
  ChronoDownEditor,
  ChronoUpEditor,
  CountdownEditor,
  DateEditor,
  PlatformLiveEditor,
  PlayingNowEditor,
  SystemInfoEditor,
  TextRotatorEditor,
  TimeEditor,
} from './feature-editors.js';
import { registerLiveOutputFeature } from './registry.js';

registerLiveOutputFeature({ kind: 'time', category: 'clock', icon: '◷', Editor: TimeEditor });
registerLiveOutputFeature({ kind: 'date', category: 'clock', icon: '▣', Editor: DateEditor });
registerLiveOutputFeature({ kind: 'countdown', category: 'timers', icon: '⌛', Editor: CountdownEditor });
registerLiveOutputFeature({ kind: 'chrono-down', category: 'timers', icon: '↘', Editor: ChronoDownEditor });
registerLiveOutputFeature({ kind: 'chrono-up', category: 'timers', icon: '↗', Editor: ChronoUpEditor });
registerLiveOutputFeature({ kind: 'text-rotator', category: 'content', icon: '≡', Editor: TextRotatorEditor });
registerLiveOutputFeature({ kind: 'system-info', category: 'telemetry', icon: '⌁', Editor: SystemInfoEditor });
registerLiveOutputFeature({ kind: 'platform-live', category: 'telemetry', icon: '◉', Editor: PlatformLiveEditor });
registerLiveOutputFeature({ kind: 'playing-now', category: 'media', icon: '♪', Editor: PlayingNowEditor });

