import { describe, expect, it } from 'vitest';

import { liveOutputConfigSchema } from '../../src/shared/schemas.js';
import type { LiveOutputFeatureDescriptor, LiveOutputKind, PlatformStreamCapability } from '../../src/shared/types.js';
import { getLiveOutputsCopy } from '../../src/renderer/live-outputs/copy.js';
import { createDefaultLiveOutput } from '../../src/renderer/live-outputs/defaults.js';

const kinds: LiveOutputKind[] = [
  'time', 'date', 'countdown', 'chrono-down', 'chrono-up',
  'text-rotator', 'system-info', 'platform-live', 'playing-now',
];

function descriptor(kind: LiveOutputKind): LiveOutputFeatureDescriptor {
  return {
    kind,
    singleton: true,
    defaultId: kind,
    defaultFileRelativePath: `TextFiles/${kind}.txt`,
    tokens: [],
    controls: [],
  };
}

const platformCapabilities: PlatformStreamCapability[] = [{
  platformId: 'example',
  targets: [{ platformId: 'example', accountId: 'account', channelId: 'channel', label: 'Example channel' }],
  metrics: [{ id: 'viewers', label: 'Viewers', token: '$viewers', minimumRefreshSeconds: 10, defaultFileRelativePath: 'TextFiles/Viewers.txt' }],
  metadataReadable: false,
  mutableMetadataFields: [],
}];

describe('live-output renderer defaults', () => {
  it('builds schema-valid defaults for every registered kind', () => {
    for (const kind of kinds) {
      const value = createDefaultLiveOutput(descriptor(kind), platformCapabilities);
      expect(value, kind).not.toBeNull();
      expect(() => liveOutputConfigSchema.parse(value)).not.toThrow();
    }
  });

  it('requires provider capability before creating a platform output', () => {
    expect(createDefaultLiveOutput(descriptor('platform-live'), [])).toBeNull();
  });

  it('has pt-BR and en-US copy for all features and excludes Dynamic Files', () => {
    for (const language of ['pt-BR', 'en-US'] as const) {
      const copy = getLiveOutputsCopy(language);
      for (const kind of kinds) expect(copy.features[kind].label.length).toBeGreaterThan(0);
      expect(copy.channelMetadata.length).toBeGreaterThan(0);
      expect(copy.searchCategory.length).toBeGreaterThan(0);
      expect(copy.spotifyCredentials.length).toBeGreaterThan(0);
      expect(copy.testCredentials.length).toBeGreaterThan(0);
      expect(JSON.stringify(copy).toLowerCase()).not.toContain('dynamic files');
    }
  });
});
