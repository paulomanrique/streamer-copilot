import { Innertube, ClientType } from 'youtubei.js';

interface ResolvedStream {
  url: string;
  expiresAt: number; // ms epoch
}

/**
 * Formato simplificado de cookie aceito pelo Innertube.create({ cookie: '...' })
 * — uma string `Cookie:` HTTP-style. Devolvido como nada (null) quando o
 * streamer não fez login no YouTube via o fluxo /youtube:open-login.
 */
export interface InnertubeCookieSource {
  getYouTubeCookieHeader(): Promise<string | null>;
}

interface MusicStreamResolverOptions {
  /** Devolve a string `cookie:` HTTP da sessão YouTube logada do Electron.
   *  Usada como hint pro Innertube — não é estritamente necessária pra IOS
   *  client (que opera anônimo), mas ajuda em vídeos com restrição de idade
   *  ou região quando o usuário está logado. */
  cookieSource?: InnertubeCookieSource;
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
 * Após o `@distube/ytdl-core` 4.16.x quebrar por causa do PoToken/anti-bot
 * do YouTube (mesmo com cookies autenticados e player clients alternativos),
 * mudamos pro `youtubei.js` que já é a lib do scraper de chat e tem
 * tracking mais ativo. O cliente IOS retorna URLs diretas (sem signature
 * cipher) e não exige PoToken — fluxo de menor atrito.
 *
 * URLs do YouTube têm `expire` no query; cacheamos até esse momento e
 * resolvemos de novo na próxima request quando expirar.
 */
export class MusicStreamResolver {
  private readonly cache = new Map<string, ResolvedStream>();
  private innertube: Innertube | null = null;
  private innertubeCookieKey: string | null = null;

  constructor(private readonly options: MusicStreamResolverOptions = {}) {}

  async resolveAudioUrl(videoId: string): Promise<string> {
    const now = Date.now();
    const cached = this.cache.get(videoId);
    if (cached && cached.expiresAt - now > 30_000) return cached.url;

    const yt = await this.getInnertube();
    const info = await yt.getBasicInfo(videoId, { client: 'IOS' });
    const formats = (info.streaming_data?.adaptive_formats ?? []) as AdaptiveFormat[];
    const audioFormats = formats.filter((f) => f.mime_type?.startsWith('audio') && f.url);
    if (audioFormats.length === 0) {
      throw new Error(`No audio formats with direct URL for ${videoId} (IOS client returned ${formats.length} formats total)`);
    }
    // Maior bitrate vence — IOS costuma devolver 2-5 audio formats (opus + aac).
    audioFormats.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    const best = audioFormats[0];
    const streamUrl = best.url!;

    // Lê `expire` do URL pra cachear até pouco antes da expiração.
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

  /**
   * Lazy-singleton do Innertube. Se a string de cookies mudar (login/logout),
   * recria a instância — o Innertube não tem método pra "atualizar cookies"
   * depois de criado.
   */
  private async getInnertube(): Promise<Innertube> {
    const cookieHeader = this.options.cookieSource
      ? await this.options.cookieSource.getYouTubeCookieHeader().catch(() => null)
      : null;
    const cookieKey = cookieHeader ? `len:${cookieHeader.length}` : 'none';
    if (this.innertube && this.innertubeCookieKey === cookieKey) return this.innertube;

    // `retrieve_player: false` pula o fetch do player JS (pesado e
    // desnecessário pro IOS client que não usa signature cipher).
    this.innertube = await Innertube.create({
      retrieve_player: false,
      client_type: ClientType.IOS,
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    });
    this.innertubeCookieKey = cookieKey;
    return this.innertube;
  }
}
