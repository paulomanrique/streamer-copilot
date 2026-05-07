import { createRequire } from 'node:module';

interface ResolvedStream {
  url: string;
  expiresAt: number; // ms epoch
}

interface YtdlFormat {
  url: string;
  hasAudio?: boolean;
  hasVideo?: boolean;
  audioBitrate?: number | null;
  bitrate?: number | null;
  contentLength?: string;
}

interface YtdlInfo {
  formats?: YtdlFormat[];
}

interface YtdlModule {
  getInfo: (videoId: string) => Promise<YtdlInfo>;
  chooseFormat?: (formats: YtdlFormat[], options: { quality: string; filter: string }) => YtdlFormat | null;
}

/**
 * R4: resolves a YouTube videoId to a directly-playable audio stream URL via
 * @distube/ytdl-core. URLs from YouTube embed an `expire` query parameter; we
 * cache up to that expiry and refresh on demand.
 */
export class MusicStreamResolver {
  private readonly cache = new Map<string, ResolvedStream>();
  private ytdl: YtdlModule | null = null;

  async resolveAudioUrl(videoId: string): Promise<string> {
    const now = Date.now();
    const cached = this.cache.get(videoId);
    if (cached && cached.expiresAt - now > 30_000) return cached.url;

    const ytdl = this.loadYtdl();
    if (!ytdl) throw new Error('ytdl-core is not installed; cannot resolve YouTube stream URL');

    const info = await ytdl.getInfo(videoId);
    const formats = info.formats ?? [];
    // Audio-only with the highest audio bitrate.
    const audioOnly = formats
      .filter((f) => f.hasAudio && !f.hasVideo)
      .sort((a, b) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0));
    const best = audioOnly[0] ?? formats.find((f) => f.hasAudio);
    if (!best?.url) throw new Error(`No playable audio format found for ${videoId}`);

    // Try to read the expire timestamp from the URL; fall back to 4 minutes.
    let expiresAt = now + 4 * 60 * 1000;
    try {
      const url = new URL(best.url);
      const expire = url.searchParams.get('expire');
      if (expire) {
        const seconds = Number(expire);
        if (Number.isFinite(seconds)) expiresAt = seconds * 1000;
      }
    } catch { /* ignore parse errors */ }

    this.cache.set(videoId, { url: best.url, expiresAt });
    return best.url;
  }

  invalidate(videoId: string): void {
    this.cache.delete(videoId);
  }

  private loadYtdl(): YtdlModule | null {
    if (this.ytdl) return this.ytdl;
    try {
      const requireFn = createRequire(import.meta.url);
      this.ytdl = requireFn('@distube/ytdl-core') as YtdlModule;
      return this.ytdl;
    } catch {
      return null;
    }
  }
}
