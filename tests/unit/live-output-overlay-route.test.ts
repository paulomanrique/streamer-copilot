import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { OverlayServer } from '../../src/main/overlay-server.js';
import { LiveOutputsService } from '../../src/modules/live-outputs/live-outputs-service.js';
import { createLiveOutputsOverlayHandler } from '../../src/modules/live-outputs/overlay-extension.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('live-output overlay route', () => {
  it('serves module pages without replacing the music-request now-playing route', async () => {
    const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'streamer-copilot-overlay-'));
    directories.push(profileDirectory);
    const overlay = new OverlayServer({
      port: 0,
      getOverlayState: () => null,
      getPollsOverlayState: () => null,
      getChatSnapshot: () => ({ messages: [], events: [] }),
    });
    const service = new LiveOutputsService({
      profileDirectory,
      overlayBaseUrl: () => {
        const { status, port } = overlay.getStatus();
        return status === 'running' ? `http://127.0.0.1:${port}` : null;
      },
      overlayServerStatus: () => overlay.getStatus().status,
      browserClientCount: (topic) => overlay.clientCount(topic),
      publishOverlay: (topic, payload) => overlay.publish(topic, payload),
      onUpdate: () => undefined,
      playSound: () => undefined,
      readPlatformMetric: async () => ({ token: '$viewers', value: '0', details: {} }),
      readPlayingNow: async () => ({
        sourceId: null, sourceLabel: null, state: 'idle', artist: '', song: '', album: '',
        artworkPath: null, positionSeconds: null, durationSeconds: null,
      }),
    });
    await service.initialize();
    const unregister = overlay.registerRouteHandler(createLiveOutputsOverlayHandler(service));
    await overlay.start();

    try {
      const base = `http://127.0.0.1:${overlay.getStatus().port}`;
      const [page, state, musicRequestPage] = await Promise.all([
        fetch(`${base}/live-outputs/time`),
        fetch(`${base}/live-outputs/time/state`),
        fetch(`${base}/now-playing`),
      ]);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('data-output-id="time"');
      expect(state.status).toBe(200);
      await expect(state.json()).resolves.toMatchObject({ id: 'time', kind: 'time', status: 'disabled' });
      expect(musicRequestPage.status).toBe(200);
      expect(await musicRequestPage.text()).toContain('now-playing');
    } finally {
      unregister();
      await service.dispose();
      await overlay.stop();
    }
  });
});
