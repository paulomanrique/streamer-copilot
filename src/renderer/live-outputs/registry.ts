import type { ComponentType } from 'react';

import type {
  LiveOutputConfig,
  LiveOutputFeatureDescriptor,
  LiveOutputKind,
  LiveOutputRuntimeSnapshot,
  PlatformStreamCapability,
  PlayingNowSourceCapability,
} from '../../shared/types.js';
import type { FeatureCategory } from './copy.js';

export interface LiveOutputEditorProps<T extends LiveOutputConfig = LiveOutputConfig> {
  config: T;
  descriptor: LiveOutputFeatureDescriptor;
  runtime: LiveOutputRuntimeSnapshot | null;
  playingNowSources: PlayingNowSourceCapability[];
  platformCapabilities: PlatformStreamCapability[];
  onChange: (next: T) => void;
  onPickSound: () => Promise<void>;
  onTestPlayingNowSource: (sourceId: string) => Promise<string>;
}

export interface RendererLiveOutputFeature {
  kind: LiveOutputKind;
  category: FeatureCategory;
  icon: string;
  Editor: ComponentType<LiveOutputEditorProps>;
}

const features = new Map<LiveOutputKind, RendererLiveOutputFeature>();

export function registerLiveOutputFeature(feature: RendererLiveOutputFeature): void {
  features.set(feature.kind, feature);
}

export function getLiveOutputFeature(kind: LiveOutputKind): RendererLiveOutputFeature | null {
  return features.get(kind) ?? null;
}

export function listLiveOutputFeatures(): RendererLiveOutputFeature[] {
  return [...features.values()];
}

