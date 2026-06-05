import { Innertube } from 'youtubei.js';

/**
 * UA literal de `Constants.CLIENTS.ANDROID_VR.USER_AGENT` em youtubei.js@17.0.1.
 * Re-exportada pra que o proxy de áudio mande a UA correta na request
 * pro googlevideo. Manter alinhada quando atualizar a lib.
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
 * Usa `youtubei.js` (a mesma lib do scraper de chat).
 *
 * Cliente: ANDROID_VR. Por quê? O anti-bot atual do YouTube faz IOS, WEB,
 * ANDROID e variantes devolverem ou URLs sem signature decifrável (precisam
 * de PoToken que não conseguimos sintetizar) ou 403 do googlevideo na
 * hora de pegar o áudio. O cliente ANDROID_VR (YouTube VR pra Oculus
 * Quest) ainda devolve URLs diretas, sem cipher, que o googlevideo
 * aceita com Range. Validado em 5 vídeos diferentes durante o desenvolvimento
 * desse módulo — todos retornaram 206 com a UA correspondente. Se um dia
 * o YouTube apertar isso também, próximos candidatos são TV_EMBEDDED com
 * OAuth ou bgutils-js dentro de uma WebContentsView pra gerar PoToken.
 *
 * Anônimo de propósito: cookies autenticados disparam SAPISIDHASH no
 * Authorization e o endpoint do cliente mobile rejeita (HTTP 400).
 *
 * URLs do googlevideo têm `expire` no query; cacheamos até esse momento e
 * resolvemos de novo na próxima request.
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

  /** Lazy-singleton do Innertube — anônimo, sem buscar player JS (URLs do
   *  ANDROID_VR vêm já decifradas). */
  private async getInnertube(): Promise<Innertube> {
    if (this.innertube) return this.innertube;
    this.innertube = await Innertube.create({
      retrieve_player: false,
    });
    return this.innertube;
  }
}
