import { execFile as execFileCallback } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { BrowserWindow, dialog, ipcMain, net, shell } from 'electron';
import { parseFile as parseAudioFile } from 'music-metadata';
import type { OpenDialogOptions } from 'electron';

import type { DatabaseHandle } from '../db/database.js';
import { ChatService } from '../modules/chat/chat-service.js';
import { ChatLogRepository } from '../modules/chat-log/chat-log-repository.js';
import { ChatLogService } from '../modules/chat-log/chat-log-service.js';
import { LogRepository } from '../modules/logs/log-repository.js';
import { LogService } from '../modules/logs/log-service.js';
import { ObsService } from '../modules/obs/obs-service.js';
import { ObsSettingsStore } from '../modules/obs/obs-settings-store.js';
import { RaffleDeadlineRunner } from '../modules/raffles/raffle-deadline-runner.js';
import { RaffleOverlayServer } from '../modules/raffles/raffle-overlay-server.js';
import { RaffleRepository } from '../modules/raffles/raffle-repository.js';
import { RaffleService } from '../modules/raffles/raffle-service.js';
import { SchedulerService, type ScheduledRunState, type ScheduledTask } from '../modules/scheduled/scheduler-service.js';
import { AppSettingsRepository } from '../modules/settings/app-settings-repository.js';
import { GeneralSettingsStore } from '../modules/settings/general-settings-store.js';
import { ProfileStore } from '../modules/settings/profile-store.js';
import { SoundCommandRepository } from '../modules/sounds/sound-repository.js';
import { SoundService } from '../modules/sounds/sound-service.js';
import { SoundSettingsStore } from '../modules/sounds/sound-settings-store.js';
import { SuggestionRepository } from '../modules/suggestions/suggestion-repository.js';
import { SuggestionService } from '../modules/suggestions/suggestion-service.js';
import { TextCommandRepository } from '../modules/text/text-repository.js';
import { TextService } from '../modules/text/text-service.js';
import { VoiceCommandRepository } from '../modules/voice/voice-repository.js';
import { VoiceService } from '../modules/voice/voice-service.js';
import { createKickChatAdapter } from '../platforms/kick/adapter.js';
import { KickSettingsStore } from '../platforms/kick/settings-store.js';
import { KickTokenStore, type KickAuthSession, type KickAuthToken } from '../platforms/kick/token-store.js';
import { TikTokSettingsStore } from '../platforms/tiktok/settings-store.js';
import { createTikTokChatAdapter } from '../platforms/tiktok/adapter.js';
import { TwitchCredentialsStore } from '../platforms/twitch/credentials-store.js';
import { createTwitchChatAdapter } from '../platforms/twitch/adapter.js';
import { createYouTubeChatAdapter } from '../platforms/youtube/adapter.js';
import { YouTubeSettingsStore } from '../platforms/youtube/settings-store.js';
import { YouTubeScraper } from './youtube-scraper.js';
import { APP_NAME } from '../shared/constants.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import {
  type LiveStreamInfo,
  getLabelFromTitle,
  extractYtLiveVideoIds,
  extractYtSubscriberCount,
  normalizeKickChannelInput,
  escapeHtml,
} from './youtube-helpers.js';
import {
  chatSendMessageSchema,
  cloneProfileInputSchema,
  createProfileInputSchema,
  deleteProfileInputSchema,
  eventLogFiltersSchema,
  generalSettingsSchema,
  obsConnectionSettingsSchema,
  profileSettingsSchema,
  raffleControlActionInputSchema,
  raffleCreateInputSchema,
  raffleDeleteInputSchema,
  raffleUpdateInputSchema,
  renameProfileInputSchema,
  rendererVoiceCapabilitiesSchema,
  soundCommandDeleteInputSchema,
  soundCommandUpsertInputSchema,
  soundPlayPayloadSchema,
  soundSettingsSchema,
  suggestionListDeleteInputSchema,
  suggestionListUpsertInputSchema,
  kickConnectSchema,
  kickSettingsSchema,
  selectProfileInputSchema,
  textCommandDeleteInputSchema,
  textCommandUpsertInputSchema,
  tiktokConnectSchema,
  tiktokSettingsSchema,
  twitchCredentialsSchema,
  voiceCommandDeleteInputSchema,
  voiceCommandUpsertInputSchema,
  voiceSpeakPayloadSchema,
  youtubeConnectSchema,
  youtubeSettingsSchema,
} from '../shared/schemas.js';
import type { AppInfo, KickAuthStatus, KickConnectionStatus, KickLiveStats, KickSettings, PlatformId, Raffle, SoundSettings, TikTokConnectionStatus, TwitchConnectionStatus, TwitchLiveStats, YouTubeSettings, YouTubeStreamInfo } from '../shared/types.js';

const TWITCH_CLIENT_ID = 'vtwg8tzuv1nlip4qh9n6sxx2p76g0s';
const TWITCH_REDIRECT_PORT = 32999;
const KICK_REDIRECT_PORT = 33019;
const KICK_REDIRECT_HOST = 'localhost';
const KICK_CLIENT_ID = '01KPDVPG20B3QXSFBQQ3EFPH6P';
const KICK_CLIENT_SECRET = '0dae2c68bdb3910d97b7ce91cabe6e774fc826301b0e06eb61f379a42679b863';
import { StateHub } from './state-hub.js';

interface AppContextOptions {
  appVersion: string;
  databaseHandle: DatabaseHandle;
  generalSettingsStore: GeneralSettingsStore;
  onGeneralSettingsChanged: (settings: import('../shared/types.js').GeneralSettings) => Promise<void> | void;
  stateHub: StateHub;
  userDataPath: string;
}

const CONTEXT_DIR = path.dirname(fileURLToPath(import.meta.url));
// Maximum spin duration (corresponds to exactly 8 full rotations at reference speed).
const MAX_SPIN_DURATION_MS = 8_000;

// Resolves the absolute path for a bundled raffle sound.
// In dev the public/ folder is served by Vite but the files live on disk there.
// In production Vite copies public/ into dist/renderer/.
function resolveBundledSound(event: 'spinning' | 'eliminated' | 'winner', filename: string): string {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const base = isDev
    ? path.join(process.cwd(), 'public', 'sounds', 'raffles')
    : path.join(CONTEXT_DIR, '..', 'renderer', 'sounds', 'raffles');
  return path.join(base, event, filename);
}

async function listBundledSounds(): Promise<Record<'spinning' | 'eliminated' | 'winner', string[]>> {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const base = isDev
    ? path.join(process.cwd(), 'public', 'sounds', 'raffles')
    : path.join(CONTEXT_DIR, '..', 'renderer', 'sounds', 'raffles');

  const events = ['spinning', 'eliminated', 'winner'] as const;
  const result: Record<string, string[]> = {};
  for (const event of events) {
    try {
      const dir = path.join(base, event);
      const files = await fs.readdir(dir);
      result[event] = files.filter((f) => /\.(mp3|wav|ogg)$/i.test(f)).sort();
    } catch {
      result[event] = [];
    }
  }
  return result as Record<'spinning' | 'eliminated' | 'winner', string[]>;
}

