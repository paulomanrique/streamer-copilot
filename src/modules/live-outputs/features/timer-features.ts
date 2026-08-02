import type {
  ChronoDownLiveOutputConfig,
  ChronoUpLiveOutputConfig,
  CountdownLiveOutputConfig,
  LiveOutputControlInput,
  LiveOutputRuntimeStatus,
} from '../../../shared/types.js';
import type { LiveOutputFeature, LiveOutputFeatureResult, LiveOutputFeatureRuntime } from '../feature-registry.js';
import { descriptor } from '../feature-registry.js';
import { renderDuration } from '../template-engine.js';

interface TimerData {
  valueAtAnchor: number;
  anchorAt: number;
  completionEmitted: boolean;
}

function timerData(runtime: LiveOutputFeatureRuntime): TimerData {
  return runtime.data as unknown as TimerData;
}

function currentValue(runtime: LiveOutputFeatureRuntime, now: number, direction: 'down' | 'up'): number {
  const data = timerData(runtime);
  if (runtime.status !== 'running') return data.valueAtAnchor;
  const elapsed = Math.max(0, now - data.anchorAt);
  return direction === 'down' ? Math.max(0, data.valueAtAnchor - elapsed) : data.valueAtAnchor + elapsed;
}

function setValue(runtime: LiveOutputFeatureRuntime, value: number, now: number): void {
  const data = timerData(runtime);
  data.valueAtAnchor = Math.max(0, value);
  data.anchorAt = now;
  if (value > 0) data.completionEmitted = false;
}

function initialStatus(enabled: boolean, startOnProfileLoad: boolean): LiveOutputRuntimeStatus {
  if (!enabled) return 'disabled';
  return startOnProfileLoad ? 'running' : 'ready';
}

function controlTimer(
  runtime: LiveOutputFeatureRuntime,
  input: LiveOutputControlInput,
  now: number,
  direction: 'down' | 'up',
  resetValue: number,
  resetOnStart = false,
): void {
  if (runtime.status === 'disabled') return;
  const value = currentValue(runtime, now, direction);
  switch (input.action) {
    case 'start':
    case 'play':
      setValue(runtime, resetOnStart ? resetValue : value, now);
      runtime.status = 'running';
      break;
    case 'resume':
      setValue(runtime, value, now);
      runtime.status = 'running';
      break;
    case 'pause':
      setValue(runtime, value, now);
      runtime.status = 'paused';
      break;
    case 'stop':
    case 'reset':
      setValue(runtime, resetValue, now);
      runtime.status = 'ready';
      break;
    case 'adjust':
      setValue(runtime, value + (input.amountSeconds ?? 0) * 1_000, now);
      if (runtime.status === 'completed') runtime.status = 'paused';
      break;
    default:
      break;
  }
}

function renderDown(
  config: CountdownLiveOutputConfig | ChronoDownLiveOutputConfig,
  runtime: LiveOutputFeatureRuntime,
  now: number,
): LiveOutputFeatureResult {
  const value = currentValue(runtime, now, 'down');
  const data = timerData(runtime);
  let completedNow = false;
  if (runtime.status === 'running' && value <= 0) {
    runtime.status = 'completed';
    setValue(runtime, 0, now);
    if (!data.completionEmitted) {
      data.completionEmitted = true;
      completedNow = true;
    }
  }
  return {
    status: runtime.status,
    renderedText: runtime.status === 'completed'
      ? config.doneText
      : renderDuration(config.format, value, {
        doubleDigits: config.doubleDigits,
        omitLeadingZeroUnits: config.omitLeadingZeroUnits,
        useDays: config.kind === 'countdown',
      }),
    nextTransitionAt: runtime.status === 'running' ? new Date(now + Math.min(1_000, Math.max(1, value))).toISOString() : null,
    details: { remainingMilliseconds: value },
    completedNow,
  };
}

export const countdownFeature: LiveOutputFeature<CountdownLiveOutputConfig> = {
  descriptor: descriptor('countdown', 'countdown', 'TextFiles/Countdown.txt', [
    ['$d', 'Days', '02'], ['$h', 'Hours', '04'], ['$m', 'Minutes', '15'], ['$s', 'Seconds', '09'], ['$ms', 'Milliseconds', '125'],
  ], ['start', 'pause', 'resume', 'stop', 'reset', 'adjust']),
  createRuntime(config, now) {
    const remaining = Math.max(0, Date.parse(config.targetAt) - now);
    return {
      status: initialStatus(config.enabled, config.startOnProfileLoad),
      data: { valueAtAnchor: remaining, anchorAt: now, completionEmitted: false },
    };
  },
  tick: renderDown,
  control(config, runtime, input, now) {
    const resetValue = Math.max(0, Date.parse(config.targetAt) - now);
    controlTimer(runtime, input, now, 'down', resetValue);
  },
};

export const chronoDownFeature: LiveOutputFeature<ChronoDownLiveOutputConfig> = {
  descriptor: descriptor('chrono-down', 'chrono-down', 'TextFiles/ChronoDown.txt', [
    ['$h', 'Hours', '01'], ['$m', 'Minutes', '05'], ['$s', 'Seconds', '09'],
  ], ['start', 'pause', 'resume', 'stop', 'reset', 'adjust']),
  createRuntime(config, now) {
    return {
      status: initialStatus(config.enabled, config.startOnProfileLoad),
      data: { valueAtAnchor: config.initialSeconds * 1_000, anchorAt: now, completionEmitted: false },
    };
  },
  tick: renderDown,
  control(config, runtime, input, now) {
    controlTimer(runtime, input, now, 'down', config.initialSeconds * 1_000);
  },
};

export const chronoUpFeature: LiveOutputFeature<ChronoUpLiveOutputConfig> = {
  descriptor: descriptor('chrono-up', 'chrono-up', 'TextFiles/ChronoUp.txt', [
    ['$d', 'Days', '02'], ['$h', 'Hours', '49'], ['$m', 'Minutes', '05'], ['$s', 'Seconds', '09'], ['$totalminutes', 'Total minutes', '2945'],
  ], ['start', 'pause', 'resume', 'stop', 'reset', 'adjust']),
  createRuntime(config, now) {
    return {
      status: initialStatus(config.enabled, config.startOnProfileLoad),
      data: { valueAtAnchor: config.initialSeconds * 1_000, anchorAt: now, completionEmitted: false },
    };
  },
  tick(config, runtime, now) {
    const value = currentValue(runtime, now, 'up');
    return {
      status: runtime.status,
      renderedText: renderDuration(config.format, value, {
        doubleDigits: true,
        omitLeadingZeroUnits: false,
        useDays: config.useDays,
      }),
      nextTransitionAt: runtime.status === 'running' ? new Date(now + 1_000).toISOString() : null,
      details: { elapsedMilliseconds: value },
    };
  },
  control(config, runtime, input, now) {
    controlTimer(runtime, input, now, 'up', config.initialSeconds * 1_000, config.resetOnStart);
  },
};

export function toggleChrono(runtime: LiveOutputFeatureRuntime, now: number, direction: 'down' | 'up'): LiveOutputControlInput {
  return { id: '', action: runtime.status === 'running' ? 'pause' : (runtime.status === 'paused' ? 'resume' : 'start'), amountSeconds: direction === 'down' ? -1 : 1 };
}
