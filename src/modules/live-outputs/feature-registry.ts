import type {
  LiveOutputConfig,
  LiveOutputControlAction,
  LiveOutputControlInput,
  LiveOutputFeatureDescriptor,
  LiveOutputKind,
  LiveOutputRuntimeStatus,
} from '../../shared/types.js';

export interface LiveOutputFeatureRuntime {
  status: LiveOutputRuntimeStatus;
  data: Record<string, unknown>;
}

export interface LiveOutputFeatureResult {
  status: LiveOutputRuntimeStatus;
  renderedText: string;
  nextTransitionAt: string | null;
  details?: Record<string, unknown>;
  completedNow?: boolean;
}

export interface LiveOutputFeature<TConfig extends LiveOutputConfig = LiveOutputConfig> {
  readonly descriptor: LiveOutputFeatureDescriptor;
  createRuntime(config: TConfig, now: number): LiveOutputFeatureRuntime;
  tick(config: TConfig, runtime: LiveOutputFeatureRuntime, now: number): LiveOutputFeatureResult | Promise<LiveOutputFeatureResult>;
  control?(config: TConfig, runtime: LiveOutputFeatureRuntime, input: LiveOutputControlInput, now: number): void | Promise<void>;
}

export class LiveOutputFeatureRegistry {
  private readonly features = new Map<LiveOutputKind, LiveOutputFeature>();

  register<TConfig extends LiveOutputConfig>(feature: LiveOutputFeature<TConfig>): void {
    const kind = feature.descriptor.kind;
    if (this.features.has(kind)) throw new Error(`Live output feature already registered: ${kind}`);
    this.features.set(kind, feature as LiveOutputFeature);
  }

  get(kind: LiveOutputKind): LiveOutputFeature | null {
    return this.features.get(kind) ?? null;
  }

  list(): LiveOutputFeature[] {
    return [...this.features.values()];
  }
}

export function descriptor(
  kind: LiveOutputKind,
  defaultId: string,
  defaultFileRelativePath: string,
  tokens: Array<[string, string, string]>,
  controls: LiveOutputControlAction[],
  singleton = true,
): LiveOutputFeatureDescriptor {
  return {
    kind,
    singleton,
    defaultId,
    defaultFileRelativePath,
    tokens: tokens.map(([token, description, example]) => ({ token, description, example })),
    controls,
  };
}
