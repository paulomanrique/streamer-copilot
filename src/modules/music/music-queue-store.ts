import type { MusicQueueItem, PlatformId } from '../../shared/types.js';
import { JsonSettingsStore } from '../base/settings-store.js';

const SETTINGS_FILE = 'music-queue.json';

interface FileShape {
  /**
   * Persisted queue. When the service was last shut down with something
   * playing, that item is saved as `queue[0]` so it resumes as the next pick
   * when `playNext()` fires — we don't try to auto-resume playback on app
   * startup because the browser-source autoplay flow needs an explicit
   * trigger anyway.
   */
  queue: MusicQueueItem[];
}

function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === 'string' && value.length > 0;
}

function isQueueItem(value: unknown): value is MusicQueueItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.videoId === 'string' &&
    typeof v.title === 'string' &&
    typeof v.durationSeconds === 'number' &&
    (v.thumbnailUrl === null || typeof v.thumbnailUrl === 'string') &&
    typeof v.requestedBy === 'string' &&
    isPlatformId(v.platform) &&
    typeof v.requestedAt === 'string'
  );
}

/**
 * Per-profile persistence for the music-request queue.
 *
 * The whole point is that a streamer can quit the app (or have it crash)
 * mid-stream and resume the same playlist on relaunch. Cooldowns and
 * `isPlaying` state are intentionally NOT persisted — they're session
 * concepts; only the queued songs survive.
 */
export class MusicQueueStore extends JsonSettingsStore<FileShape> {
  constructor(profileDirectory: string) {
    super(profileDirectory, SETTINGS_FILE);
  }

  protected defaults(): FileShape {
    return { queue: [] };
  }

  protected parse(raw: Record<string, unknown>): FileShape {
    const rawQueue = Array.isArray(raw.queue) ? raw.queue : [];
    const queue = rawQueue.filter(isQueueItem);
    return { queue };
  }

  async loadQueue(): Promise<MusicQueueItem[]> {
    const data = await this.load();
    return data.queue;
  }

  async saveQueue(queue: MusicQueueItem[]): Promise<void> {
    await this.save({ queue });
  }
}
