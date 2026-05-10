import type { MusicPlayCommand, MusicPlayerEvent } from '../shared/types.js';
import { MusicStreamResolver } from './music-stream-resolver.js';
import type { OverlayServer } from './overlay-server.js';

interface NowPlayingPayload {
  itemId: string;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  requestedBy: string | null;
  durationSeconds: number;
  state: 'playing' | 'paused' | 'idle';
  streamUrl: string | null;
  volume: number;
}

/**
 * R4: state-machine music player. Replaces the old WebContentsView + iframe
 * approach. The player itself does NOT produce audio — the canonical audio
 * source is the /now-playing browser source in OBS, driven over WebSocket
 * via OverlayServer. This isolates music in a separate OBS source so the
 * streamer can route it to a track that's excluded from the live broadcast
 * (avoids copyright strikes).
 */
export class MusicPlayer {
  private currentItemId: string | null = null;
  private currentVolume = 0.8;
  private currentVideoId: string | null = null;
  private currentTitle: string | null = null;
  private currentThumbnail: string | null = null;
  private currentRequestedBy: string | null = null;
  private currentDurationSeconds = 0;
  private endedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly overlayServer: OverlayServer,
    private readonly resolver: MusicStreamResolver,
    private readonly onEvent: (event: MusicPlayerEvent) => void,
  ) {
    // When a /now-playing browser source connects, re-publish the current
    // state so it picks up the active track immediately.
    this.overlayServer.onClientsChange('now-playing', () => {
      if (this.currentItemId) void this.publishState('playing');
    });
  }

  hasBrowserSource(): boolean {
    return this.overlayServer.hasClients('now-playing');
  }

  async play(cmd: MusicPlayCommand & { thumbnailUrl?: string | null; requestedBy?: string | null; durationSeconds?: number }): Promise<void> {
    this.clearEndedTimer();
    this.currentItemId = cmd.itemId;
    this.currentVideoId = cmd.videoId;
    this.currentTitle = cmd.title;
    this.currentVolume = cmd.volume;
    this.currentThumbnail = cmd.thumbnailUrl ?? null;
    this.currentRequestedBy = cmd.requestedBy ?? null;
    this.currentDurationSeconds = cmd.durationSeconds ?? 0;

    let streamUrl: string | null = null;
    try {
      streamUrl = await this.resolver.resolveAudioUrl(cmd.videoId);
    } catch (cause) {
      console.warn('[music-player] Failed to resolve stream URL', cause);
      this.onEvent({ type: 'error', itemId: cmd.itemId, errorCode: -1 });
      return;
    }

    void this.publishState('playing', streamUrl);

    // Without a real player we can't observe the actual end, so we schedule a
    // soft-ended timer based on the track duration. The renderer state becomes
    // accurate as soon as the OBS source plays through; we just need a
    // fallback for when there is no listener.
    if (this.currentDurationSeconds > 0) {
      this.endedTimer = setTimeout(() => {
        if (this.currentItemId === cmd.itemId) this.onEvent({ type: 'ended', itemId: cmd.itemId });
      }, (this.currentDurationSeconds + 2) * 1000);
    }
  }

  setVolume(volume: number): void {
    this.currentVolume = Math.max(0, Math.min(1, volume));
    if (this.currentItemId) void this.publishState('playing');
  }

  stop(): void {
    this.clearEndedTimer();
    this.currentItemId = null;
    this.currentVideoId = null;
    this.currentTitle = null;
    this.currentThumbnail = null;
    this.currentRequestedBy = null;
    this.currentDurationSeconds = 0;
    void this.publishState('idle', null);
  }

  private async publishState(state: NowPlayingPayload['state'], streamUrl?: string | null): Promise<void> {
    if (!this.currentItemId || state === 'idle') {
      this.overlayServer.publish('now-playing', {
        currentItem: null,
        streamUrl: null,
        volume: this.currentVolume,
        isPlaying: false,
      });
      return;
    }

    let url = streamUrl;
    if (url === undefined && this.currentVideoId) {
      try { url = await this.resolver.resolveAudioUrl(this.currentVideoId); }
      catch { url = null; }
    }

    this.overlayServer.publish('now-playing', {
      currentItem: {
        id: this.currentItemId,
        videoId: this.currentVideoId,
        title: this.currentTitle ?? 'Untitled',
        thumbnailUrl: this.currentThumbnail,
        requestedBy: this.currentRequestedBy,
        durationSeconds: this.currentDurationSeconds,
      },
      streamUrl: url ?? null,
      volume: this.currentVolume,
      isPlaying: state === 'playing',
    });
  }

  private clearEndedTimer(): void {
    if (this.endedTimer) { clearTimeout(this.endedTimer); this.endedTimer = null; }
  }
}
