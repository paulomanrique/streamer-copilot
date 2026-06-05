import { Innertube, ClientType } from 'youtubei.js';

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
 * Usa `youtubei.js` (a mesma lib do scraper de chat). O cliente IOS do
 * InnerTube devolve URLs diretas (sem signature cipher) e não exige
 * PoToken — fluxo de menor atrito.
 *
 * Por que SEM cookies autenticados: passar a string de cookies do session
 * YouTube logado faz o `youtubei.js` calcular `SAPISIDHASH` e enviar
 * `Authorization:` no request. O endpoint do IOS rejeita esse header
 * com HTTP 400 ("INVALID_ARGUMENT") porque o cliente IOS autentica via
 * OAuth, não via cookies de browser. Anônimo é o caminho confiável —
 * vídeos age-restricted falham, mas a maioria dos pedidos de música do
 * chat são de vídeos públicos. Se aparecer demanda real por age-restricted
 * adicionamos um fallback (cliente TV com cookies, PoToken, etc).
 *
 * URLs do YouTube têm `expire` no query; cacheamos até esse momento e
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
    const info = await yt.getBasicInfo(videoId, { client: 'IOS' });
    const formats = (info.streaming_data?.adaptive_formats ?? []) as AdaptiveFormat[];
    const audioFormats = formats.filter((f) => f.mime_type?.startsWith('audio') && f.url);
    if (audioFormats.length === 0) {
      throw new Error(`No audio formats with direct URL for ${videoId} (IOS returned ${formats.length} formats total)`);
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

  /** Lazy-singleton do Innertube — anônimo e sem buscar player JS (não
   *  precisamos do player pro cliente IOS que devolve URLs já decifradas). */
  private async getInnertube(): Promise<Innertube> {
    if (this.innertube) return this.innertube;
    this.innertube = await Innertube.create({
      retrieve_player: false,
      client_type: ClientType.IOS,
    });
    return this.innertube;
  }
}
