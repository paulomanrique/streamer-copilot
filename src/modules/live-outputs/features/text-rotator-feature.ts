import type { LiveOutputControlInput, TextRotatorLiveOutputConfig } from '../../../shared/types.js';
import type { LiveOutputFeature, LiveOutputFeatureRuntime } from '../feature-registry.js';
import { descriptor } from '../feature-registry.js';

interface TextRuntimeData {
  order: number[];
  position: number;
  nextAt: number;
}

function data(runtime: LiveOutputFeatureRuntime): TextRuntimeData {
  return runtime.data as unknown as TextRuntimeData;
}

function enabledIndexes(config: TextRotatorLiveOutputConfig): number[] {
  return config.lines.flatMap((line, index) => line.enabled && (line.allowEmpty || line.text.length > 0) ? [index] : []);
}

function shuffled(values: number[]): number[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function buildOrder(config: TextRotatorLiveOutputConfig): number[] {
  const indexes = enabledIndexes(config);
  return config.order === 'shuffle' ? shuffled(indexes) : indexes;
}

function move(config: TextRotatorLiveOutputConfig, runtime: LiveOutputFeatureRuntime, delta: number, now: number): void {
  const state = data(runtime);
  if (state.order.length === 0) return;
  const next = state.position + delta;
  if (config.loop) state.position = (next + state.order.length) % state.order.length;
  else state.position = Math.max(0, Math.min(state.order.length - 1, next));
  state.nextAt = now + config.intervalSeconds * 1_000;
}

export const textRotatorFeature: LiveOutputFeature<TextRotatorLiveOutputConfig> = {
  descriptor: descriptor('text-rotator', 'text-rotator', 'TextFiles/LineChangerExt.txt', [], [
    'start', 'pause', 'resume', 'stop', 'reset', 'previous', 'next', 'shuffle',
  ]),
  createRuntime(config, now) {
    return {
      status: !config.enabled ? 'disabled' : (config.startOnProfileLoad ? 'running' : 'ready'),
      data: { order: buildOrder(config), position: 0, nextAt: now + config.intervalSeconds * 1_000 },
    };
  },
  tick(config, runtime, now) {
    if (!config.enabled) {
      runtime.status = 'disabled';
      return { status: 'disabled', renderedText: '', nextTransitionAt: null, details: { currentIndex: null, nextIndex: null } };
    }
    const state = data(runtime);
    const valid = enabledIndexes(config);
    if (valid.length === 0) {
      runtime.status = config.enabled ? 'ready' : 'disabled';
      return { status: runtime.status, renderedText: '', nextTransitionAt: null, details: { currentIndex: null, nextIndex: null } };
    }
    if (state.order.length !== valid.length || state.order.some((index) => !valid.includes(index))) {
      state.order = buildOrder(config);
      state.position = Math.min(state.position, Math.max(0, state.order.length - 1));
    }
    if (runtime.status === 'running' && now >= state.nextAt) move(config, runtime, 1, now);
    const currentIndex = state.order[state.position] ?? valid[0];
    const nextPosition = config.loop ? (state.position + 1) % state.order.length : Math.min(state.order.length - 1, state.position + 1);
    const nextIndex = state.order[nextPosition] ?? currentIndex;
    return {
      status: runtime.status,
      renderedText: config.lines[currentIndex]?.text ?? '',
      nextTransitionAt: runtime.status === 'running' ? new Date(state.nextAt).toISOString() : null,
      details: { currentIndex, nextIndex, currentLineId: config.lines[currentIndex]?.id ?? null },
    };
  },
  control(config, runtime, input: LiveOutputControlInput, now) {
    const state = data(runtime);
    switch (input.action) {
      case 'start':
      case 'resume':
      case 'play':
        runtime.status = 'running';
        state.nextAt = now + config.intervalSeconds * 1_000;
        break;
      case 'pause':
        runtime.status = 'paused';
        break;
      case 'stop':
      case 'reset':
        runtime.status = 'ready';
        state.order = buildOrder(config);
        state.position = 0;
        state.nextAt = now + config.intervalSeconds * 1_000;
        break;
      case 'previous':
        move(config, runtime, -1, now);
        break;
      case 'next':
        move(config, runtime, 1, now);
        break;
      case 'shuffle':
        state.order = shuffled(enabledIndexes(config));
        state.position = 0;
        state.nextAt = now + config.intervalSeconds * 1_000;
        break;
      default:
        break;
    }
  },
};
