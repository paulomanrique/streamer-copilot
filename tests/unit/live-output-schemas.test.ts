import { describe, expect, it } from 'vitest';

import {
  liveOutputConfigSchema,
  liveOutputControlInputSchema,
  liveOutputsSettingsSchema,
} from '../../src/shared/schemas.js';

const destinations = {
  file: { enabled: true, relativePath: 'TextFiles/Time.txt' },
  browser: { enabled: true, style: {} },
};

describe('live output schemas', () => {
  it('accepts a portable time output and a third-party platform id', () => {
    const time = liveOutputConfigSchema.parse({
      id: 'time',
      kind: 'time',
      enabled: true,
      startOnProfileLoad: true,
      destinations,
      format: 'Time: $h:$m:$s',
      use24Hour: true,
      removeLeadingHourZero: false,
      timeZone: 'system',
    });
    const platform = liveOutputConfigSchema.parse({
      id: 'demo-viewers',
      kind: 'platform-live',
      enabled: true,
      startOnProfileLoad: true,
      destinations: {
        ...destinations,
        file: { enabled: true, relativePath: 'TextFiles/DemoViewerCount.txt' },
      },
      platformId: 'third-party-demo',
      accountId: 'account-1',
      channelId: 'channel-1',
      metricId: 'viewers',
      format: '$viewers',
      refreshSeconds: 10,
    });

    expect(time.kind).toBe('time');
    expect(platform.platformId).toBe('third-party-demo');
  });

  it('rejects absolute paths and profile traversal', () => {
    for (const relativePath of ['C:\\outside.txt', '/outside.txt', '../outside.txt', 'TextFiles/../outside.txt']) {
      expect(() => liveOutputConfigSchema.parse({
        id: 'time',
        kind: 'time',
        enabled: true,
        startOnProfileLoad: true,
        destinations: { ...destinations, file: { enabled: true, relativePath } },
        format: '$h:$m:$s',
        use24Hour: true,
        removeLeadingHourZero: false,
        timeZone: 'system',
      })).toThrow();
    }
  });

  it('requires a source for pinned playing-now and an amount for adjust', () => {
    expect(() => liveOutputConfigSchema.parse({
      id: 'playing-now',
      kind: 'playing-now',
      enabled: true,
      startOnProfileLoad: true,
      destinations: {
        ...destinations,
        file: { enabled: true, relativePath: 'TextFiles/TrackInfo.txt' },
      },
      format: '$artist - $song',
      noMediaText: '',
      sourceMode: 'pinned',
      sourceId: null,
      fallbackToSystemSession: true,
      truncate: { artist: 0, song: 0, album: 0 },
      writeSeparateFiles: true,
      writeJson: true,
      writeArtwork: true,
      overlayLayout: 'artwork-left',
      showProgress: true,
      spotifyEnrichmentEnabled: false,
    })).toThrow();
    expect(() => liveOutputControlInputSchema.parse({ id: 'chrono-up', action: 'adjust' })).toThrow();
  });

  it('validates the versioned settings envelope', () => {
    const settings = liveOutputsSettingsSchema.parse({
      schemaVersion: 1,
      hotkeysEnabled: false,
      hotkeys: [],
      outputs: [],
      metadataPresets: [],
    });

    expect(settings.schemaVersion).toBe(1);
  });
});
