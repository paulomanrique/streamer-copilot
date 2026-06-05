import { Innertube } from 'youtubei.js';

/**
 * Literal value of `Constants.CLIENTS.ANDROID_VR.USER_AGENT` from
 * youtubei.js@17.0.1. Re-exported so the audio proxy can send the matching
 * User-Agent on the videoplayback request. Keep aligned when bumping the lib.
 */
export const ANDROID_VR_USER_AGENT = 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';

interface ResolvedStream {
  url: string;
  expiresAt: number; // ms epoch
}

interface AdaptiveFormat {
  url?: string;
  mime_type?: string;
  bitrate?: number;
  audio_quality?: string;
}

/**
 * R4: resolves a YouTube videoId to a directly-playable audio stream URL.
 *
 * Uses `youtubei.js` (same lib as the chat scraper).
 *
 * Client: ANDROID_VR. Why? YouTube's current anti-bot makes IOS, WEB,
 * ANDROID and friends either return URLs without a decipherable signature
 * (they need a PoToken we can't synthesize) or 403 from googlevideo when
 * the audio fetch hits the edge. The ANDROID_VR client (YouTube VR for
 * Oculus Quest) still returns direct, decipher-free URLs that googlevideo
 * accepts with a Range header. Verified on 5 different videos during the
 * rework — all came back 206 with the matching User-Agent. If YouTube
 * tightens ANDROID_VR too, the natural next steps are TV_EMBEDDED with
 * OAuth, or running bgutils-js inside a hidden WebContentsView to generate
 * a real PoToken.
 *
 * Anonymous on purpose: authenticated cookies trigger SAPISIDHASH on the
 * Authorization header, and the mobile-client endpoints reject that (HTTP
 * 400). Cookies were tried; they made things worse, not better.
 *
 * googlevideo URLs carry an `expire` query param; we cache the resolved
 * URL until that timestamp and re-resolve on the next request after.
 */
export class MusicStreamResolver {
  private readonly cache = new Map<string, ResolvedStream>();
  private innertube: Innertube | null = null;

  async resolveAudioUrl(videoId: string): Promise<string> {
    const now = Date.now();
    const cached = this.cache.get(videoId);
    if (cached && cached.expiresAt - now > 30_000) return cached.url;

    const yt = await this.getInnertube();
    const info = await yt.getBasicInfo(videoId, { client: 'ANDROID_VR' });
    const formats = (info.streaming_data?.adaptive_formats ?? []) as AdaptiveFormat[];
    const audioFormats = formats.filter((f) => f.mime_type?.startsWith('audio') && f.url);
    if (audioFormats.length === 0) {
      throw new Error(`No audio formats with direct URL for ${videoId} (ANDROID_VR returned ${formats.length} formats total)`);
    }
    audioFormats.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    const streamUrl = audioFormats[0].url!;

    let expiresAt = now + 4 * 60 * 1000;
    try {
      const url = new URL(streamUrl);
      const expire = url.searchParams.get('expire');
      if (expire) {
        const seconds = Number(expire);
        if (Number.isFinite(seconds)) expiresAt = seconds * 1000;
      }
    } catch { /* ignore parse errors */ }

    this.cache.set(videoId, { url: streamUrl, expiresAt });
    return streamUrl;
  }

  invalidate(videoId: string): void {
    this.cache.delete(videoId);
  }

  /** Lazy-singleton Innertube — anonymous, no player JS fetched (ANDROID_VR
   *  returns audio URLs already in deciphered form, so we don't need it). */
  private async getInnertube(): Promise<Innertube> {
    if (this.innertube) return this.innertube;
    this.innertube = await Innertube.create({
      retrieve_player: false,
    });
    return this.innertube;
  }
}
