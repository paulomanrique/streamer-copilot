import { Constants, Innertube } from 'youtubei.js';

/** Clients tried in order. Only clients whose audio URLs come back already
 *  deciphered are listed — we skip fetching the player JS on purpose. */
const CLIENTS = ['VISIONOS', 'ANDROID_VR', 'IOS'] as const;
type StreamClient = typeof CLIENTS[number];

export interface ResolvedAudioStream {
  url: string;
  /** googlevideo cross-checks the UA against the client that signed the URL,
   *  so the audio proxy must send this exact value. */
  userAgent: string;
}

interface CachedStream extends ResolvedAudioStream {
  expiresAt: number; // ms epoch
}

interface AdaptiveFormat {
  url?: string;
  mime_type?: string;
  bitrate?: number;
  content_length?: number;
}

const PROBE_BYTES = 64 * 1024;
const PROBE_TIMEOUT_MS = 8_000;

/**
 * R4: resolves a YouTube videoId to a directly-playable audio stream URL.
 *
 * Uses `youtubei.js` (same lib as the chat scraper).
 *
 * Client choice: YouTube's anti-bot keeps closing clients one at a time.
 * WEB/ANDROID need a PoToken we can't synthesize, and without one googlevideo
 * serves only the first ~1MB of a file and then 403s — ANDROID_VR fell into
 * that bucket in Sep 2026 (every request past ~1MB, and every request
 * without a bounded Range, returned 403). VISIONOS still serves full files
 * with any Range, so it goes first and the others remain as fallbacks.
 *
 * Because the cap only shows up past the first ~1MB, a successful response
 * from the start of the file proves nothing. Each candidate is verified by
 * fetching the file's last 64KB; the first client that passes wins. When
 * YouTube closes VISIONOS too, the natural next steps are TV_EMBEDDED with
 * OAuth, or running bgutils-js inside a hidden WebContentsView to generate a
 * real PoToken.
 *
 * Anonymous on purpose: authenticated cookies trigger SAPISIDHASH on the
 * Authorization header, and the mobile-client endpoints reject that (HTTP
 * 400). Cookies were tried; they made things worse, not better.
 *
 * googlevideo URLs carry an `expire` query param; we cache the resolved
 * URL until that timestamp and re-resolve on the next request after.
 */
export class MusicStreamResolver {
  private readonly cache = new Map<string, CachedStream>();
  private innertube: Innertube | null = null;

  async resolveAudioStream(videoId: string): Promise<ResolvedAudioStream> {
    const now = Date.now();
    const cached = this.cache.get(videoId);
    if (cached && cached.expiresAt - now > 30_000) return { url: cached.url, userAgent: cached.userAgent };

    const failures: string[] = [];
    for (const client of CLIENTS) {
      try {
        const stream = await this.resolveWithClient(videoId, client);
        this.cache.set(videoId, { ...stream, expiresAt: parseExpiry(stream.url) ?? now + 4 * 60 * 1000 });
        return stream;
      } catch (cause) {
        failures.push(`${client}: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }
    throw new Error(`No playable audio stream for ${videoId} (${failures.join('; ')})`);
  }

  invalidate(videoId: string): void {
    this.cache.delete(videoId);
  }

  private async resolveWithClient(videoId: string, client: StreamClient): Promise<ResolvedAudioStream> {
    const yt = await this.getInnertube();
    const info = await yt.getBasicInfo(videoId, { client });
    const formats = (info.streaming_data?.adaptive_formats ?? []) as AdaptiveFormat[];
    const audioFormats = formats.filter((f) => f.mime_type?.startsWith('audio') && f.url);
    if (audioFormats.length === 0) {
      throw new Error(`no audio formats with a direct URL (${formats.length} formats total)`);
    }
    audioFormats.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    const format = audioFormats[0];
    const stream = { url: format.url!, userAgent: Constants.CLIENTS[client].USER_AGENT };
    await probeTail(stream, format.content_length ?? 0);
    return stream;
  }

  /** Lazy-singleton Innertube — anonymous, no player JS fetched (every
   *  client in CLIENTS returns audio URLs already deciphered). */
  private async getInnertube(): Promise<Innertube> {
    if (this.innertube) return this.innertube;
    this.innertube = await Innertube.create({
      retrieve_player: false,
    });
    return this.innertube;
  }
}

/** Fetches the last 64KB of the stream, where the no-PoToken cap bites. */
async function probeTail(stream: ResolvedAudioStream, contentLength: number): Promise<void> {
  const range = contentLength > PROBE_BYTES
    ? `bytes=${contentLength - PROBE_BYTES}-${contentLength - 1}`
    : `bytes=0-${PROBE_BYTES - 1}`;
  const res = await fetch(stream.url, {
    headers: { 'User-Agent': stream.userAgent, Range: range },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  await res.body?.cancel();
  if (res.status !== 206 && res.status !== 200) {
    throw new Error(`googlevideo returned HTTP ${res.status} for ${range}`);
  }
}

function parseExpiry(streamUrl: string): number | null {
  try {
    const seconds = Number(new URL(streamUrl).searchParams.get('expire'));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
  } catch {
    return null;
  }
}
