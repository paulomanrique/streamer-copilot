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

/**
 * Forma simplificada do cookie aceito pelo `createAgent` do
 * `@distube/ytdl-core` — compatível com o que o `electron.session.cookies.get`
 * devolve (mesma família de campos).
 */
export interface YtdlCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
  expirationDate?: number;
}

interface YtdlAgent {
  // opaque — passamos pro getInfo como está
  readonly __ytdlAgent?: true;
}

interface YtdlModule {
  getInfo: (videoId: string, options?: { agent?: YtdlAgent }) => Promise<YtdlInfo>;
  createAgent?: (cookies?: YtdlCookie[], opts?: unknown) => YtdlAgent;
}

interface MusicStreamResolverOptions {
  /** Devolve os cookies da sessão do Electron para o youtube.com. Sem cookies,
   *  o ytdl-core cai em fluxo anônimo e frequentemente falha com "Failed to
   *  find any playable formats" pra vídeos com qualquer restrição leve
   *  (anti-bot, age-gate, idade da conta). Quando o streamer está logado
   *  no YouTube via /youtube:open-login (o mesmo cookie store que o scraper
   *  e o sendMessage usam), os cookies do SAPISID/3PAPISID permitem que o
   *  ytdl resolva o player do cliente WEB autenticado. */
  getYouTubeCookies?: () => Promise<YtdlCookie[]>;
}

/**
 * R4: resolves a YouTube videoId to a directly-playable audio stream URL via
 * @distube/ytdl-core. URLs from YouTube embed an `expire` query parameter; we
 * cache up to that expiry and refresh on demand.
 */
export class MusicStreamResolver {
  private readonly cache = new Map<string, ResolvedStream>();
  private ytdl: YtdlModule | null = null;
  /** Cache do agent: invalidado se a quantidade de cookies muda (login/logout). */
  private agentCache: { agent: YtdlAgent; cookieCount: number } | null = null;

  constructor(private readonly options: MusicStreamResolverOptions = {}) {}

  async resolveAudioUrl(videoId: string): Promise<string> {
    const now = Date.now();
    const cached = this.cache.get(videoId);
    if (cached && cached.expiresAt - now > 30_000) return cached.url;

    const ytdl = this.loadYtdl();
    if (!ytdl) throw new Error('ytdl-core is not installed; cannot resolve YouTube stream URL');

    const agent = await this.buildAgent(ytdl);
    const info = await ytdl.getInfo(videoId, agent ? { agent } : undefined);
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

  private async buildAgent(ytdl: YtdlModule): Promise<YtdlAgent | null> {
    if (!ytdl.createAgent || !this.options.getYouTubeCookies) return null;
    let cookies: YtdlCookie[] = [];
    try {
      cookies = await this.options.getYouTubeCookies();
    } catch {
      return null;
    }
    if (cookies.length === 0) return null;
    if (this.agentCache && this.agentCache.cookieCount === cookies.length) {
      return this.agentCache.agent;
    }
    try {
      const agent = ytdl.createAgent(cookies);
      this.agentCache = { agent, cookieCount: cookies.length };
      return agent;
    } catch {
      return null;
    }
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