export function createAppContext(options: AppContextOptions): () => Promise<void> {
  const execFile = promisify(execFileCallback);
  const profileStore = new ProfileStore(options.userDataPath);
  const appSettingsRepository = new AppSettingsRepository(options.databaseHandle.db);
  const generalSettingsStore = options.generalSettingsStore;
  const obsSettingsStore = new ObsSettingsStore(appSettingsRepository);
  const logRepository = new LogRepository(options.databaseHandle.db);
  const logService = new LogService(logRepository);
  const chatLogRepository = new ChatLogRepository(options.databaseHandle.db);
  const chatLogService = new ChatLogService(chatLogRepository);
  const raffleRepository = new RaffleRepository(options.databaseHandle.db);
  const soundRepository = new SoundCommandRepository(options.databaseHandle.db);
  const textRepository = new TextCommandRepository(options.databaseHandle.db);
  const voiceRepository = new VoiceCommandRepository(options.databaseHandle.db);
  const suggestionRepository = new SuggestionRepository(options.databaseHandle.db);

  // Sound settings: file-based, per-profile. Cached in memory for synchronous access in canRun().
  let soundSettingsCache: SoundSettings = { defaultCooldownSeconds: 0, defaultUserCooldownSeconds: 0 };

  const getSoundSettingsStore = async (): Promise<SoundSettingsStore | null> => {
    const snapshot = await profileStore.list();
    const active = snapshot.profiles.find((p) => p.id === snapshot.activeProfileId);
    if (!active) return null;
    return new SoundSettingsStore(active.directory);
  };

  const reloadSoundSettingsCache = async (): Promise<void> => {
    const store = await getSoundSettingsStore();
    if (store) soundSettingsCache = await store.load();
  };

  // Load cache on startup (non-blocking, best-effort).
  void reloadSoundSettingsCache();

  const schedulerService = new SchedulerService({
    source: {
      list: () => listCommandScheduleTasks(),
      markSent: (id, sentAt) => markCommandScheduleSent(id, sentAt),
    },
    onStatus: (items) => options.stateHub.pushScheduledStatus(items),
    onDueTask: (task) => dispatchCommandScheduleWithResult(task),
    resolveEffectiveTargets: (task) => resolveScheduledTaskTargets(task),
  });
  const soundService = new SoundService({
    repository: soundRepository,
    getSettings: () => soundSettingsCache,
    onPlay: (payload) => options.stateHub.pushSoundPlay(payload),
  });
  const textService = new TextService({
    repository: textRepository,
    onRespond: async (payload) => {
      try {
        await sendPlatformMessage(payload.platform, payload.content);
        await pushLocalOutboundMessage(payload.platform, payload.content);
        logService.info('text-command', 'Sent response', { platform: payload.platform, content: payload.content });
      } catch (cause) {
        logService.error('text-command', 'Failed to send response', {
          platform: payload.platform,
          content: payload.content,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },
  });
  let rendererSpeechSynthesisAvailable = process.platform !== 'linux';
  let isShuttingDown = false;
  const voiceService = new VoiceService({
    repository: voiceRepository,
    onSpeak: (payload) => {
      if (rendererSpeechSynthesisAvailable) {
        options.stateHub.pushVoiceSpeak(payload);
        return;
      }

      void speakWithOsFallback(payload.text);
    },
  });
  const suggestionService = new SuggestionService({
    repository: suggestionRepository,
    onState: (payload) => options.stateHub.pushSuggestionState(payload),
    onFeedback: async (payload) => {
      if (!payload.content) return;
      try {
        await sendPlatformMessage(payload.platform, payload.content);
        await pushLocalOutboundMessage(payload.platform, payload.content);
        logService.info('suggestion', 'Sent feedback', { platform: payload.platform, content: payload.content });
      } catch (cause) {
        logService.error('suggestion', 'Failed to send feedback', {
          platform: payload.platform,
          content: payload.content,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },
  });
  let twitchStatus: TwitchConnectionStatus = 'disconnected';
  let twitchChannel: string | null = null;
  let twitchStatsTimer: ReturnType<typeof setInterval> | null = null;
  let kickStatsTimer: ReturnType<typeof setInterval> | null = null;
  const userAvatarCache = new Map<string, string>();
  const badgeCache = new Map<string, string>();
  const youtubeScrapers = new Map<string, YouTubeScraper>();
  const youtubeStreamData = new Map<string, {
    label: string;
    viewerCount: number | null;
    subscriberCount: number | null;
    platform: 'youtube' | 'youtube-v';
    channelHandle: string | null;
  }>();
  let youtubeMonitorTimer: ReturnType<typeof setInterval> | null = null;
  let lastDetectedVideoIds: Set<string> = new Set();

  // Ordered list of platform IDs for YouTube streams (first = horizontal, second = vertical)
  const YT_PLATFORMS: Array<'youtube' | 'youtube-v'> = ['youtube', 'youtube-v'];
  const SCHEDULED_SUPPORTED_TARGETS: PlatformId[] = ['twitch', 'youtube'];
  let raffleService: RaffleService;

  const getYoutubeStreams = (): YouTubeStreamInfo[] => {
    const totalStreams = youtubeScrapers.size;
    return Array.from(youtubeScrapers.keys()).map((videoId) => {
      const data = youtubeStreamData.get(videoId);
      const label = totalStreams > 1
        ? (data?.platform === 'youtube-v' ? 'Vertical' : 'Horizontal')
        : 'YouTube';
      return {
        videoId,
        platform: data?.platform ?? 'youtube',
        channelHandle: data?.channelHandle ?? null,
        label,
        viewerCount: data?.viewerCount ?? null,
        subscriberCount: data?.subscriberCount ?? null,
        liveUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    });
  };

  const getTwitchCredentialsStore = async (): Promise<TwitchCredentialsStore | null> => {
    const snapshot = await profileStore.list();
    const active = snapshot.profiles.find((p) => p.id === snapshot.activeProfileId);
    if (!active) return null;
    return new TwitchCredentialsStore(active.directory);
  };

  const getYoutubeSettingsStore = async (): Promise<YouTubeSettingsStore | null> => {
    const snapshot = await profileStore.list();
    const active = snapshot.profiles.find((p) => p.id === snapshot.activeProfileId);
    if (!active) return null;
    return new YouTubeSettingsStore(active.directory);
  };

  let youtubeSettingsWrite = Promise.resolve();

  const defaultYoutubeSettings = (): YouTubeSettings => ({
    channels: [],
    autoConnect: true,
  });

  const loadYoutubeSettings = async (): Promise<YouTubeSettings> => {
    await youtubeSettingsWrite.catch(() => undefined);
    const store = await getYoutubeSettingsStore();
    return store ? store.load() : defaultYoutubeSettings();
  };

  const saveYoutubeSettings = async (raw: unknown): Promise<YouTubeSettings> => {
    const settings = youtubeSettingsSchema.parse(raw);
    const store = await getYoutubeSettingsStore();
    if (!store) throw new Error('No active profile');

    youtubeSettingsWrite = youtubeSettingsWrite
      .catch(() => undefined)
      .then(() => store.save(settings));

    await youtubeSettingsWrite;
    startYoutubeMonitor();
    return settings;
  };

  const getTiktokSettingsStore = async (): Promise<TikTokSettingsStore | null> => {
    const snapshot = await profileStore.list();
    const active = snapshot.profiles.find((p) => p.id === snapshot.activeProfileId);
    if (!active) return null;
    return new TikTokSettingsStore(active.directory);
  };

  let tiktokStatus: TikTokConnectionStatus = 'disconnected';
  let tiktokUsername: string | null = null;
  let kickStatus: KickConnectionStatus = 'disconnected';
  let kickSlug: string | null = null;

  const getKickSettingsStore = async (): Promise<KickSettingsStore | null> => {
    const snapshot = await profileStore.list();
    const active = snapshot.profiles.find((p) => p.id === snapshot.activeProfileId);
    if (!active) return null;
    return new KickSettingsStore(active.directory);
  };

  const getKickTokenStore = async (): Promise<KickTokenStore | null> => {
    const snapshot = await profileStore.list();
    const active = snapshot.profiles.find((p) => p.id === snapshot.activeProfileId);
    if (!active) return null;
    return new KickTokenStore(active.directory);
  };

  const getKickAuthStatus = async (): Promise<KickAuthStatus> => {
    const tokenStore = await getKickTokenStore();
    const session = await tokenStore?.load() ?? null;
    const expiresAt = session?.token.expiresAt ?? null;

    return {
      channelSlug: session?.channelSlug ?? null,
      expiresAt,
      scope: session?.token.scope ?? null,
      isAuthorized: !!session && typeof expiresAt === 'number' && expiresAt > Date.now(),
    };
  };

  const defaultKickSettings = (): KickSettings => ({
    channelInput: '',
    clientId: '',
    clientSecret: '',
    autoConnect: false,
  });

  const resolveKickApiCredentials = async (input?: { clientId?: string; clientSecret?: string }): Promise<{ clientId: string; clientSecret: string; isUserConfigured: boolean }> => {
    const inputClientId = input?.clientId?.trim() ?? '';
    const inputClientSecret = input?.clientSecret?.trim() ?? '';
    if (inputClientId && inputClientSecret) {
      return { clientId: inputClientId, clientSecret: inputClientSecret, isUserConfigured: true };
    }

    const store = await getKickSettingsStore();
    const settings = store ? await store.load() : defaultKickSettings();
    const settingsClientId = settings.clientId.trim();
    const settingsClientSecret = settings.clientSecret.trim();
    if (settingsClientId && settingsClientSecret) {
      return { clientId: settingsClientId, clientSecret: settingsClientSecret, isUserConfigured: true };
    }

    return {
      clientId: KICK_CLIENT_ID,
      clientSecret: KICK_CLIENT_SECRET,
      isUserConfigured: false,
    };
  };

  const startKickOAuth = async (clientId: string, clientSecret: string, fallbackChannelSlug?: string | null): Promise<KickAuthSession> => {
    const importer = new Function('return import("@nekiro/kick-api")') as () => Promise<{
      client?: new (options: { clientId: string; clientSecret: string; redirectUri: string }) => {
        generatePKCEParams: () => { codeVerifier: string; codeChallenge: string; state?: string };
        getAuthorizationUrl: (params: { codeVerifier: string; codeChallenge: string; state?: string }, scopes?: string[]) => string;
        exchangeCodeForToken: (tokenRequest: { code: string; codeVerifier: string }) => Promise<{
          accessToken: string;
          tokenType: string;
          expiresIn: number;
          refreshToken?: string;
          scope?: string;
          expiresAt: number;
        }>;
        setToken: (token: KickAuthToken) => void;
        channels: { getChannels: () => Promise<Array<{ slug?: string; broadcaster_user_id?: number }> | { slug?: string; broadcaster_user_id?: number }> };
      };
    }>;
    const module = await importer();
    const KickClient = module.client;
    if (typeof KickClient !== 'function') {
      throw new Error('Kick OAuth client is unavailable');
    }

    const redirectUri = `http://${KICK_REDIRECT_HOST}:${KICK_REDIRECT_PORT}/callback`;
    const kickClient = new KickClient({ clientId, clientSecret, redirectUri });
    const pkce = kickClient.generatePKCEParams();
    const expectedState = pkce.state ?? '';
    const authUrl = kickClient.getAuthorizationUrl(pkce, ['public', 'channel:read', 'chat:write']);

    return new Promise((resolve, reject) => {
      let finished = false;
      let server: http.Server;

      const timeout = setTimeout(() => {
        finished = true;
        server.close();
        reject(new Error('Kick OAuth timed out'));
      }, 120_000);

      const cleanup = () => {
        clearTimeout(timeout);
        server.close();
      };

      server = http.createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', redirectUri);
        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const error = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<!DOCTYPE html><html><body style="background:#0b1220;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><div>Kick authorization failed: ${escapeHtml(error)}. You can close this tab.</div></body></html>`);
          finished = true;
          cleanup();
          reject(new Error(`Kick authorization failed: ${error}`));
          return;
        }
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<!DOCTYPE html><html><body style="background:#0b1220;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><div>Kick authorization did not return a code. You can close this tab.</div></body></html>');
          finished = true;
          cleanup();
          reject(new Error('Kick authorization did not return a code'));
          return;
        }
        if (expectedState && state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<!DOCTYPE html><html><body style="background:#0b1220;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><div>Kick authorization state mismatch. You can close this tab.</div></body></html>');
          finished = true;
          cleanup();
          reject(new Error('Kick authorization state mismatch'));
          return;
        }

        try {
          const token = await kickClient.exchangeCodeForToken({
            code,
            codeVerifier: pkce.codeVerifier,
          });
          kickClient.setToken(token);
          let channel: { slug?: string; broadcaster_user_id?: number } | null = null;
          try {
            const channelResponse = await kickClient.channels.getChannels();
            const channels = Array.isArray(channelResponse) ? channelResponse : [channelResponse];
            channel = channels.find((entry) => entry && typeof entry === 'object' && typeof entry.slug === 'string') ?? null;
          } catch {
            // Tokens granted only chat:write cannot read the authorized channel.
          }
          if (!channel?.slug && fallbackChannelSlug) {
            const fallbackChannel = await resolveKickChannelMetadata(fallbackChannelSlug, { clientId, clientSecret });
            channel = fallbackChannel
              ? { slug: fallbackChannel.slug, broadcaster_user_id: fallbackChannel.broadcasterUserId ?? undefined }
              : { slug: fallbackChannelSlug };
          }
          finished = true;
          cleanup();
          if (!channel?.slug) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<!DOCTYPE html><html><body style="background:#0b1220;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><div>Kick connected, but no authorized channel was returned. You can close this tab.</div></body></html>');
            reject(new Error('Kick OAuth succeeded but no authorized channel was returned'));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<!DOCTYPE html><html><body style="background:#0b1220;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><div>Kick connected. You can close this tab.</div></body></html>');
          resolve({
            token,
            channelSlug: channel.slug,
            broadcasterUserId: typeof channel.broadcaster_user_id === 'number' ? channel.broadcaster_user_id : null,
          });
        } catch (cause) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end('<!DOCTYPE html><html><body style="background:#0b1220;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><div>Kick token exchange failed. You can close this tab.</div></body></html>');
          finished = true;
          cleanup();
          reject(cause instanceof Error ? cause : new Error(String(cause)));
        }
      });

      server.on('error', (cause) => {
        finished = true;
        clearTimeout(timeout);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      });

      server.listen(KICK_REDIRECT_PORT, '127.0.0.1', () => {
        void shell.openExternal(authUrl).catch((cause) => {
          if (!finished) {
            finished = true;
            cleanup();
            reject(cause instanceof Error ? cause : new Error(String(cause)));
          }
        });
      });
    });
  };

  const ensureKickAuthSession = async (
    channelSlug: string,
    credentials: { clientId: string; clientSecret: string; isUserConfigured: boolean },
    interactive: boolean,
  ): Promise<KickAuthSession | null> => {
    const tokenStore = await getKickTokenStore();
    const existing = tokenStore ? await tokenStore.load() : null;
    if (
      existing?.channelSlug === channelSlug
      && typeof existing.broadcasterUserId === 'number'
      && existing.token.expiresAt > Date.now()
    ) {
      return existing;
    }

    if (!interactive) {
      return null;
    }

    const session = await startKickOAuth(credentials.clientId, credentials.clientSecret, channelSlug);
    if (tokenStore) {
      await tokenStore.save(session);
    }

    if (session.channelSlug !== channelSlug) {
      throw new Error(`Kick authorization belongs to @${session.channelSlug}, but the configured channel is @${channelSlug}`);
    }

    return session;
  };

  const setKickStatus = (status: KickConnectionStatus, slug?: string | null) => {
    kickStatus = status;
    if (slug !== undefined) kickSlug = slug;
    options.stateHub.pushKickStatus(status, kickSlug);
    if (status !== 'connected') {
      options.stateHub.pushKickLiveStats(null);
    }
  };

  const fetchKickClientAccessToken = async (credentials: { clientId: string; clientSecret: string }): Promise<string | null> => {
    try {
      const response = await fetch('https://id.kick.com/oauth/token', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
        }),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { access_token?: string };
      return typeof payload.access_token === 'string' && payload.access_token.trim() ? payload.access_token : null;
    } catch {
      return null;
    }
  };

  const resolveKickChannelMetadata = async (
    channelSlug: string,
    credentials: { clientId: string; clientSecret: string },
  ): Promise<{ slug: string; broadcasterUserId: number | null } | null> => {
    const token = await fetchKickClientAccessToken(credentials);
    if (!token) return null;

    try {
      const response = await fetch(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(channelSlug)}`, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) return null;

      const payload = (await response.json()) as {
        data?: Array<{
          slug?: string;
          broadcaster_user_id?: number;
          id?: number;
        }>;
      };
      const channel = payload.data?.[0];
      if (!channel) return null;

      return {
        slug: typeof channel.slug === 'string' && channel.slug.trim() ? channel.slug : channelSlug,
        broadcasterUserId: typeof channel.broadcaster_user_id === 'number'
          ? channel.broadcaster_user_id
          : typeof channel.id === 'number'
            ? channel.id
            : null,
      };
    } catch {
      return null;
    }
  };

  const pollKickStats = async (
    channelSlug: string,
    credentials: { clientId: string; clientSecret: string },
    authSession: KickAuthSession | null,
  ): Promise<void> => {
    try {
      const token = await fetchKickClientAccessToken(credentials) ?? authSession?.token.accessToken;
      if (!token) {
        const fallback = await fetchKickLegacyStats(channelSlug);
        if (fallback) options.stateHub.pushKickLiveStats(fallback);
        return;
      }

      const response = await fetch(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(channelSlug)}`, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const fallback = await fetchKickLegacyStats(channelSlug);
        if (fallback) options.stateHub.pushKickLiveStats(fallback);
        return;
      }

      const payload = (await response.json()) as {
        data?: Array<{
          active_subscribers_count?: number;
          follower_count?: number;
          followers_count?: number;
          followers?: number;
          total_followers?: number;
          stream?: {
            is_live?: boolean;
            viewer_count?: number;
          };
        }>;
      };
      const channel = payload.data?.[0];
      if (!channel) {
        const fallback = await fetchKickLegacyStats(channelSlug);
        if (fallback) options.stateHub.pushKickLiveStats(fallback);
        return;
      }

      const stats: KickLiveStats = {
        viewerCount: channel.stream?.viewer_count ?? 0,
        followerCount: channel.follower_count ?? channel.followers_count ?? channel.followers ?? channel.total_followers ?? null,
        subscriberCount: typeof channel.active_subscribers_count === 'number' ? channel.active_subscribers_count : null,
        isLive: channel.stream?.is_live ?? (channel.stream?.viewer_count ?? 0) > 0,
      };
      options.stateHub.pushKickLiveStats(stats);
    } catch {
      const fallback = await fetchKickLegacyStats(channelSlug);
      if (fallback) options.stateHub.pushKickLiveStats(fallback);
    }
  };

  const fetchKickLegacyStats = async (channelSlug: string): Promise<KickLiveStats | null> => {
    try {
      const response = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(channelSlug)}`, {
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      });
      if (!response.ok) return null;

      const payload = (await response.json()) as {
        followers_count?: number;
        follower_count?: number;
        followers?: number;
        subscribers_count?: number;
        subscriber_count?: number;
        livestream?: {
          viewer_count?: number;
          viewers?: number;
          is_live?: boolean;
        } | null;
      };

      const viewerCount = payload.livestream?.viewer_count ?? payload.livestream?.viewers ?? 0;
      return {
        viewerCount,
        followerCount: payload.followers_count ?? payload.follower_count ?? payload.followers ?? null,
        subscriberCount: payload.subscribers_count ?? payload.subscriber_count ?? null,
        isLive: payload.livestream?.is_live ?? viewerCount > 0,
      };
    } catch {
      return null;
    }
  };

  const startKickStatsPoll = (
    channelSlug: string,
    credentials: { clientId: string; clientSecret: string },
    authSession: KickAuthSession | null,
  ) => {
    if (kickStatsTimer) clearInterval(kickStatsTimer);
    void pollKickStats(channelSlug, credentials, authSession);
    kickStatsTimer = setInterval(() => void pollKickStats(channelSlug, credentials, authSession), 15_000);
  };

  const stopKickStatsPoll = () => {
    if (kickStatsTimer) {
      clearInterval(kickStatsTimer);
      kickStatsTimer = null;
    }
    options.stateHub.pushKickLiveStats(null);
  };

  const setTiktokStatus = (status: TikTokConnectionStatus, username?: string | null) => {
    tiktokStatus = status;
    if (username !== undefined) tiktokUsername = username;
    options.stateHub.pushTiktokStatus(status, tiktokUsername);
  };

  const checkYouTubeLive = async (handle: string): Promise<LiveStreamInfo[]> => {
    try {
      // Extract handle from full URL if needed (e.g. https://www.youtube.com/@user)
      const handleMatch = handle.match(/(?:youtube\.com\/)?(@?[\w-]+)(?:\/.*)?$/);
      const rawHandle = handleMatch ? handleMatch[1] : handle;
      const normalizedHandle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
      const url = `https://www.youtube.com/${normalizedHandle}/streams`;
      const response = await net.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!response.ok) return [];
      const html = await response.text();
      const streams = extractYtLiveVideoIds(html);
      const subscriberCount = extractYtSubscriberCount(html);
      return streams.map((stream) => ({ ...stream, subscriberCount, channelHandle: normalizedHandle }));
    } catch (err) {
      logService.warn('youtube', 'Failed to check YouTube live', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  };

  const runYoutubeMonitor = async () => {
    const store = await getYoutubeSettingsStore();
    if (!store) return;
    const settings = await store.load();
    if (!settings.autoConnect || settings.channels.length === 0) return;

    // Collect all live streams across all enabled channels
    const allLiveStreams: LiveStreamInfo[] = [];
    for (const channel of settings.channels) {
      if (!channel.enabled) continue;
      const streams = await checkYouTubeLive(channel.handle);
      for (const s of streams) if (!allLiveStreams.find((x) => x.videoId === s.videoId)) allLiveStreams.push(s);
    }

    // Update viewer counts for existing scrapers and stop those no longer live
    for (const [videoId, scraper] of youtubeScrapers) {
      const updated = allLiveStreams.find((s) => s.videoId === videoId);
      if (!updated) {
        const staleData = youtubeStreamData.get(videoId);
        if (staleData) chatLogService.closeSession(staleData.platform);
        scraper.stop();
        youtubeScrapers.delete(videoId);
        youtubeStreamData.delete(videoId);
        logService.info('youtube', `Stopped scraper for ${videoId} (no longer live)`);
      } else if (updated.viewCount !== null || updated.subscriberCount !== null) {
        const data = youtubeStreamData.get(videoId);
        if (data) {
          youtubeStreamData.set(videoId, {
            ...data,
            viewerCount: updated.viewCount ?? data.viewerCount,
            subscriberCount: updated.subscriberCount ?? data.subscriberCount,
          });
        }
      }
    }

    // Start scrapers for newly detected streams (up to 2)
    const fmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });
    for (let i = 0; i < Math.min(allLiveStreams.length, YT_PLATFORMS.length); i++) {
      const { videoId, title, viewCount, subscriberCount } = allLiveStreams[i];
      if (youtubeScrapers.has(videoId)) continue;
      const platform = YT_PLATFORMS[i];
      const label = getLabelFromTitle(title, i);
      youtubeStreamData.set(videoId, {
        label,
        viewerCount: viewCount,
        subscriberCount,
        platform,
        channelHandle: allLiveStreams[i].channelHandle,
      });
      logService.info('youtube', `Auto-detected live (${platform}, label=${label}): ${videoId} — "${title}"`);
      chatLogService.openSession(platform, videoId);
      suggestionService.clearSessionEntries();
      const scraper = new YouTubeScraper({
        videoId,
        onMessage: (message) => {
          chatService.injectMessage({
            id: `yt-auto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestampLabel: fmt.format(new Date()),
            ...message,
            platform,
            streamLabel: label,
          });
        },
        onEvent: (event) => {
          chatService.injectEvent({
            id: `yt-auto-event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestampLabel: fmt.format(new Date()),
            ...event,
            platform,
            streamLabel: label,
          });
        },
        onLog: (msg) => logService.info('youtube', msg),
      });
      youtubeScrapers.set(videoId, scraper);
      await scraper.start();
    }

    lastDetectedVideoIds = new Set(allLiveStreams.map((s) => s.videoId));
    options.stateHub.pushYoutubeStatus(getYoutubeStreams());
  };

  const startYoutubeMonitor = () => {
    if (youtubeMonitorTimer) clearInterval(youtubeMonitorTimer);
    void runYoutubeMonitor();
    youtubeMonitorTimer = setInterval(runYoutubeMonitor, 120_000);
  };

  const pollTwitchStats = async (channel: string, accessToken: string): Promise<void> => {
    try {
      const userRes = await net.fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID }
      });
      const userData = (await userRes.json()) as { data?: Array<{ id: string }> };
      const userId = userData.data?.[0]?.id;
      if (!userId) return;

      const [streamRes, followersRes, hypeRes] = await Promise.all([
        net.fetch(`https://api.twitch.tv/helix/streams?user_id=${userId}`, { headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID } }),
        net.fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userId}`, { headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID } }),
        net.fetch(`https://api.twitch.tv/helix/hypetrain/events?broadcaster_id=${userId}`, { headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID } }),
      ]);

      const [streamData, followersData, hypeData] = await Promise.all([
        streamRes.json() as Promise<{ data?: Array<{ viewer_count: number }> }>,
        followersRes.json() as Promise<{ total?: number }>,
        hypeRes.json() as Promise<{ data?: Array<{ event_data: any; event_type: string }> }>,
      ]);

      const stream = streamData.data?.[0];
      let hypeTrain: TwitchLiveStats['hypeTrain'] = null;
      const latestHypeEvent = hypeData.data?.[0];
      if (latestHypeEvent && latestHypeEvent.event_type === 'hypetrain.progression') {
        const data = latestHypeEvent.event_data;
        if (new Date(data.expires_at).getTime() > Date.now()) {
          hypeTrain = { level: data.level, progress: data.progress, goal: data.goal, expiry: data.expires_at };
        }
      }

      options.stateHub.pushTwitchLiveStats({ viewerCount: stream?.viewer_count ?? 0, followerCount: followersData.total ?? 0, isLive: !!stream, hypeTrain });
    } catch (err) {
      logService.warn('twitch', 'Failed to poll Twitch stats', { error: err instanceof Error ? err.message : String(err) });
    }
  };

  const startTwitchStatsPoll = (channel: string, accessToken: string) => {
    if (twitchStatsTimer) clearInterval(twitchStatsTimer);
    void pollTwitchStats(channel, accessToken);
    twitchStatsTimer = setInterval(() => void pollTwitchStats(channel, accessToken), 10_000);
  };

  const stopTwitchStatsPoll = () => { if (twitchStatsTimer) { clearInterval(twitchStatsTimer); twitchStatsTimer = null; } };

  const loadTwitchBadges = async (channel: string, token: string): Promise<void> => {
    try {
      const h = { Authorization: `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID };
      const userRes = await net.fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`, { headers: h });
      const userData = (await userRes.json()) as { data?: Array<{ id: string }> };
      const broadcasterId = userData.data?.[0]?.id;
      const urls = ['https://api.twitch.tv/helix/chat/badges/global'];
      if (broadcasterId) urls.push(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcasterId}`);
      const jsons = await Promise.all(
        urls.map(async (url) => (await net.fetch(url, { headers: h })).json() as Promise<{ data?: Array<{ set_id: string; versions: Array<{ id: string; image_url_2x: string }> }> }>),
      );
      for (const json of jsons) {
        for (const set of json.data ?? []) {
          for (const version of set.versions) badgeCache.set(`${set.set_id}/${version.id}`, version.image_url_2x);
        }
      }
    } catch (err) {
      logService.warn('twitch', 'Failed to load Twitch badges', { error: err instanceof Error ? err.message : String(err) });
    }
  };

  const resolveBadgeUrls = (rawBadges: string | Record<string, string>): string[] => {
    let entries: string[];
    if (typeof rawBadges === 'string') {
      entries = rawBadges.split(',').map((e) => e.trim()).filter(Boolean);
    } else {
      entries = Object.entries(rawBadges).map(([k, v]) => `${k}/${v}`);
    }
    return entries.map((e) => badgeCache.get(e)).filter((url): url is string => Boolean(url));
  };

  const setTwitchStatus = (status: TwitchConnectionStatus, channel?: string | null) => {
    twitchStatus = status;
    if (channel !== undefined) twitchChannel = channel;
    options.stateHub.pushTwitchStatus(status, twitchChannel);
    if (status === 'connected') {
      void (async () => {
        const store = await getTwitchCredentialsStore();
        const creds = store ? await store.load() : null;
        if (creds) {
          const token = creds.oauthToken.replace(/^oauth:/, '');
          startTwitchStatsPoll(creds.channel, token);
          void loadTwitchBadges(creds.channel, token);
        }
      })();
    } else stopTwitchStatsPoll();
  };

  const raffleOverlayServer = new RaffleOverlayServer({
    getOverlayState: (raffleId) => {
      try {
        return raffleService.getSnapshot(raffleId).overlay;
      } catch {
        return null;
      }
    },
    getChatSnapshot: () => chatService.getRecent(),
  });

  raffleService = new RaffleService({
    repository: raffleRepository,
    getOverlayInfo: (raffleId) => raffleOverlayServer.getOverlayInfo(raffleId),
    onState: (payload) => options.stateHub.pushRaffleState(payload),
    onEntry: (payload) => options.stateHub.pushRaffleEntry(payload),
    onResult: (payload) => options.stateHub.pushRaffleResult(payload),
    onAnnounceOpen: async (raffle) => {
      const content = raffle.openAnnouncementTemplate
        .replaceAll('{title}', raffle.title)
        .replaceAll('{command}', raffle.entryCommand);
      for (const target of resolveRaffleAnnouncementTargets(raffle.acceptedPlatforms)) {
        try {
          if (target === 'youtube' || target === 'youtube-v') {
            const scraper = getYoutubeScraperByPlatform(target);
            if (!scraper) throw new Error(`${target}: scraper not connected`);
            await scraper.sendMessage(content);
          } else {
            await chatService.sendMessage(target, content);
          }
          await pushLocalOutboundMessage(target, content);
        } catch (cause) {
          logService.warn('raffles', 'Failed to send open announcement', {
            raffleId: raffle.id,
            platform: target,
            error: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
    },
    onAnnounceEliminated: async (raffle, eliminated) => {
      const content = raffle.eliminationAnnouncementTemplate
        .replaceAll('{eliminated}', eliminated.displayName)
        .replaceAll('{title}', raffle.title);
      for (const target of resolveRaffleAnnouncementTargets(raffle.acceptedPlatforms)) {
        try {
          if (target === 'youtube' || target === 'youtube-v') {
            const scraper = getYoutubeScraperByPlatform(target);
            if (!scraper) throw new Error(`${target}: scraper not connected`);
            await scraper.sendMessage(content);
          } else {
            await chatService.sendMessage(target, content);
          }
          await pushLocalOutboundMessage(target, content);
        } catch (cause) {
          logService.warn('raffles', 'Failed to send elimination announcement', {
            raffleId: raffle.id,
            platform: target,
            error: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
    },
    onAnnounceWinner: async (raffle, winner) => {
      const content = formatWinnerAnnouncement(raffle, winner.displayName);
      for (const target of resolveRaffleAnnouncementTargets(raffle.acceptedPlatforms)) {
        try {
          if (target === 'youtube' || target === 'youtube-v') {
            const scraper = getYoutubeScraperByPlatform(target);
            if (!scraper) throw new Error(`${target}: scraper not connected`);
            await scraper.sendMessage(content);
          } else {
            await chatService.sendMessage(target, content);
          }
          await pushLocalOutboundMessage(target, content);
        } catch (cause) {
          logService.warn('raffles', 'Failed to send winner announcement', {
            raffleId: raffle.id,
            platform: target,
            error: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
    },
    getSpinDurationMs: async (raffle) => {
      if (!raffle.spinSoundFile) return MAX_SPIN_DURATION_MS;
      const filePath = resolveBundledSound('spinning', raffle.spinSoundFile);
      try {
        const meta = await parseAudioFile(filePath, { duration: true });
        const soundDurationMs = (meta.format.duration ?? 0) * 1000;
        return Math.min(soundDurationMs + 2_000, MAX_SPIN_DURATION_MS);
      } catch {
        return MAX_SPIN_DURATION_MS;
      }
    },
    onSoundEvent: (raffle, event) => {
      const soundFile =
        event === 'spin' ? raffle.spinSoundFile
        : event === 'eliminated' ? raffle.eliminatedSoundFile
        : raffle.winnerSoundFile;
      if (!soundFile) return;
      const dir = event === 'spin' ? 'spinning' : event;
      const filePath = resolveBundledSound(dir as 'spinning' | 'eliminated' | 'winner', soundFile);
      options.stateHub.pushSoundPlay({ filePath });
    },
    onLog: (level, message, metadata) => {
      if (level === 'error') logService.error('raffles', message, metadata);
      else if (level === 'warn') logService.warn('raffles', message, metadata);
      else logService.info('raffles', message, metadata);
    },
  });

  const raffleDeadlineRunner = new RaffleDeadlineRunner({
    onTick: () => raffleService.syncDeadlines(),
  });

  const chatService = new ChatService({
    raffleService, soundService, textService, voiceService, suggestionService,
    onMessage: (message) => {
      options.stateHub.pushChatMessage(message);
      chatLogService.recordMessage(message);
    },
    onEvent: (event) => options.stateHub.pushChatEvent(event),
  });

  const obsService = new ObsService({
    settingsStore: obsSettingsStore,
    onConnected: () => {
      if (!isShuttingDown) logService.info('obs', 'OBS connected');
      options.stateHub.pushObsConnected();
    },
    onDisconnected: () => {
      if (!isShuttingDown) logService.warn('obs', 'OBS disconnected');
      options.stateHub.pushObsDisconnected();
    },
    onStats: (stats) => options.stateHub.pushObsStats(stats),
  });

  // --- IPC HANDLERS ---
  ipcMain.handle(IPC_CHANNELS.appGetInfo, async (): Promise<AppInfo> => ({
    appName: APP_NAME, appVersion: options.appVersion,
    electronVersion: process.versions.electron, chromeVersion: process.versions.chrome, nodeVersion: process.versions.node,
  }));
  ipcMain.handle(IPC_CHANNELS.appOpenExternalUrl, async (_, raw) => {
    const url = String(raw ?? '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) links are allowed');
    await shell.openExternal(url);
  });

  ipcMain.handle(IPC_CHANNELS.profilesList, async () => profileStore.list());
  ipcMain.handle(IPC_CHANNELS.profilesSelect, async (_, raw) => {
    const snapshot = await profileStore.select(selectProfileInputSchema.parse(raw).profileId);
    chatService.clearRecent();
    suggestionService.clearSessionEntries();
    await reloadSoundSettingsCache();
    return snapshot;
  });
  ipcMain.handle(IPC_CHANNELS.profilesCreate, async (_, raw) => { const i = createProfileInputSchema.parse(raw); return profileStore.create(i.name, i.directory, i.appLanguage); });
  ipcMain.handle(IPC_CHANNELS.profilesRename, async (_, raw) => { const i = renameProfileInputSchema.parse(raw); return profileStore.rename(i.profileId, i.name); });
  ipcMain.handle(IPC_CHANNELS.profilesClone, async (_, raw) => { const i = cloneProfileInputSchema.parse(raw); return profileStore.clone(i.profileId, i.name, i.directory); });
  ipcMain.handle(IPC_CHANNELS.profilesDelete, async (_, raw) => profileStore.delete(deleteProfileInputSchema.parse(raw).profileId));
  ipcMain.handle(IPC_CHANNELS.profilesPickDirectory, async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle(IPC_CHANNELS.profilesGetSettings, async () => profileStore.getSettings());
  ipcMain.handle(IPC_CHANNELS.profilesSaveSettings, async (_, raw) => profileStore.saveSettings(profileSettingsSchema.parse(raw)));

  ipcMain.handle(IPC_CHANNELS.generalGetSettings, async () => generalSettingsStore.load());
  ipcMain.handle(IPC_CHANNELS.generalSaveSettings, async (_, raw) => {
    const s = generalSettingsSchema.parse(raw);
    const saved = generalSettingsStore.save(s);
    await options.onGeneralSettingsChanged(saved);
    return saved;
  });

  ipcMain.handle(IPC_CHANNELS.scheduledList, async () => []);
  ipcMain.handle(IPC_CHANNELS.scheduledUpsert, async () => []);
  ipcMain.handle(IPC_CHANNELS.scheduledDelete, async () => []);
  ipcMain.handle(IPC_CHANNELS.scheduledGetAvailableTargets, async () => {
    schedulerService.refreshStatus();
    return {
      supported: [...SCHEDULED_SUPPORTED_TARGETS],
      connected: getConnectedScheduledTargets(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.rafflesList, async () => raffleService.list());
  ipcMain.handle(IPC_CHANNELS.rafflesCreate, async (_, raw) => raffleService.create(raffleCreateInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.rafflesUpdate, async (_, raw) => raffleService.update(raffleUpdateInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.rafflesDelete, async (_, raw) => raffleService.delete(raffleDeleteInputSchema.parse(raw).id));
  ipcMain.handle(IPC_CHANNELS.rafflesGetActive, async () => raffleService.getActive());
  ipcMain.handle(IPC_CHANNELS.rafflesGetSnapshot, async (_, raw) => raffleService.getSnapshot(String(raw ?? '')));
  ipcMain.handle(IPC_CHANNELS.rafflesControl, async (_, raw) => raffleService.control(raffleControlActionInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.rafflesOverlayInfo, async (_, raw) => raffleService.getOverlayInfo(String(raw ?? '')));
  ipcMain.handle(IPC_CHANNELS.rafflesSoundsList, async () => listBundledSounds());
  ipcMain.handle(IPC_CHANNELS.rafflesSoundsPreview, async (_, raw) => {
    const { event, filename } = raw as { event: 'spinning' | 'eliminated' | 'winner'; filename: string };
    const filePath = resolveBundledSound(event, filename);
    options.stateHub.pushSoundPlay({ filePath });
  });

  ipcMain.handle(IPC_CHANNELS.textList, async () => textService.list());
  ipcMain.handle(IPC_CHANNELS.textUpsert, async (_, raw) => {
    const result = textService.upsert(textCommandUpsertInputSchema.parse(raw));
    schedulerService.refreshStatus();
    return result;
  });
  ipcMain.handle(IPC_CHANNELS.textDelete, async (_, raw) => {
    const result = textService.delete(textCommandDeleteInputSchema.parse(raw).id);
    schedulerService.refreshStatus();
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.voiceList, async () => voiceService.list());
  ipcMain.handle(IPC_CHANNELS.voiceUpsert, async (_, raw) => voiceService.upsert(voiceCommandUpsertInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.voiceDelete, async (_, raw) => voiceService.delete(voiceCommandDeleteInputSchema.parse(raw).id));
  ipcMain.handle(IPC_CHANNELS.voicePreviewSpeak, async (_, raw) => voiceService.previewSpeak(voiceSpeakPayloadSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.voiceSetRendererCapabilities, async (_, raw) => { rendererSpeechSynthesisAvailable = rendererVoiceCapabilitiesSchema.parse(raw).speechSynthesisAvailable; });

  ipcMain.handle(IPC_CHANNELS.soundsList, async () => soundService.list());
  ipcMain.handle(IPC_CHANNELS.soundsUpsert, async (_, raw) => {
    const input = soundCommandUpsertInputSchema.parse(raw);
    const ext = path.extname(input.filePath);
    const safeTrigger = (input.trigger ?? '').replace(/^!+/, '').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const desiredPath = safeTrigger ? path.join(path.dirname(input.filePath), safeTrigger + ext) : input.filePath;
    let finalFilePath = input.filePath;
    if (input.filePath !== desiredPath) {
      try {
        await fs.rename(input.filePath, desiredPath);
        finalFilePath = desiredPath;
      } catch {
        // Keep original path if rename fails (e.g. file already at destination)
      }
    }
    const result = soundService.upsert({ ...input, filePath: finalFilePath });
    schedulerService.refreshStatus();
    return result;
  });
  ipcMain.handle(IPC_CHANNELS.soundsDelete, async (_, raw) => {
    const result = soundService.delete(soundCommandDeleteInputSchema.parse(raw).id);
    schedulerService.refreshStatus();
    return result;
  });
  ipcMain.handle(IPC_CHANNELS.soundsPickFile, async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, { properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav'] }] });
    if (r.canceled) return null;
    const snapshot = await profileStore.list();
    const active = snapshot.profiles.find(p => p.id === snapshot.activeProfileId);
    const dest = path.join(active ? active.directory : path.join(options.userDataPath, 'sounds'), `${randomUUID()}${path.extname(r.filePaths[0])}`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(r.filePaths[0], dest);
    return dest;
  });
  ipcMain.handle(IPC_CHANNELS.soundsReadFile, async (_, p) => (await fs.readFile(String(p))).toString('base64'));
  ipcMain.handle(IPC_CHANNELS.soundsPreviewPlay, async (_, raw) => soundService.previewPlay(soundPlayPayloadSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.soundsGetSettings, async () => {
    const store = await getSoundSettingsStore();
    return store ? store.load() : soundSettingsCache;
  });
  ipcMain.handle(IPC_CHANNELS.soundsSaveSettings, async (_, raw) => {
    const store = await getSoundSettingsStore();
    if (!store) throw new Error('No active profile');
    const saved = await store.save(soundSettingsSchema.parse(raw));
    soundSettingsCache = saved;
    return saved;
  });

  ipcMain.handle(IPC_CHANNELS.obsGetSettings, async () => obsService.getSettings());
  ipcMain.handle(IPC_CHANNELS.obsSaveSettings, async (_, raw) => obsService.saveSettings(obsConnectionSettingsSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.obsTestConnection, async (_, raw) => obsService.testConnection(obsConnectionSettingsSchema.parse(raw)));

  ipcMain.handle(IPC_CHANNELS.chatGetRecent, async () => chatService.getRecent());
  ipcMain.handle(IPC_CHANNELS.chatOverlayInfo, async () => {
    await raffleOverlayServer.start();
    return raffleOverlayServer.getChatOverlayInfo();
  });
  ipcMain.handle(IPC_CHANNELS.chatSendMessage, async (_, raw) => {
    const i = chatSendMessageSchema.parse(raw);
    await sendPlatformMessage(i.platform, i.content);
    if (i.platform !== 'youtube' && i.platform !== 'youtube-v' && i.platform !== 'kick') {
      await pushLocalOutboundMessage(i.platform, i.content);
    }
  });
  ipcMain.handle(IPC_CHANNELS.logsList, async (_, raw) => logService.list(eventLogFiltersSchema.parse(raw)));

  // Chat Log Handlers
  ipcMain.handle(IPC_CHANNELS.chatLogListSessions, async (_, raw) => {
    const filters = raw && typeof raw === 'object' && 'platform' in raw ? { platform: String((raw as Record<string, unknown>).platform) } : undefined;
    return chatLogService.listSessions(filters);
  });
  ipcMain.handle(IPC_CHANNELS.chatLogGetMessages, async (_, sessionId, opts) => {
    return chatLogService.getMessages(String(sessionId ?? ''), opts as { limit?: number; offset?: number } | undefined);
  });
  ipcMain.handle(IPC_CHANNELS.chatLogExportSession, async (e, sessionId) => {
    const html = chatLogService.exportSessionHtml(String(sessionId ?? ''));
    const win = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: `chat-log-${sessionId}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (!result.canceled && result.filePath) {
      await fs.writeFile(result.filePath, html, 'utf-8');
    }
  });
  ipcMain.handle(IPC_CHANNELS.chatLogDeleteSession, async (_, sessionId) => {
    chatLogService.deleteSession(String(sessionId ?? ''));
  });

  // Suggestions Handlers
  ipcMain.handle(IPC_CHANNELS.suggestionsList, async () => suggestionService.listLists());
  ipcMain.handle(IPC_CHANNELS.suggestionsUpsert, async (_, raw) => suggestionService.upsertList(suggestionListUpsertInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.suggestionsDelete, async (_, raw) => suggestionService.deleteList(suggestionListDeleteInputSchema.parse(raw).id));
  ipcMain.handle(IPC_CHANNELS.suggestionsEntries, async (_, listId) => suggestionService.getEntries(String(listId ?? '')));
  ipcMain.handle(IPC_CHANNELS.suggestionsClearEntries, async (_, listId) => suggestionService.clearEntries(String(listId ?? '')));

  // Twitch Handlers
  ipcMain.handle(IPC_CHANNELS.twitchGetCredentials, async () => { const s = await getTwitchCredentialsStore(); return s ? s.load() : null; });
  ipcMain.handle(IPC_CHANNELS.twitchConnect, async (_, raw) => {
    const c = twitchCredentialsSchema.parse(raw);
    const s = await getTwitchCredentialsStore(); if (!s) throw new Error('No profile');
    await s.save(c); setTwitchStatus('connecting', c.channel);
    // Pre-load badges so first messages have badge images
    await loadTwitchBadges(c.channel, c.oauthToken.replace(/^oauth:/, ''));
    chatLogService.openSession('twitch', c.channel);
    suggestionService.clearSessionEntries();
    await chatService.replaceAdapter(createTwitchChatAdapter({ channels: [c.channel], username: c.username, password: c.oauthToken, onStatusChange: setTwitchStatus, resolveBadgeUrls }));
  });
  ipcMain.handle(IPC_CHANNELS.twitchDisconnect, async () => {
    chatLogService.closeSession('twitch');
    await chatService.removeAdapter('twitch'); setTwitchStatus('disconnected', null); const s = await getTwitchCredentialsStore(); if (s) await s.clear();
  });
  ipcMain.handle(IPC_CHANNELS.twitchGetStatus, async () => twitchStatus);
  ipcMain.handle(IPC_CHANNELS.twitchGetUserAvatars, async (_, logins) => {
    const list = Array.isArray(logins) ? logins.filter(l => typeof l === 'string') : [];
    if (list.length === 0) return {};
    const uncached = list.filter(l => !userAvatarCache.has(l));
    if (uncached.length > 0) {
      const s = await getTwitchCredentialsStore(); const c = s ? await s.load() : null;
      if (c) {
        try {
          const res = await net.fetch(`https://api.twitch.tv/helix/users?${uncached.map(l => `login=${encodeURIComponent(l)}`).join('&')}`, { headers: { Authorization: `Bearer ${c.oauthToken.replace(/^oauth:/,'')}`, 'Client-Id': TWITCH_CLIENT_ID } });
          const d = await res.json(); (d.data ?? []).forEach((u: any) => userAvatarCache.set(u.login.toLowerCase(), u.profile_image_url));
          uncached.forEach(l => { if (!userAvatarCache.has(l.toLowerCase())) userAvatarCache.set(l.toLowerCase(), ''); });
        } catch (err) {
          logService.warn('twitch', 'Failed to fetch user avatars', { error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    const res: Record<string, string> = {}; list.forEach(l => { const u = userAvatarCache.get(l.toLowerCase()); if (u) res[l] = u; });
    return res;
  });
  ipcMain.handle(IPC_CHANNELS.twitchGetBadgeUrls, async (_, ids) => {
    const list = Array.isArray(ids) ? ids.filter(i => typeof i === 'string') : [];
    if (list.length === 0) return {};
    if (list.some(i => !badgeCache.has(i))) {
      const s = await getTwitchCredentialsStore(); const c = s ? await s.load() : null;
      if (c) {
        try {
          const h = { Authorization: `Bearer ${c.oauthToken.replace(/^oauth:/,'')}`, 'Client-Id': TWITCH_CLIENT_ID };
          const g = await net.fetch('https://api.twitch.tv/helix/chat/badges/global', { headers: h });
          const gd = await g.json(); (gd.data ?? []).forEach((set: any) => set.versions.forEach((v: any) => badgeCache.set(`${set.set_id}/${v.id}`, v.image_url_1x)));
          const u = await net.fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(c.channel)}`, { headers: h });
          const ud = await u.json(); const uid = ud.data?.[0]?.id;
          if (uid) {
            const ch = await net.fetch(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${uid}`, { headers: h });
            const cd = await ch.json(); (cd.data ?? []).forEach((set: any) => set.versions.forEach((v: any) => badgeCache.set(`${set.set_id}/${v.id}`, v.image_url_1x)));
          }
        } catch (err) {
          logService.warn('twitch', 'Failed to fetch badge URLs', { error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    const res: Record<string, string> = {}; list.forEach(i => { const u = badgeCache.get(i); if (u) res[i] = u; });
    return res;
  });
  ipcMain.handle(IPC_CHANNELS.twitchStartOAuth, async () => {
    return new Promise((resolve, reject) => {
      const OAUTH_TIMEOUT_MS = 120_000;
      const timeout = setTimeout(() => { server.close(); reject(new Error('OAuth timed out')); }, OAUTH_TIMEOUT_MS);
      const cleanup = () => { clearTimeout(timeout); server.close(); };
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, `http://localhost:${TWITCH_REDIRECT_PORT}`);
        if (url.pathname === '/callback') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!DOCTYPE html><html><body style="background:#0e0e10;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><div>Connecting...<script>const t=new URLSearchParams(window.location.hash.substring(1)).get("access_token");if(t){fetch("/token?t="+t).then(()=>document.body.innerHTML="Connected! You can close this tab.")}else{fetch("/token-error").then(()=>document.body.innerHTML="Authorization denied. You can close this tab.")}</script></div></body></html>'); return; }
        if (url.pathname === '/token-error') { res.end('ok'); cleanup(); reject(new Error('OAuth authorization was denied')); return; }
        if (url.pathname === '/token') {
          const t = url.searchParams.get('t');
          res.end('ok');
          if (!t) { cleanup(); return reject(new Error('No token')); }
          try {
            logService.info('twitch-oauth', 'Received token, fetching user info...');
            const r = await net.fetch('https://api.twitch.tv/helix/users', { headers: { Authorization: `Bearer ${t}`, 'Client-Id': TWITCH_CLIENT_ID } });
            if (!r.ok) {
              const body = await r.text();
              cleanup();
              logService.error('twitch-oauth', `Helix API returned ${r.status}`, { body });
              return reject(new Error(`Twitch API error: ${r.status}`));
            }
            const d = await r.json();
            const login = d.data?.[0]?.login;
            logService.info('twitch-oauth', `Helix response login: ${login ?? '(none)'}`);
            cleanup();
            if (!login) return reject(new Error('Failed to fetch Twitch username'));
            resolve({ accessToken: t, username: login });
          } catch (err) {
            cleanup();
            logService.error('twitch-oauth', 'OAuth token exchange failed', { error: err instanceof Error ? err.message : String(err) });
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        }
      });
      server.on('error', (err) => { clearTimeout(timeout); reject(err); });
      server.listen(TWITCH_REDIRECT_PORT, '127.0.0.1', () => shell.openExternal(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=http://localhost:${TWITCH_REDIRECT_PORT}/callback&response_type=token&scope=chat:read+chat:edit`));
    });
  });

  // YouTube Handlers
  ipcMain.handle(IPC_CHANNELS.youtubeGetSettings, async () => loadYoutubeSettings());
  ipcMain.handle(IPC_CHANNELS.youtubeSaveSettings, async (_, raw) => saveYoutubeSettings(raw));
  ipcMain.handle(IPC_CHANNELS.youtubeConnect, async (_, raw) => {
    const i = youtubeConnectSchema.parse(raw);
    const fmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });
    if (!youtubeScrapers.has(i.videoId)) {
      const idx = youtubeScrapers.size;
      const platform = YT_PLATFORMS[idx] ?? 'youtube-v';
      const label = String(idx + 1);
      youtubeStreamData.set(i.videoId, { label, viewerCount: null, subscriberCount: null, platform, channelHandle: null });
      chatLogService.openSession(platform, i.videoId);
      suggestionService.clearSessionEntries();
      const scraper = new YouTubeScraper({
        videoId: i.videoId,
        onMessage: (m) => chatService.injectMessage({ id: `yt-${Date.now()}`, timestampLabel: fmt.format(new Date()), ...m, platform, streamLabel: label }),
        onEvent: (e) => chatService.injectEvent({ id: `yt-event-${Date.now()}`, timestampLabel: fmt.format(new Date()), ...e, platform, streamLabel: label }),
        onLog: (msg) => logService.info('youtube', msg),
      });
      youtubeScrapers.set(i.videoId, scraper);
      await scraper.start();
    }
    options.stateHub.pushYoutubeStatus(getYoutubeStreams());
  });
  ipcMain.handle(IPC_CHANNELS.youtubeDisconnect, async () => {
    for (const [videoId] of youtubeScrapers) {
      const data = youtubeStreamData.get(videoId);
      if (data) chatLogService.closeSession(data.platform);
    }
    for (const scraper of youtubeScrapers.values()) scraper.stop();
    youtubeScrapers.clear();
    youtubeStreamData.clear();
    options.stateHub.pushYoutubeStatus([]);
  });
  ipcMain.handle(IPC_CHANNELS.youtubeGetStatus, async () => getYoutubeStreams());
  ipcMain.handle(IPC_CHANNELS.youtubeOpenLogin, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const win = new BrowserWindow({
      width: 600,
      height: 800,
      parent,
      modal: Boolean(parent),
      title: 'YouTube Login',
      autoHideMenuBar: true,
    });

    win.webContents.on('did-navigate', (_, url) => {
      const target = new URL(url);
      if (target.hostname.includes('youtube.com') && target.pathname === '/' && !url.includes('signin')) {
        setTimeout(() => {
          if (!win.isDestroyed()) win.close();
        }, 1500);
      }
    });

    try {
      await win.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/signin?action_handle_signin=true');
    } catch (cause) {
      const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
      if (code !== 'ERR_ABORTED' && code !== 'ERR_FAILED') throw cause;
    }
  });
  ipcMain.handle(IPC_CHANNELS.youtubeCheckLive, async (_, handle: unknown) => {
    const streams = await checkYouTubeLive(String(handle ?? ''));
    return { videoIds: streams.map((s) => s.videoId) };
  });

  // TikTok Handlers
  ipcMain.handle(IPC_CHANNELS.tiktokGetSettings, async () => { const s = await getTiktokSettingsStore(); return s ? s.load() : { username: '', signApiKey: '', autoConnect: false }; });
  ipcMain.handle(IPC_CHANNELS.tiktokSaveSettings, async (_, raw) => { const s = await getTiktokSettingsStore(); if (s) await s.save(tiktokSettingsSchema.parse(raw)); });
  ipcMain.handle(IPC_CHANNELS.tiktokConnect, async (_, raw) => {
    const c = tiktokConnectSchema.parse(raw);
    setTiktokStatus('connecting', c.username);
    chatLogService.openSession('tiktok', c.username);
    suggestionService.clearSessionEntries();
    const settingsStore = await getTiktokSettingsStore();
    const settings = settingsStore ? await settingsStore.load() : null;
    logService.info('tiktok', 'Connecting', { username: c.username, hasSignApiKey: Boolean(settings?.signApiKey) });
    await chatService.replaceAdapter(createTikTokChatAdapter({
      username: c.username,
      signApiKey: settings?.signApiKey || undefined,
      onError: (cause) => logTikTokConnectionError('Connection error', c.username, Boolean(settings?.signApiKey), cause),
      onStatusChange: (status) => setTiktokStatus(status),
    }));
  });
  ipcMain.handle(IPC_CHANNELS.tiktokDisconnect, async () => {
    chatLogService.closeSession('tiktok');
    await chatService.removeAdapter('tiktok');
    setTiktokStatus('disconnected', null);
  });
  ipcMain.handle(IPC_CHANNELS.tiktokGetStatus, async () => tiktokStatus);
  ipcMain.handle(IPC_CHANNELS.tiktokCheckLive, async (_, username: unknown) => {
    const u = String(username ?? '').replace(/^@/, '');
    if (!u) return { isLive: false };
    const adapter = createTikTokChatAdapter({ username: u });
    const isLive = await adapter.fetchIsLive();
    return { isLive };
  });

  // Kick Handlers
  ipcMain.handle(IPC_CHANNELS.kickGetSettings, async () => {
    const store = await getKickSettingsStore();
    return store ? store.load() : defaultKickSettings();
  });
  ipcMain.handle(IPC_CHANNELS.kickSaveSettings, async (_, raw) => {
    const store = await getKickSettingsStore();
    if (!store) throw new Error('No active profile');
    const settings = kickSettingsSchema.parse(raw);
    await store.save(settings);
  });
  ipcMain.handle(IPC_CHANNELS.kickStartOAuth, async () => {
    const credentials = await resolveKickApiCredentials();
    const store = await getKickSettingsStore();
    const settings = store ? await store.load() : defaultKickSettings();
    const fallbackChannelSlug = normalizeKickChannelInput(settings.channelInput);
    const session = await startKickOAuth(credentials.clientId, credentials.clientSecret, fallbackChannelSlug);
    const tokenStore = await getKickTokenStore();
    await tokenStore?.save(session);
    return { channelSlug: session.channelSlug };
  });
  ipcMain.handle(IPC_CHANNELS.kickConnect, async (_, raw) => {
    const input = kickConnectSchema.parse(raw);
    const channelSlug = normalizeKickChannelInput(input.channelInput);
    if (!channelSlug) {
      throw new Error('Kick channel is required. Use slug or URL like https://kick.com/channel');
    }

    const credentials = await resolveKickApiCredentials(input);
    const authSession = await ensureKickAuthSession(channelSlug, credentials, false);

    setKickStatus('connecting', channelSlug);
    chatLogService.openSession('kick', channelSlug);
    suggestionService.clearSessionEntries();

    try {
      await chatService.replaceAdapter(createKickChatAdapter({
        channelSlug,
        broadcasterUserId: authSession?.broadcasterUserId,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        oauthToken: authSession?.token,
      }));
      setKickStatus('connected', channelSlug);
      startKickStatsPoll(channelSlug, credentials, authSession);
    } catch (cause) {
      stopKickStatsPoll();
      setKickStatus('error', channelSlug);
      throw cause;
    }
  });
  ipcMain.handle(IPC_CHANNELS.kickDisconnect, async () => {
    chatLogService.closeSession('kick');
    await chatService.removeAdapter('kick');
    stopKickStatsPoll();
    setKickStatus('disconnected', null);
  });
  ipcMain.handle(IPC_CHANNELS.kickGetStatus, async () => kickStatus);
  ipcMain.handle(IPC_CHANNELS.kickGetAuthStatus, async () => getKickAuthStatus());

  // Auto-reconnect Twitch from saved credentials on startup
  void (async () => {
    const store = await getTwitchCredentialsStore();
    if (!store) return;
    const creds = await store.load();
    if (!creds) return;
    try {
      const token = creds.oauthToken.replace(/^oauth:/, '');
      await loadTwitchBadges(creds.channel, token);
      chatLogService.openSession('twitch', creds.channel);
      suggestionService.clearSessionEntries();
      twitchChannel = creds.channel;
      await chatService.replaceAdapter(createTwitchChatAdapter({
        channels: [creds.channel],
        username: creds.username,
        password: creds.oauthToken,
        onStatusChange: setTwitchStatus,
        resolveBadgeUrls,
      }));
      logService.info('twitch', 'Auto-reconnected from saved credentials', { channel: creds.channel });
    } catch (cause) {
      logService.warn('twitch', 'Auto-reconnect failed', { error: cause instanceof Error ? cause.message : String(cause) });
    }
  })();

  startYoutubeMonitor();

  // Auto-reconnect TikTok from saved settings on startup
  void (async () => {
    const store = await getTiktokSettingsStore();
    if (!store) return;
    const settings = await store.load();
    if (!settings.autoConnect || !settings.username) return;
    try {
      setTiktokStatus('connecting', settings.username);
      chatLogService.openSession('tiktok', settings.username);
      suggestionService.clearSessionEntries();
      await chatService.replaceAdapter(createTikTokChatAdapter({
        username: settings.username,
        signApiKey: settings.signApiKey || undefined,
        onError: (cause) => logTikTokConnectionError('Auto-reconnect connection error', settings.username, Boolean(settings.signApiKey), cause),
        onStatusChange: (status) => setTiktokStatus(status),
      }));
      logService.info('tiktok', 'Auto-reconnected from saved settings', { username: settings.username });
    } catch (cause) {
      logService.warn('tiktok', 'Auto-reconnect failed', { error: cause instanceof Error ? cause.message : String(cause) });
    }
  })();

  // Auto-reconnect Kick from saved settings on startup
  void (async () => {
    const store = await getKickSettingsStore();
    if (!store) return;
    const settings = await store.load();
    const slug = normalizeKickChannelInput(settings.channelInput);
    if (!settings.autoConnect || !slug) return;
    try {
      const tokenStore = await getKickTokenStore();
      const authSession = tokenStore ? await tokenStore.load() : null;
      const credentials = await resolveKickApiCredentials({ clientId: settings.clientId, clientSecret: settings.clientSecret });
      setKickStatus('connecting', slug);
      chatLogService.openSession('kick', slug);
      suggestionService.clearSessionEntries();
      await chatService.replaceAdapter(createKickChatAdapter({
        channelSlug: slug,
        broadcasterUserId: authSession?.channelSlug === slug ? authSession.broadcasterUserId : null,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        oauthToken: authSession?.channelSlug === slug ? authSession.token : undefined,
      }));
      setKickStatus('connected', slug);
      startKickStatsPoll(slug, credentials, authSession?.channelSlug === slug ? authSession : null);
      logService.info('kick', 'Auto-reconnected from saved settings', { channelSlug: slug });
    } catch (cause) {
      stopKickStatsPoll();
      setKickStatus('error', slug);
      logService.warn('kick', 'Auto-reconnect failed', { channelSlug: slug, error: cause instanceof Error ? cause.message : String(cause) });
    }
  })();

  void raffleOverlayServer.start();
  raffleDeadlineRunner.start();
  schedulerService.start();
  obsService.start();

  return async () => {
    isShuttingDown = true;
    raffleDeadlineRunner.stop();
    raffleService.dispose();
    schedulerService.stop();
    stopTwitchStatsPoll();
    stopKickStatsPoll();
    if (youtubeMonitorTimer) clearInterval(youtubeMonitorTimer);
    await Promise.allSettled([chatService.disconnectAll(), obsService.stop(), raffleOverlayServer.stop()]);
    Object.values(IPC_CHANNELS).forEach(c => ipcMain.removeHandler(c));
  };

  async function speakWithOsFallback(text: string): Promise<void> {
    if (process.platform === 'darwin') await execFile('say', [text]);
    else if (process.platform === 'linux') await execFile('espeak', [text]);
    else if (process.platform === 'win32') await execFile('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak('${text.replace(/'/g, "''")}')`]);
    else options.stateHub.pushVoiceSpeak({ text, lang: 'en-US' });
  }

  async function pushLocalOutboundMessage(platform: PlatformId, content: string): Promise<void> {
    let author = 'Streamer Copilot';
    if (platform === 'twitch') {
      const store = await getTwitchCredentialsStore();
      const creds = store ? await store.load() : null;
      if (creds?.username) author = creds.username;
    } else if (platform === 'kick') {
      const authStatus = await getKickAuthStatus();
      if (authStatus.channelSlug) author = authStatus.channelSlug;
    }

    options.stateHub.pushChatMessage({
      id: `sent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      platform,
      author,
      content,
      badges: [],
      timestampLabel: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
    });
  }

  async function sendPlatformMessage(platform: PlatformId, content: string): Promise<void> {
    if (platform === 'youtube' || platform === 'youtube-v') {
      const scraper = getYoutubeScraperByPlatform(platform);
      if (!scraper) {
        throw new Error('Log in to YouTube in Platforms before sending messages.');
      }
      try {
        await scraper.sendMessage(content);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (/login|not available|not ready|not connected/i.test(message)) {
          throw new Error('Log in to YouTube in Platforms before sending messages.');
        }
        throw cause;
      }
      return;
    }

    if (platform === 'kick') {
      const authStatus = await getKickAuthStatus();
      if (!authStatus.isAuthorized || !authStatus.channelSlug) {
        throw new Error('Log in to Kick in Platforms before sending messages.');
      }
    }

    try {
      await chatService.sendMessage(platform, content);
    } catch (cause) {
      if (platform === 'kick') {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (/authorization|chat:write|oauth|forbidden|401|403/i.test(message)) {
          throw new Error('Log in to Kick in Platforms before sending messages.');
        }
        throw new Error(message || 'Log in to Kick in Platforms before sending messages.');
      }
      throw cause;
    }
  }

  function logTikTokConnectionError(message: string, username: string, hasSignApiKey: boolean, cause: unknown): void {
    const metadata = {
      username,
      hasSignApiKey,
      errorName: cause instanceof Error ? cause.name : undefined,
      error: cause instanceof Error ? cause.message : String(cause),
      stack: cause instanceof Error ? cause.stack : undefined,
    };
    logService.error('tiktok', message, metadata);
    console.error(`[tiktok] ${message}`, metadata);
  }

  function formatWinnerAnnouncement(raffle: Raffle, winnerName: string): string {
    return raffle.winnerAnnouncementTemplate
      .replaceAll('{winner}', winnerName)
      .replaceAll('{title}', raffle.title);
  }

  function getConnectedYoutubePlatforms(): Array<'youtube' | 'youtube-v'> {
    const connected = new Set<'youtube' | 'youtube-v'>();
    for (const data of youtubeStreamData.values()) {
      connected.add(data.platform);
    }
    return YT_PLATFORMS.filter((platform) => connected.has(platform));
  }

  function getConnectedScheduledTargets(): PlatformId[] {
    const connected: PlatformId[] = [];
    if (twitchStatus === 'connected') connected.push('twitch');
    if (getConnectedYoutubePlatforms().length > 0) connected.push('youtube');
    return connected;
  }

  function resolveRaffleAnnouncementTargets(requestedTargets: PlatformId[]): PlatformId[] {
    const resolved = new Set<PlatformId>();
    for (const target of requestedTargets) {
      if (target === 'youtube' || target === 'youtube-v') {
        for (const ytTarget of getConnectedYoutubePlatforms()) resolved.add(ytTarget);
        continue;
      }
      if (target === 'twitch' && twitchStatus === 'connected') {
        resolved.add('twitch');
        continue;
      }
      if (target === 'kick') resolved.add('kick');
    }
    return Array.from(resolved);
  }

  function resolveDispatchTargets(requestedTargets: PlatformId[]): PlatformId[] {
    const resolved = new Set<PlatformId>();
    for (const target of requestedTargets) {
      if (!SCHEDULED_SUPPORTED_TARGETS.includes(target)) continue;
      if (target === 'twitch') {
        if (twitchStatus === 'connected') resolved.add('twitch');
        continue;
      }
      if (target === 'youtube') {
        for (const ytTarget of getConnectedYoutubePlatforms()) {
          resolved.add(ytTarget);
        }
      }
    }
    return Array.from(resolved);
  }

  function getYoutubeScraperByPlatform(platform: 'youtube' | 'youtube-v'): YouTubeScraper | null {
    for (const [videoId, scraper] of youtubeScrapers.entries()) {
      const data = youtubeStreamData.get(videoId);
      if (data?.platform === platform) return scraper;
    }
    return null;
  }

  function listCommandScheduleTasks(): ScheduledTask[] {
    const textTasks = textRepository.list()
      .filter((command) => command.enabled && command.schedule?.enabled)
      .map((command) => ({
        id: `text:${command.id}`,
        intervalSeconds: command.schedule!.intervalSeconds,
        randomWindowSeconds: command.schedule!.randomWindowSeconds,
        targetPlatforms: command.schedule!.targetPlatforms,
        enabled: true,
        lastSentAt: command.schedule!.lastSentAt,
      }));

    const soundTasks = soundRepository.list()
      .filter((command) => command.enabled && command.schedule?.enabled)
      .map((command) => ({
        id: `sound:${command.id}`,
        intervalSeconds: command.schedule!.intervalSeconds,
        randomWindowSeconds: command.schedule!.randomWindowSeconds,
        targetPlatforms: [],
        enabled: true,
        lastSentAt: command.schedule!.lastSentAt,
      }));

    return [...textTasks, ...soundTasks];
  }

  function markCommandScheduleSent(id: string, sentAt: string): void {
    const [kind, commandId] = splitScheduleTaskId(id);
    if (kind === 'text') textRepository.markScheduleSent(commandId, sentAt);
    if (kind === 'sound') soundRepository.markScheduleSent(commandId, sentAt);
  }

  function resolveScheduledTaskTargets(task: ScheduledTask): PlatformId[] {
    if (task.id.startsWith('sound:')) return [];
    return resolveDispatchTargets(task.targetPlatforms);
  }

  async function dispatchCommandScheduleWithResult(task: ScheduledTask): Promise<ScheduledRunState> {
    const [kind, commandId] = splitScheduleTaskId(task.id);

    if (kind === 'sound') {
      const command = soundRepository.list().find((item) => item.id === commandId);
      if (!command?.enabled || !command.schedule?.enabled) {
        return { runAt: new Date().toISOString(), result: 'skipped', detail: 'Sound schedule is disabled or missing' };
      }
      options.stateHub.pushSoundPlay({ filePath: command.filePath });
      logService.info('scheduled-sound', 'Played scheduled sound', { commandId, filePath: command.filePath });
      return { runAt: new Date().toISOString(), result: 'sent', detail: 'played=[local]' };
    }

    const command = textRepository.list().find((item) => item.id === commandId);
    if (!command?.enabled || !command.schedule?.enabled) {
      return { runAt: new Date().toISOString(), result: 'skipped', detail: 'Text schedule is disabled or missing' };
    }
    return dispatchScheduledMessageWithResult(command.response, command.schedule.targetPlatforms);
  }

  function splitScheduleTaskId(id: string): ['text' | 'sound', string] {
    const separatorIndex = id.indexOf(':');
    const kind = id.slice(0, separatorIndex);
    const commandId = id.slice(separatorIndex + 1);
    return [kind === 'sound' ? 'sound' : 'text', commandId];
  }

  async function dispatchScheduledMessageWithResult(content: string, requestedTargets: PlatformId[]): Promise<ScheduledRunState> {
    const runAt = new Date().toISOString();
    const effectiveTargets = resolveDispatchTargets(requestedTargets);
    const sent: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];

    if (effectiveTargets.length === 0) {
      const detail = 'No connected targets (supported: twitch, youtube)';
      logService.warn('scheduled', 'Skipped message dispatch', { detail, requestedTargets, content });
      return { runAt, result: 'skipped', detail };
    }

    for (const target of effectiveTargets) {
      try {
        if (target === 'twitch') {
          await chatService.sendMessage('twitch', content);
          sent.push('twitch');
          logService.info('scheduled', 'Sent', { platform: 'twitch', content });
          continue;
        }

        if (target === 'youtube' || target === 'youtube-v') {
          const scraper = getYoutubeScraperByPlatform(target);
          if (!scraper) {
            const reason = `${target}: disconnected`;
            skipped.push(reason);
            logService.warn('scheduled', 'Skipped', { platform: target, reason, content });
            continue;
          }
          await scraper.sendMessage(content);
          sent.push(target);
          logService.info('scheduled', 'Sent', { platform: target, content });
          continue;
        }

        const reason = `${target}: not-supported`;
        skipped.push(reason);
        logService.warn('scheduled', 'Skipped', { platform: target, reason, content });
      } catch (error) {
        const detail = `${target}: ${error instanceof Error ? error.message : String(error)}`;
        failed.push(detail);
        logService.error('scheduled', 'Failed to send', { platform: target, detail, content });
      }
    }

    if (failed.length > 0) {
      return {
        runAt,
        result: 'failed',
        detail: `sent=[${sent.join(', ')}] failed=[${failed.join('; ')}] skipped=[${skipped.join('; ')}]`,
      };
    }
    if (sent.length > 0) {
      const detail = skipped.length > 0
        ? `sent=[${sent.join(', ')}] skipped=[${skipped.join('; ')}]`
        : `sent=[${sent.join(', ')}]`;
      return { runAt, result: 'sent', detail };
    }
    return { runAt, result: 'skipped', detail: skipped.join('; ') || 'No connected targets' };
  }

  function readCsvEnv(v: string | undefined): string[] | undefined { return v ? v.split(',').map(i => i.trim()).filter(Boolean) : undefined; }
  function readSingleValueAsArray(v: string | undefined): string[] | undefined { return v?.trim() ? [v.trim()] : undefined; }
}
