import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LiveOutputsService } from '../../src/modules/live-outputs/live-outputs-service.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('LiveOutputsService metadata presets', () => {
  it('persists, updates and deletes profile-scoped presets', async () => {
    const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'streamer-copilot-live-outputs-'));
    directories.push(profileDirectory);
    const service = new LiveOutputsService({
      profileDirectory,
      overlayBaseUrl: () => null,
      overlayServerStatus: () => 'stopped',
      browserClientCount: () => 0,
      publishOverlay: () => undefined,
      onUpdate: () => undefined,
      playSound: () => undefined,
      readPlatformMetric: async () => ({ token: '$viewers', value: '0', details: {} }),
      readPlayingNow: async () => ({
        sourceId: null, sourceLabel: null, state: 'idle', artist: '', song: '', album: '',
        artworkPath: null, positionSeconds: null, durationSeconds: null,
      }),
    });
    await service.initialize();

    const preset = { id: 'music', platformId: 'demo', name: 'Music', title: 'Live music', categoryId: '10', categoryName: 'Music' };
    expect((await service.saveMetadataPreset(preset)).ok).toBe(true);
    expect(service.getSnapshot().settings.metadataPresets).toEqual([preset]);
    expect((await service.saveMetadataPreset({ ...preset, title: 'New title' })).ok).toBe(true);
    expect(service.getSnapshot().settings.metadataPresets[0]?.title).toBe('New title');
    expect((await service.deleteMetadataPreset({ id: preset.id })).ok).toBe(true);
    expect(service.getSnapshot().settings.metadataPresets).toEqual([]);

    const playingNow = service.getSnapshot().settings.outputs.find((output) => output.kind === 'playing-now');
    expect(playingNow?.kind).toBe('playing-now');
    if (playingNow?.kind === 'playing-now') {
      const result = await service.upsert({
        ...playingNow,
        enabled: true,
        destinations: { ...playingNow.destinations, file: { ...playingNow.destinations.file, enabled: false } },
      });
      expect(result.ok).toBe(true);
      const metadata = JSON.parse(await readFile(path.join(profileDirectory, 'Data', 'track-info.json'), 'utf-8')) as { state: string };
      expect(metadata.state).toBe('idle');
    }

    const persisted = JSON.parse(await readFile(path.join(profileDirectory, 'live-outputs.json'), 'utf-8')) as { metadataPresets: unknown[] };
    expect(persisted.metadataPresets).toEqual([]);
    await service.dispose();
  });
});
