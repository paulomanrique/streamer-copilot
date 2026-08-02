import type { PlatformLiveOutputConfig } from '../../../shared/types.js';
import type { LiveOutputFeature, LiveOutputFeatureRuntime } from '../feature-registry.js';
import { descriptor } from '../feature-registry.js';
import { applyTemplate } from '../template-engine.js';

export interface PlatformLiveMetricSample {
  token: string;
  value: string;
  details: Record<string, unknown>;
}

export type PlatformLiveMetricReader = (config: PlatformLiveOutputConfig) => Promise<PlatformLiveMetricSample>;

interface PlatformRuntimeData {
  dueAt: number;
  sample: PlatformLiveMetricSample | null;
  error: string | null;
}

function data(runtime: LiveOutputFeatureRuntime): PlatformRuntimeData {
  return runtime.data as unknown as PlatformRuntimeData;
}

export function createPlatformLiveFeature(reader: PlatformLiveMetricReader): LiveOutputFeature<PlatformLiveOutputConfig> {
  return {
    descriptor: descriptor('platform-live', 'platform-live', 'TextFiles/ViewerCount.txt', [
      ['$viewers', 'Current viewers', '42'],
    ], [], false),
    createRuntime(config, now) {
      return { status: config.enabled ? 'ready' : 'disabled', data: { dueAt: now, sample: null, error: null } };
    },
    async tick(config, runtime, now) {
      const state = data(runtime);
      if (!config.enabled) return { status: 'disabled', renderedText: '', nextTransitionAt: null, details: {} };
      if (!state.sample || now >= state.dueAt) {
        try {
          state.sample = await reader(config);
          state.error = null;
        } catch (cause) {
          state.error = cause instanceof Error ? cause.message : String(cause);
        }
        state.dueAt = now + config.refreshSeconds * 1_000;
      }
      if (!state.sample) {
        return {
          status: state.error ? 'degraded' : 'ready',
          renderedText: '',
          nextTransitionAt: new Date(state.dueAt).toISOString(),
          details: { error: state.error },
        };
      }
      return {
        status: state.error ? 'degraded' : 'running',
        renderedText: applyTemplate(config.format, { [state.sample.token]: state.sample.value }),
        nextTransitionAt: new Date(state.dueAt).toISOString(),
        details: { ...state.sample.details, error: state.error },
      };
    },
  };
}
