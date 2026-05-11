import { execFile as execFileCallback } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { BrowserWindow, Notification, app, dialog, ipcMain, net, shell } from 'electron';
import { parseFile as parseAudioFile } from 'music-metadata';

import type { DatabaseHandle } from '../db/database.js';
import { AccountRepository } from '../modules/accounts/account-repository.js';
import { ChatService } from '../modules/chat/chat-service.js';
import { ChatLogRepository } from '../modules/chat-log/chat-log-repository.js';
import { ChatLogService } from '../modules/chat-log/chat-log-service.js';
import { LogRepository } from '../modules/logs/log-repository.js';
import { LogService } from '../modules/logs/log-service.js';
import { ObsService } from '../modules/obs/obs-service.js';
import { ObsSettingsStore } from '../modules/obs/obs-settings-store.js';
import { PollDeadlineRunner } from '../modules/polls/poll-deadline-runner.js';
import { PollRepository } from '../modules/polls/poll-repository.js';
import { PollService, formatPollResult } from '../modules/polls/poll-service.js';
import { RaffleDeadlineRunner } from '../modules/raffles/raffle-deadline-runner.js';
import { OverlayServer } from './overlay-server.js';
import { RaffleRepository } from '../modules/raffles/raffle-repository.js';
import { RaffleService } from '../modules/raffles/raffle-service.js';
import { SchedulerService, type ScheduledRunState, type ScheduledTask } from '../modules/scheduled/scheduler-service.js';
import { GeneralSettingsStore } from '../modules/settings/general-settings-store.js';
import { ProfileStore } from '../modules/settings/profile-store.js';
import { SoundCommandRepository } from '../modules/sounds/sound-repository.js';
import { SoundService } from '../modules/sounds/sound-service.js';
import { SoundSettingsStore } from '../modules/sounds/sound-settings-store.js';
import { SuggestionRepository } from '../modules/suggestions/suggestion-repository.js';
import { SuggestionService } from '../modules/suggestions/suggestion-service.js';
import { TextCommandRepository } from '../modules/text/text-repository.js';
import { TextService } from '../modules/text/text-service.js';
import { TextSettingsStore } from '../modules/text/text-settings-store.js';
import { WelcomeSettingsStore } from '../modules/welcome/welcome-settings-store.js';
import { WelcomeService } from '../modules/welcome/welcome-service.js';
import { MusicSettingsStore } from '../modules/music/music-settings-store.js';
import { MusicRequestService } from '../modules/music/music-request-service.js';
import { searchYouTube as scrapeYouTube } from '../modules/music/youtube-search.js';
import { MusicPlayer } from './music-player.js';
import { MusicStreamResolver } from './music-stream-resolver.js';
import { VoiceCommandRepository } from '../modules/voice/voice-repository.js';
import { VoiceService } from '../modules/voice/voice-service.js';
import { type KickChatAdapter } from '../platforms/kick/adapter.js';
import { KickMultiChatAdapter } from '../platforms/kick/multi-adapter.js';
import { KickModerationApi, KICK_MODERATION_CAPABILITIES } from '../platforms/kick/moderation.js';
import { KickSettingsStore } from '../platforms/kick/settings-store.js';
import { KickTokenStore, type KickAuthSession, type KickAuthToken } from '../platforms/kick/token-store.js';
import { TikTokSettingsStore } from '../platforms/tiktok/settings-store.js';
import { TikTokMultiChatAdapter } from '../platforms/tiktok/multi-adapter.js';
import { TwitchCredentialsStore } from '../platforms/twitch/credentials-store.js';
import { type TwitchChatAdapter } from '../platforms/twitch/adapter.js';
import { TwitchMultiChatAdapter } from '../platforms/twitch/multi-adapter.js';
import { TwitchModerationApi, TWITCH_MODERATION_CAPABILITIES } from '../platforms/twitch/moderation.js';
import { YouTubeSettingsStore } from '../platforms/youtube/settings-store.js';
import { YouTubeChatAdapter } from '../platforms/youtube/scraper-adapter.js';
import { YouTubeApiChatAdapter, type YouTubeApiAccount } from '../platforms/youtube/api-adapter.js';
import { buildYouTubeOAuth2Client, decryptSecret, encryptSecret, startYouTubeOAuthFlow } from '../platforms/youtube/api-auth.js';
import { YTLiveClient } from './youtube-client.js';
import { MainPlatformRegistry, type MainPlatformProvider } from './platforms/registry.js';
import { getAllAudioBase64 } from '@sefinek/google-tts-api';
import { APP_NAME } from '../shared/constants.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import {
  type LiveStreamInfo,
  extractYtLiveVideoIds,
  extractYtSubscriberCount,
  extractYtLiveFromPlayerResponse,
  extractYtConcurrentViewers,
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
  pollControlInputSchema,
  pollDeleteInputSchema,
  pollUpsertInputSchema,
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
  moderationGetCapabilitiesSchema,
  moderationDeleteMessageSchema,
  moderationBanUserSchema,
  moderationUnbanUserSchema,
  moderationTimeoutUserSchema,
  moderationSetModeSchema,
  moderationManageRoleSchema,
  moderationRaidSchema,
  moderationShoutoutSchema,
  accountCreateInputSchema,
  accountUpdateInputSchema,
  accountIdInputSchema,
  selectProfileInputSchema,
  setAutoSelectActiveProfileSchema,
  textCommandDeleteInputSchema,
  textCommandUpsertInputSchema,
  textSettingsSchema,
  tiktokConnectSchema,
  tiktokSettingsSchema,
  twitchCredentialsSchema,
  voiceCommandDeleteInputSchema,
  voiceCommandUpsertInputSchema,
  voiceSpeakPayloadSchema,
  musicRequestSettingsSchema,
  musicPlayerEventSchema,
  welcomeSettingsSchema,
  youtubeConnectSchema,
  youtubeSettingsSchema,
  youtubeApiStartOAuthSchema,
} from '../shared/schemas.js';
import type { AppInfo, KickAuthStatus, KickConnectionStatus, KickLiveStats, KickSettings, MusicRequestSettings, PlatformAccount, PlatformId, Raffle, SoundSettings, StreamEvent, StreamEventType, TextSettings, TikTokConnectionStatus, TwitchConnectionStatus, TwitchLiveStats, WelcomeSettings, YouTubeSettings, YouTubeStreamInfo } from '../shared/types.js';

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
  getWindow: () => BrowserWindow | null;
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
  const generalSettingsStore = options.generalSettingsStore;
  const logRepository = new LogRepository(options.databaseHandle.db);
  const logService = new LogService(logRepository);
  logService.setMinLevel(generalSettingsStore.load().diagnosticLogLevel);
  const chatLogRepository = new ChatLogRepository(options.databaseHandle.db);
  const chatLogService = new ChatLogService(chatLogRepository);

  // Active profile directory — kept in sync with profile selection so all JSON repositories
  // resolve to the correct per-profile folder automatically.
  let activeProfileDirectory = '';
  const getActiveProfileDirectory = () => activeProfileDirectory;

  const accountRepository = new AccountRepository(getActiveProfileDirectory);
  const mainPlatforms = new MainPlatformRegistry();
  const raffleRepository = new RaffleRepository(getActiveProfileDirectory);
  const pollRepository = new PollRepository(getActiveProfileDirectory);
  const soundRepository = new SoundCommandRepository(getActiveProfileDirectory);
  const textRepository = new TextCommandRepository(getActiveProfileDirectory);
  const voiceRepository = new VoiceCommandRepository(getActiveProfileDirectory);
  const suggestionRepository = new SuggestionRepository(getActiveProfileDirectory);
  const obsSettingsStore = new ObsSettingsStore(getActiveProfileDirectory);

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

  // Text settings: file-based, per-profile. Cached in memory for synchronous access in canRun().
  let textSettingsCache: TextSettings = { defaultCooldownSeconds: 0, defaultUserCooldownSeconds: 0 };

  const getTextSettingsStore = async (): Promise<TextSettingsStore | null> => {
    const snapshot = await profileStore.list();
    const active = snapshot.profiles.find((p) => p.id === snapshot.activeProfileId);
    if (!active) return null;
    return new TextSettingsStore(active.directory);
  };

  const reloadTextSettingsCache = async (): Promise<void> => {
    const store = await getTextSettingsStore();
    if (store) textSettingsCache = await store.load();
  };

  // Welcome settings: file-based, per-profile. Cached in memory for sync access.
  let welcomeSettingsCache: WelcomeSettings = { enabled: false, messageTemplate: 'Welcome, {username}!', soundFilePath: null, userOverrides: [] };

  const getWelcomeSettingsStore = async (): Promise<WelcomeSettingsStore | null> => {
    const snapshot = await profileStore.list();
    const active = snapshot.profiles.find((p) => p.id === snapshot.activeProfileId);
    if (!active) return null;
    return new WelcomeSettingsStore(active.directory);
  };

  const reloadWelcomeSettingsCache = async (): Promise<void> => {
    const store = await getWelcomeSettingsStore();
    if (store) welcomeSettingsCache = await store.load();
  };

  // Music request settings: file-based, per-profile. Cached in memory for sync access.
  let musicSettingsCache: MusicRequestSettings = {
    enabled: false, volume: 0.5, maxQueueSize: 20, maxDurationSeconds: 600,
    requestTrigger: '!sr', skipTrigger: '!skip', queueTrigger: '!queue', cancelTrigger: '!cancel',
    requestPermissions: ['everyone'], skipPermissions: ['moderator', 'broadcaster'],
    cooldownSeconds: 5, userCooldownSeconds: 30,
  };

  const getMusicSettingsStore = async (): Promise<MusicSettingsStore | null> => {
    const snapshot = await profileStore.list();
    const active = snapshot.profiles.find((p) => p.id === snapshot.activeProfileId);
    if (!active) return null;
    return new MusicSettingsStore(active.directory);
  };

  const reloadMusicSettingsCache = async (): Promise<void> => {
    const store = await getMusicSettingsStore();
    if (store) musicSettingsCache = await store.load();
  };

  // Load caches on startup (non-blocking, best-effort).
  // Also resolve the active profile directory so all per-profile JSON repos are immediately usable.
  // Resolve active profile directory before starting OBS, which needs it synchronously via hasUserSettings().
  // Returns a promise so obsService.start() can be deferred until after the directory is known.
  const activeProfileDirectoryReady = (async () => {
    const snapshot = await profileStore.list();
    const active = snapshot.profiles.find((p) => p.id === snapshot.activeProfileId);
    if (active) activeProfileDirectory = active.directory;
  })();
  void reloadSoundSettingsCache();
  void reloadTextSettingsCache();
  void reloadWelcomeSettingsCache();
  void reloadMusicSettingsCache();

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
    getSettings: () => textSettingsCache,
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
  const welcomeService = new WelcomeService({
    getSettings: () => welcomeSettingsCache,
    sendMessage: (platform, content) => sendPlatformMessage(platform, content),
    playSound: (payload) => options.stateHub.pushSoundPlay(payload),
    logInfo: (message, metadata) => logService.info('welcome', message, metadata),
    logError: (message, metadata) => logService.error('welcome', message, metadata),
  });
  // YouTube search for music requests
  async function searchYouTube(query: string): Promise<{ videoId: string; title: string; durationSeconds: number; thumbnailUrl: string | null } | null> {
    return scrapeYouTube(query);
  }

  // musicPlayer and musicService are mutually dependent; use a shared ref to avoid forward-reference issues.
  // R4: musicPlayer is now a state machine that publishes to /now-playing via OverlayServer;
  // it is wired below after the overlay server is constructed.
  let musicPlayerRef: MusicPlayer | null = null;

  const musicService = new MusicRequestService({
    getSettings: () => musicSettingsCache,
    searchYouTube,
    onPlay: (cmd) => void musicPlayerRef?.play(cmd),
    onStop: () => musicPlayerRef?.stop(),
    onStateUpdate: (state) => options.stateHub.pushMusicStateUpdate(state),
    onVolumeChange: (volume) => musicPlayerRef?.setVolume(volume),
    sendMessage: (platform, content) => sendPlatformMessage(platform, content),
    logInfo: (message, metadata) => logService.info('music', message, metadata),
    logError: (message, metadata) => logService.error('music', message, metadata),
    isBrowserSourceConnected: () => musicPlayerRef?.hasBrowserSource() ?? false,
  });

  let rendererSpeechSynthesisAvailable = process.platform !== 'linux';
  let isShuttingDown = false;
  const voiceService = new VoiceService({
    repository: voiceRepository,
    onSpeak: (payload) => {
      // Google TTS: lang field starts with "google:"
      if (payload.lang.startsWith('google:')) {
        const langCode = payload.lang.slice('google:'.length) || 'en';
        void speakWithGoogleTts(payload.text, langCode);
        return;
      }

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
    onPlaySound: (payload) => soundService.previewPlay(payload),
  });
  let twitchStatus: TwitchConnectionStatus = 'disconnected';
  let twitchChannel: string | null = null;
  // Maps platform → display name of the account that sends messages (used to skip self-welcomes)
  const selfSenderName: Partial<Record<string, string>> = {};
  /** Per-channel stats poll. Mirrors the Twitch pattern so multiple Kick
   *  channels can have their own viewer/follower counts pumped in parallel. */
  const kickStatsTimers = new Map<string, ReturnType<typeof setInterval>>();
  const userAvatarCache = new Map<string, string>();
  const badgeCache = new Map<string, string>();
  // R6 (YouTube): scraper pool + monitor lives inside YouTubeChatAdapter now
  // (constructed after chatService below). The variable is forward-declared
  // here so helpers defined earlier can defer to the adapter once it exists.
  let youtubeAdapter: YouTubeChatAdapter | null = null;

  // Ordered list of platform IDs for YouTube streams (first = horizontal, second = vertical)
  const YT_PLATFORMS: Array<'youtube' | 'youtube-v'> = ['youtube', 'youtube-v'];
  const SCHEDULED_SUPPORTED_TARGETS: PlatformId[] = ['twitch', 'youtube', 'youtube-api'];
  // eslint-disable-next-line prefer-const -- forward-declared; assigned after dependent services are created
  let raffleService: RaffleService;
  // eslint-disable-next-line prefer-const -- forward-declared; assigned after dependent services are created
  let pollService: PollService;

  /** Merged view of every active YouTube live across both drivers — the
   *  scrape adapter and the API adapter. The renderer consumes this single
   *  list (cards, live-links, filter chips). The `platform` field on each
   *  entry tells the consumer which driver it came from. */
  const getYoutubeStreams = (): YouTubeStreamInfo[] => [
    ...(youtubeAdapter?.getCurrentStreams() ?? []),
    ...(youtubeApiAdapter?.getCurrentStreams() ?? []),
  ];
  const pushMergedYoutubeStreams = (): void => {
    // YouTube has no single aggregate status — fan out each concurrent
    // stream as a live-stats entry keyed by videoId. The driver id (`youtube`,
    // `youtube-v`, `youtube-api`) lives on the stream itself, so this stays
    // free of hardcoded platform branches.
    for (const stream of getYoutubeStreams()) {
      options.stateHub.pushPlatformLiveStats(stream.platform, stream.videoId, stream);
    }
  };

  /**
   * Type guard for the two YouTube platform slots. Needed because PlatformId
   * is an open enum (`'twitch' | ... | (string & {})`) and the literal
   * narrowing `target === 'youtube'` doesn't survive the wider member.
   */
  const isYoutubePlatform = (p: PlatformId): p is 'youtube' | 'youtube-v' =>
    p === 'youtube' || p === 'youtube-v';

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
    if (settings.chatChannelName) {
      selfSenderName.youtube = settings.chatChannelName.toLowerCase();
      selfSenderName['youtube-v'] = settings.chatChannelName.toLowerCase();
    } else if (!settings.chatChannelPageId) {
      delete selfSenderName.youtube;
      delete selfSenderName['youtube-v'];
    }
    await refreshYoutubeAdapter();
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
    // R2: extra scopes for Kick moderation API (ban/timeout/clear-chat/chat-settings/mods/vips).
    const authUrl = kickClient.getAuthorizationUrl(pkce, [
      'public', 'channel:read', 'chat:write',
      'moderation:read', 'moderation:write',
    ]);

    return new Promise((resolve, reject) => {
      let finished = false;
      // eslint-disable-next-line prefer-const -- forward-declared; used in timeout before assignment
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

  const kickStatusListeners = new Set<() => void>();
  const setKickStatus = (status: KickConnectionStatus, slug?: string | null) => {
    kickStatus = status;
    if (slug !== undefined) kickSlug = slug;
    options.stateHub.pushPlatformStatus('kick', status, kickSlug);
    // Per-channel stats are managed by start/stopKickStatsPollFor — no global
    // null push here, otherwise multi-channel installs would clobber each
    // other's cards on every status flip.
    for (const listener of kickStatusListeners) listener();
  };

  /** Singleton wrapper holding one KickChatAdapter child per connected
   *  Kick account. Mirrors Twitch — registered once on demand, then children
   *  added/removed as accounts connect. */
  const kickMultiAdapter = new KickMultiChatAdapter();
  let kickMultiRegistered = false;
  const kickAccountStatus = new Map<string, KickConnectionStatus>();
  /** accountId -> channel slug, for stats poll teardown on disconnect. */
  const kickAccountSlug = new Map<string, string>();

  const ensureKickMultiRegistered = async (): Promise<void> => {
    if (kickMultiRegistered) return;
    kickMultiRegistered = true;
    await chatService.replaceAdapter(kickMultiAdapter);
  };

  const aggregateKickStatus = (): KickConnectionStatus => {
    const statuses = Array.from(kickAccountStatus.values());
    if (statuses.some((s) => s === 'connected')) return 'connected';
    if (statuses.some((s) => s === 'connecting')) return 'connecting';
    if (statuses.some((s) => s === 'error')) return 'error';
    return 'disconnected';
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
        if (fallback) options.stateHub.pushPlatformLiveStats('kick', channelSlug, fallback);
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
        if (fallback) options.stateHub.pushPlatformLiveStats('kick', channelSlug, fallback);
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
        if (fallback) options.stateHub.pushPlatformLiveStats('kick', channelSlug, fallback);
        return;
      }

      const stats: KickLiveStats = {
        viewerCount: channel.stream?.viewer_count ?? 0,
        followerCount: channel.follower_count ?? channel.followers_count ?? channel.followers ?? channel.total_followers ?? null,
        subscriberCount: typeof channel.active_subscribers_count === 'number' ? channel.active_subscribers_count : null,
        isLive: channel.stream?.is_live ?? (channel.stream?.viewer_count ?? 0) > 0,
      };
      options.stateHub.pushPlatformLiveStats('kick', channelSlug, stats);
    } catch {
      const fallback = await fetchKickLegacyStats(channelSlug);
      if (fallback) options.stateHub.pushPlatformLiveStats('kick', channelSlug, fallback);
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
    stopKickStatsPollFor(channelSlug);
    void pollKickStats(channelSlug, credentials, authSession);
    const timer = setInterval(() => void pollKickStats(channelSlug, credentials, authSession), 15_000);
    kickStatsTimers.set(channelSlug, timer);
  };

  const stopKickStatsPollFor = (channelSlug: string) => {
    const timer = kickStatsTimers.get(channelSlug);
    if (timer) {
      clearInterval(timer);
      kickStatsTimers.delete(channelSlug);
    }
    options.stateHub.pushPlatformLiveStats('kick', channelSlug, null);
  };

  const stopKickStatsPoll = () => {
    for (const channelSlug of Array.from(kickStatsTimers.keys())) {
      stopKickStatsPollFor(channelSlug);
    }
  };

  const tiktokStatusListeners = new Set<() => void>();
  /** Aggregate TikTok status — derived from per-account map below. The legacy
   *  global lives on for callers that still want a single status (live banner,
   *  scheduled targets, etc.). */
  const setTiktokStatus = (status: TikTokConnectionStatus, username?: string | null) => {
    tiktokStatus = status;
    if (username !== undefined) tiktokUsername = username;
    options.stateHub.pushPlatformStatus('tiktok', status, tiktokUsername);
    for (const listener of tiktokStatusListeners) listener();
  };

  /** Singleton wrapper holding one TikTokChatAdapter child per connected
   *  TikTok account. Registered with chatService once on demand. Subsequent
   *  connects/disconnects just add/remove children. Mirrors Twitch. */
  const tiktokMultiAdapter = new TikTokMultiChatAdapter();
  let tiktokMultiRegistered = false;
  const tiktokAccountStatus = new Map<string, TikTokConnectionStatus>();
  const tiktokAccountUsername = new Map<string, string>();
  /** Per-account "watching" flag: TikTok needs the user to be live to bind a
   *  room id, so when first connect fails we keep retrying. */
  const tiktokWatchingAccounts = new Set<string>();
  const tiktokRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const ensureTiktokMultiRegistered = async (): Promise<void> => {
    if (tiktokMultiRegistered) return;
    tiktokMultiRegistered = true;
    await chatService.replaceAdapter(tiktokMultiAdapter);
  };

  const aggregateTiktokStatus = (): TikTokConnectionStatus => {
    const statuses = Array.from(tiktokAccountStatus.values());
    if (statuses.some((s) => s === 'connected')) return 'connected';
    if (statuses.some((s) => s === 'connecting')) return 'connecting';
    if (statuses.some((s) => s === 'captcha')) return 'captcha';
    if (statuses.some((s) => s === 'error')) return 'error';
    return 'disconnected';
  };

  const checkYouTubeLive = async (handle: string): Promise<LiveStreamInfo[] | null> => {
    try {
      // Extract handle from full URL if needed (e.g. https://www.youtube.com/@user)
      const handleMatch = handle.match(/(?:youtube\.com\/)?(@?[\w-]+)(?:\/.*)?$/);
      const rawHandle = handleMatch ? handleMatch[1] : handle;
      const normalizedHandle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      };

      // Primary: /streams page — detect via thumbnailOverlayTimeStatusRenderer.style LIVE
      const streamsResponse = await net.fetch(`https://www.youtube.com/${normalizedHandle}/streams`, { headers });
      let streams: LiveStreamInfo[] = [];
      let subscriberCount: number | null = null;
      if (streamsResponse.ok) {
        const html = await streamsResponse.text();
        streams = extractYtLiveVideoIds(html);
        subscriberCount = extractYtSubscriberCount(html);
      }

      // Fallback: /@handle/live serves the live stream watch page directly.
      // Parse ytInitialPlayerResponse which has videoDetails.isLive explicitly —
      // more reliable when Electron's net.fetch gets a page without overlay metadata.
      if (streams.length === 0) {
        const liveResponse = await net.fetch(`https://www.youtube.com/${normalizedHandle}/live`, { headers });
        if (liveResponse.ok) {
          const liveHtml = await liveResponse.text();
          const liveStream = extractYtLiveFromPlayerResponse(liveHtml);
          if (liveStream) {
            streams = [liveStream];
            if (subscriberCount === null) subscriberCount = extractYtSubscriberCount(liveHtml);
          }
        }
      }

      return streams.map((stream) => ({ ...stream, subscriberCount: stream.subscriberCount ?? subscriberCount, channelHandle: normalizedHandle }));
    } catch (err) {
      logService.warn('youtube', 'Failed to check YouTube live', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  };

  const fetchYtLiveViewerCount = async (videoId: string): Promise<number | null> => {
    const id = encodeURIComponent(videoId);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    // Primary: /live_stats — cheap, plain-text counter that lights up while
    // the stream is live. YouTube has tightened this endpoint's filtering
    // and intermittently 404s it, so we fall back to parsing the watch page
    // for `videoDetails.viewCount` when the primary returns nothing usable.
    let primaryDetail = '';
    try {
      const resp = await net.fetch(`https://www.youtube.com/live_stats?v=${id}`, { headers });
      if (resp.ok) {
        const text = (await resp.text()).trim();
        const count = parseInt(text, 10);
        if (Number.isFinite(count) && count >= 0) return count;
        primaryDetail = `live_stats returned non-numeric (${text.slice(0, 30)})`;
      } else {
        primaryDetail = `live_stats ${resp.status}`;
      }
    } catch (cause) {
      primaryDetail = `live_stats threw (${cause instanceof Error ? cause.message : String(cause)})`;
    }

    // Fallback: parse the watch page. extractYtConcurrentViewers reads the
    // ytInitialPlayerResponse JSON's videoDetails.viewCount (which on live
    // streams is the concurrent watcher count) and falls back to the
    // "X watching now" badge string from ytInitialData.
    try {
      const resp = await net.fetch(`https://www.youtube.com/watch?v=${id}`, { headers });
      if (!resp.ok) {
        logService.warn('youtube', 'Viewer-count fallback failed', { videoId, primaryDetail, watchStatus: resp.status });
        return null;
      }
      const html = await resp.text();
      const count = extractYtConcurrentViewers(html);
      if (count === null) {
        logService.warn('youtube', 'Viewer-count fallback parsed no value', { videoId, primaryDetail, htmlLength: html.length });
      }
      return count;
    } catch (cause) {
      logService.warn('youtube', 'Viewer-count fallback threw', { videoId, primaryDetail, error: cause instanceof Error ? cause.message : String(cause) });
      return null;
    }
  };

  /**
   * Re-syncs the YouTubeChatAdapter's monitored handles from the persisted
   * YouTubeSettings. Called on save and on account connect/disconnect — the
   * adapter applies the new list and triggers an immediate monitor pass.
   */
  const refreshYoutubeAdapter = async (): Promise<void> => {
    if (!youtubeAdapter) return;
    const settings = await loadYoutubeSettings();
    const handles = settings.channels.filter((c) => c.enabled).map((c) => c.handle);
    // Auto-monitor is always on — every network auto-reconnects implicitly.
    youtubeAdapter.setMonitoredChannels(handles, { autoMonitor: true });
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
        hypeRes.json() as Promise<{ data?: Array<{ event_data: { level: number; progress: number; goal: number; expires_at: string }; event_type: string }> }>,
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

      options.stateHub.pushPlatformLiveStats('twitch', channel, {
        viewerCount: stream?.viewer_count ?? 0,
        followerCount: followersData.total ?? 0,
        isLive: !!stream,
        hypeTrain,
      });
    } catch (err) {
      logService.warn('twitch', 'Failed to poll Twitch stats', { error: err instanceof Error ? err.message : String(err), channel });
    }
  };

  /** Per-channel stats poll timers — keyed by channel so multiple Twitch
   *  accounts each get their own viewer/follower/hype-train feed. */
  const twitchStatsTimers = new Map<string, ReturnType<typeof setInterval>>();

  const startTwitchStatsPoll = (channel: string, accessToken: string) => {
    const existing = twitchStatsTimers.get(channel);
    if (existing) clearInterval(existing);
    void pollTwitchStats(channel, accessToken);
    const timer = setInterval(() => void pollTwitchStats(channel, accessToken), 10_000);
    twitchStatsTimers.set(channel, timer);
  };

  const stopTwitchStatsPollFor = (channel: string) => {
    const t = twitchStatsTimers.get(channel);
    if (t) clearInterval(t);
    twitchStatsTimers.delete(channel);
    options.stateHub.pushPlatformLiveStats('twitch', channel, null);
  };

  const stopTwitchStatsPoll = () => {
    for (const [, timer] of twitchStatsTimers) clearInterval(timer);
    twitchStatsTimers.clear();
  };

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

  const twitchStatusListeners = new Set<() => void>();
  /** Aggregate Twitch status flag for legacy consumers (live banner, scheduled
   *  targets, etc.). Stats polling is now per-channel — see
   *  `connectTwitchAccount` / `disconnectTwitchAccount`. */
  const setTwitchStatus = (status: TwitchConnectionStatus, channel?: string | null) => {
    twitchStatus = status;
    if (channel !== undefined) twitchChannel = channel;
    options.stateHub.pushPlatformStatus('twitch', status, twitchChannel);
    if (status !== 'connected') stopTwitchStatsPoll();
    for (const listener of twitchStatusListeners) listener();
  };

  /** Singleton wrapper that holds one TwitchChatAdapter child per connected
   *  Twitch account. Registered with chatService once, on demand, the first
   *  time an account connects. Subsequent connects/disconnects just add or
   *  remove children — the wrapper stays in place. */
  const twitchMultiAdapter = new TwitchMultiChatAdapter();
  let twitchMultiRegistered = false;
  /** Per-account Twitch status, separate from the legacy global `twitchStatus`. */
  const twitchAccountStatus = new Map<string, TwitchConnectionStatus>();

  const ensureTwitchMultiRegistered = async (): Promise<void> => {
    if (twitchMultiRegistered) return;
    twitchMultiRegistered = true;
    await chatService.replaceAdapter(twitchMultiAdapter);
  };

  /**
   * Spawns a Twitch child for one account and wires moderation. Re-entrant —
   * calling it again with the same `accountId` replaces the existing child.
   * `setTwitchStatus` is still called for the *first* connected account so
   * the legacy global status (used by stats polling, scheduled-target
   * resolution, etc.) keeps a sensible value.
   */
  /** Tracks the channel each account is bound to so disconnect can stop the
   *  matching stats poll. */
  const twitchAccountChannel = new Map<string, string>();

  const connectTwitchAccount = async (account: { accountId: string; channel: string; username: string; oauthToken: string }): Promise<void> => {
    await ensureTwitchMultiRegistered();
    twitchAccountStatus.set(account.accountId, 'connecting');
    twitchAccountChannel.set(account.accountId, account.channel);
    twitchStatusListeners.forEach((l) => l());
    if (twitchMultiAdapter.hasConnectedChild() === false) {
      setTwitchStatus('connecting', account.channel);
    }
    await twitchMultiAdapter.addAccount({
      accountId: account.accountId,
      channels: [account.channel],
      username: account.username,
      password: account.oauthToken,
      resolveBadgeUrls,
      onStatusChange: (status) => {
        twitchAccountStatus.set(account.accountId, status);
        twitchStatusListeners.forEach((l) => l());
        // Aggregate to the legacy global: connected if anyone connected,
        // otherwise mirror this child's state.
        const anyConnected = Array.from(twitchAccountStatus.values()).some((s) => s === 'connected');
        if (status === 'connected') {
          setTwitchStatus('connected', account.channel);
          // Per-channel stats poll (viewer count, follower count, hype train).
          startTwitchStatsPoll(account.channel, account.oauthToken.replace(/^oauth:/, ''));
        } else if (!anyConnected) {
          setTwitchStatus(status, account.channel);
        }
      },
    });
    const child = twitchMultiAdapter.getAccount(account.accountId);
    if (child) void wireTwitchModeration(child, account.channel, account.oauthToken);
  };

  const disconnectTwitchAccount = async (accountId: string): Promise<void> => {
    const channel = twitchAccountChannel.get(accountId);
    await twitchMultiAdapter.removeAccount(accountId);
    twitchAccountStatus.delete(accountId);
    twitchAccountChannel.delete(accountId);
    if (channel) stopTwitchStatsPollFor(channel);
    twitchStatusListeners.forEach((l) => l());
    if (!twitchMultiAdapter.hasConnectedChild()) {
      setTwitchStatus('disconnected', null);
    }
  };

  /** Shared connect path for the account model — used both by
   *  `twitchProvider.connect` (UI button) and the boot-time auto-reconnect.
   *  Validates providerData, primes per-channel side effects (badges, chat
   *  log session, suggestion entries, self-sender filter), and spawns the
   *  multi-adapter child. */
  const connectTwitchAccountFromRecord = async (account: PlatformAccount): Promise<void> => {
    const creds = {
      channel: account.channel,
      username: String((account.providerData as Record<string, unknown> | undefined)?.username ?? ''),
      oauthToken: String((account.providerData as Record<string, unknown> | undefined)?.oauthToken ?? ''),
    };
    if (!creds.username || !creds.oauthToken) {
      throw new Error('Twitch account missing username or oauthToken in providerData');
    }
    await loadTwitchBadges(creds.channel, creds.oauthToken.replace(/^oauth:/, ''));
    chatLogService.openSession('twitch', creds.channel);
    suggestionService.clearSessionEntries();
    selfSenderName.twitch = creds.username.toLowerCase();
    await connectTwitchAccount({ accountId: account.id, ...creds });
  };

  const overlayServer = new OverlayServer({
    port: generalSettingsStore.load().overlayServerPort,
    getOverlayState: () => {
      try {
        const active = raffleService.getActive();
        return active ? raffleService.getSnapshot(active.id).overlay : null;
      } catch {
        return null;
      }
    },
    getPollsOverlayState: () => {
      try {
        return pollService.buildOverlayState();
      } catch {
        return null;
      }
    },
    getChatSnapshot: () => chatService.getRecent(),
  });

  // R4: now that overlayServer exists, build the music player + stream resolver.
  const musicStreamResolver = new MusicStreamResolver();
  musicPlayerRef = new MusicPlayer(
    overlayServer,
    musicStreamResolver,
    (event) => musicService.onPlayerEvent(event),
  );
  // When OBS browser source toggles connection, push the latest music state so the
  // renderer warning banner updates in real time.
  overlayServer.onClientsChange('now-playing', () => {
    options.stateHub.pushMusicStateUpdate(musicService.getState());
  });

  raffleService = new RaffleService({
    repository: raffleRepository,
    getOverlayInfo: () => overlayServer.getOverlayInfo(),
    onState: (payload) => options.stateHub.pushRaffleState(payload),
    onEntry: (payload) => options.stateHub.pushRaffleEntry(payload),
    onResult: (payload) => options.stateHub.pushRaffleResult(payload),
    onAnnounceOpen: async (raffle) => {
      const content = raffle.openAnnouncementTemplate
        .replaceAll('{title}', raffle.title)
        .replaceAll('{command}', raffle.entryCommand);
      for (const target of resolveAnnouncementTargets(raffle.acceptedPlatforms)) {
        try {
          if (isYoutubePlatform(target)) {
            await sendYoutubeMessage(target, content);
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
      for (const target of resolveAnnouncementTargets(raffle.acceptedPlatforms)) {
        try {
          if (isYoutubePlatform(target)) {
            await sendYoutubeMessage(target, content);
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
      for (const target of resolveAnnouncementTargets(raffle.acceptedPlatforms)) {
        try {
          if (isYoutubePlatform(target)) {
            await sendYoutubeMessage(target, content);
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

  pollService = new PollService({
    repository: pollRepository,
    getOverlayInfo: () => overlayServer.getPollsOverlayInfo(),
    onState: (snapshot) => options.stateHub.pushPollState(snapshot),
    onVote: (vote) => options.stateHub.pushPollVote(vote),
    onAnnounceResult: async (poll, snapshot) => {
      options.stateHub.pushPollResult(snapshot);
      const template = poll.resultAnnouncementTemplate.trim();
      if (!template) return;
      const content = formatPollResult(template, poll, snapshot);
      if (!content) return;
      for (const target of resolveAnnouncementTargets(poll.acceptedPlatforms)) {
        try {
          if (isYoutubePlatform(target)) {
            await sendYoutubeMessage(target, content);
          } else {
            await chatService.sendMessage(target, content);
          }
          await pushLocalOutboundMessage(target, content);
        } catch (cause) {
          logService.warn('polls', 'Failed to send poll result announcement', {
            pollId: poll.id,
            platform: target,
            error: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
    },
    onLog: (level, message, metadata) => {
      if (level === 'error') logService.error('polls', message, metadata);
      else if (level === 'warn') logService.warn('polls', message, metadata);
      else logService.info('polls', message, metadata);
    },
  });

  const pollDeadlineRunner = new PollDeadlineRunner({
    onTick: () => pollService.syncDeadlines(),
  });

  const EVENT_TYPE_LABEL: Record<StreamEventType, string> = {
    subscription: 'New Subscription',
    superchat: 'Super Chat',
    raid: 'Raid',
    cheer: 'Cheer',
    follow: 'New Follower',
    gift: 'Gift Subscription',
  };

  function showEventNotification(event: StreamEvent): void {
    if (!Notification.isSupported()) return;

    const title = `${EVENT_TYPE_LABEL[event.type]} — ${event.platform}`;
    const bodyParts: string[] = [event.author];
    if (event.amount !== undefined) bodyParts.push(`Amount: ${event.amount}`);
    if (event.message) bodyParts.push(event.message);

    const notification = new Notification({ title, body: bodyParts.join(' · ') });
    notification.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        if (!win.isVisible()) win.show();
        win.focus();
      }
    });
    notification.show();
  }

  const chatService = new ChatService({
    commandModules: [soundService, textService, voiceService, raffleService, pollService, suggestionService, musicService],
    onMessage: (message) => {
      options.stateHub.pushChatMessage(message);
      if (!message.isHistory) {
        try { chatLogService.recordMessage(message); } catch { /* DB may not be open yet */ }
        const self = selfSenderName[message.platform];
        if (!self || message.author.toLowerCase() !== self) {
          welcomeService.handleMessage(message);
        }
      }
    },
    onEvent: (event) => {
      options.stateHub.pushChatEvent(event);
      if (options.generalSettingsStore.load().eventNotifications) {
        showEventNotification(event);
      }
    },
  });

  youtubeAdapter = new YouTubeChatAdapter({
    checkYouTubeLive,
    fetchYtLiveViewerCount,
    openChatLogSession: (platform, videoId) => chatLogService.openSession(platform, videoId),
    closeChatLogSession: (platform, videoId) => chatLogService.closeSession(platform, videoId),
    // The scrape adapter's stream list is merged with the API adapter's list
    // on every push, so cards / live-links / filter chips see both drivers.
    onStreamsChanged: () => pushMergedYoutubeStreams(),
    onScraperStart: () => suggestionService.clearSessionEntries(),
    log: {
      info: (msg) => logService.info('youtube', msg),
      warn: (msg) => logService.warn('youtube', msg),
    },
    getChatChannelPageId: async () => (await loadYoutubeSettings()).chatChannelPageId,
  });

  /**
   * Per-account YouTube API accounts, hot-cached and refreshed when accounts
   * change. Each entry owns its own OAuth2Client built from the credentials
   * stored on the PlatformAccount.providerData (encrypted via safeStorage).
   */
  let cachedYoutubeApiAccounts: YouTubeApiAccount[] = [];
  const refreshYoutubeApiAccounts = async (): Promise<void> => {
    if (!getActiveProfileDirectory()) {
      // Called before the profile is ready (cold start) or during a profile
      // switch — drop to an empty cache so the adapter quiesces, retry later.
      cachedYoutubeApiAccounts = [];
      youtubeApiAdapter.refresh();
      return;
    }
    const accounts = await accountRepository.list();
    const next: YouTubeApiAccount[] = [];
    for (const account of accounts) {
      if (account.providerId !== 'youtube-api') continue;
      if (!account.enabled) continue;
      const data = account.providerData as Record<string, unknown> | undefined;
      const clientId = typeof data?.clientId === 'string' ? data.clientId : '';
      const clientSecretEnc = typeof data?.clientSecretEncrypted === 'string' ? data.clientSecretEncrypted : '';
      const refreshTokenEnc = typeof data?.refreshTokenEncrypted === 'string' ? data.refreshTokenEncrypted : '';
      if (!clientId || !clientSecretEnc || !refreshTokenEnc) {
        logService.warn('youtube-api', `Account ${account.id} (${account.label}) missing credentials — skipping`);
        continue;
      }
      let oauth;
      try {
        const clientSecret = decryptSecret(clientSecretEnc);
        const refreshToken = decryptSecret(refreshTokenEnc);
        if (!clientSecret || !refreshToken) throw new Error('decrypt produced empty value');
        oauth = buildYouTubeOAuth2Client({ clientId, clientSecret, refreshToken });
      } catch (cause) {
        logService.warn('youtube-api', `Failed to decrypt credentials for ${account.label}: ${cause instanceof Error ? cause.message : String(cause)}`);
        continue;
      }
      next.push({
        accountId: account.id,
        channelId: account.channel,
        label: account.label,
        oauth,
      });
    }
    cachedYoutubeApiAccounts = next;
    youtubeApiAdapter.refresh();
  };

  const youtubeApiAdapter = new YouTubeApiChatAdapter({
    getActiveAccounts: () => cachedYoutubeApiAccounts,
    openChatLogSession: (platform, videoId) => chatLogService.openSession(platform, videoId),
    closeChatLogSession: (platform, videoId) => chatLogService.closeSession(platform, videoId),
    onClientStart: () => suggestionService.clearSessionEntries(),
    onStreamsChanged: () => pushMergedYoutubeStreams(),
    log: {
      info: (msg) => logService.info('youtube-api', msg),
      warn: (msg) => logService.warn('youtube-api', msg),
    },
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
    // Used by the boot-time profile picker (no app state yet) and any caller
    // that wants a soft selection without restarting. Long-lived services
    // (adapters, OAuth, schedulers, settings caches) keep their state — for a
    // hard reset use `profilesSwitchAndRelaunch` instead.
    const snapshot = await profileStore.select(selectProfileInputSchema.parse(raw).profileId);
    const active = snapshot.profiles.find((p) => p.id === snapshot.activeProfileId);
    if (active) activeProfileDirectory = active.directory;
    chatService.clearRecent();
    suggestionService.clearSessionEntries();
    welcomeService.reset();
    musicService.reset();
    await reloadSoundSettingsCache();
    await reloadTextSettingsCache();
    await reloadWelcomeSettingsCache();
    await reloadMusicSettingsCache();
    return snapshot;
  });

  ipcMain.handle(IPC_CHANNELS.profilesSwitchAndRelaunch, async (_, raw) => {
    // Used from the settings list, where the user is already running a
    // profile. Switching mid-session touches every long-lived service — we
    // relaunch instead of trying to reset them in place.
    const snapshot = await profileStore.select(selectProfileInputSchema.parse(raw).profileId);
    // Reset the boot auto-select flag — if the user is consciously switching
    // profiles, the next launch should ask again.
    await profileStore.setAutoSelectActiveProfile(false);
    setImmediate(() => {
      if (app.isPackaged) {
        // Production binary: standard relaunch + clean quit.
        app.relaunch();
        app.quit();
      } else {
        // Dev (under nodemon): app.relaunch() would spawn a detached Electron
        // orphaned to launchd while nodemon respawns its own — doubling
        // instances. And nodemon waits on clean exits. Force a non-zero exit
        // AFTER graceful before-quit cleanup so nodemon treats it as a crash
        // and brings up one fresh instance.
        app.once('will-quit', () => process.exit(42));
        app.quit();
      }
    });
    return snapshot;
  });
  ipcMain.handle(IPC_CHANNELS.profilesSetAutoSelect, async (_, raw) => {
    const i = setAutoSelectActiveProfileSchema.parse(raw);
    return profileStore.setAutoSelectActiveProfile(i.autoSelect);
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
    logService.setMinLevel(saved.diagnosticLogLevel);
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

  ipcMain.handle(IPC_CHANNELS.pollsList, async () => pollService.list());
  ipcMain.handle(IPC_CHANNELS.pollsUpsert, async (_, raw) => pollService.upsert(pollUpsertInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.pollsDelete, async (_, raw) => pollService.delete(pollDeleteInputSchema.parse(raw).id));
  ipcMain.handle(IPC_CHANNELS.pollsGetActive, async () => pollService.getActive());
  ipcMain.handle(IPC_CHANNELS.pollsGetSnapshot, async (_, raw) => pollService.getSnapshot(String(raw ?? '')));
  ipcMain.handle(IPC_CHANNELS.pollsControl, async (_, raw) => pollService.control(pollControlInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.pollsOverlayInfo, async () => pollService.getOverlayInfo());
  ipcMain.handle(IPC_CHANNELS.rafflesList, async () => raffleService.list());
  ipcMain.handle(IPC_CHANNELS.rafflesCreate, async (_, raw) => raffleService.create(raffleCreateInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.rafflesUpdate, async (_, raw) => raffleService.update(raffleUpdateInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.rafflesDelete, async (_, raw) => raffleService.delete(raffleDeleteInputSchema.parse(raw).id));
  ipcMain.handle(IPC_CHANNELS.rafflesGetActive, async () => raffleService.getActive());
  ipcMain.handle(IPC_CHANNELS.rafflesGetSnapshot, async (_, raw) => raffleService.getSnapshot(String(raw ?? '')));
  ipcMain.handle(IPC_CHANNELS.rafflesControl, async (_, raw) => raffleService.control(raffleControlActionInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.rafflesOverlayInfo, async () => raffleService.getOverlayInfo());
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
  ipcMain.handle(IPC_CHANNELS.textGetSettings, async () => {
    const store = await getTextSettingsStore();
    return store ? store.load() : textSettingsCache;
  });
  ipcMain.handle(IPC_CHANNELS.textSaveSettings, async (_, raw) => {
    const store = await getTextSettingsStore();
    if (!store) throw new Error('No active profile');
    const saved = await store.save(textSettingsSchema.parse(raw));
    textSettingsCache = saved;
    return saved;
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
    const safeTrigger = (input.trigger ?? '').replace(/^!+/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
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

  ipcMain.handle(IPC_CHANNELS.welcomeGetSettings, async () => {
    const store = await getWelcomeSettingsStore();
    return store ? store.load() : welcomeSettingsCache;
  });
  ipcMain.handle(IPC_CHANNELS.welcomeSaveSettings, async (_, raw) => {
    const store = await getWelcomeSettingsStore();
    if (!store) throw new Error('No active profile');
    const saved = await store.save(welcomeSettingsSchema.parse(raw));
    welcomeSettingsCache = saved;
    return saved;
  });
  ipcMain.handle(IPC_CHANNELS.welcomePickSoundFile, async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, {
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  // ── Music Request IPC ─────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.musicGetSettings, async () => {
    const store = await getMusicSettingsStore();
    return store ? store.load() : musicSettingsCache;
  });
  ipcMain.handle(IPC_CHANNELS.musicSaveSettings, async (_, raw) => {
    const store = await getMusicSettingsStore();
    if (!store) throw new Error('No active profile');
    const saved = await store.save(musicRequestSettingsSchema.parse(raw));
    musicSettingsCache = saved;
    musicPlayerRef?.setVolume(saved.volume);
    return saved;
  });
  ipcMain.handle(IPC_CHANNELS.musicSetVolume, async (_, raw) => { musicPlayerRef?.setVolume(Number(raw)); });
  ipcMain.handle(IPC_CHANNELS.musicGetState, async () => musicService.getState());
  ipcMain.handle(IPC_CHANNELS.musicSkip, async () => musicService.skip());
  ipcMain.handle(IPC_CHANNELS.musicClearQueue, async () => musicService.clearQueue());
  ipcMain.handle(IPC_CHANNELS.musicPlayerEvent, async (_, raw) => {
    const event = musicPlayerEventSchema.parse(raw);
    musicService.onPlayerEvent(event);
  });

  ipcMain.handle(IPC_CHANNELS.obsGetSettings, async () => obsService.getSettings());
  ipcMain.handle(IPC_CHANNELS.obsSaveSettings, async (_, raw) => obsService.saveSettings(obsConnectionSettingsSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.obsTestConnection, async (_, raw) => obsService.testConnection(obsConnectionSettingsSchema.parse(raw)));

  ipcMain.handle(IPC_CHANNELS.chatGetRecent, async () => chatService.getRecent());
  ipcMain.handle(IPC_CHANNELS.chatOverlayInfo, async () => {
    await overlayServer.start();
    return overlayServer.getChatOverlayInfo();
  });
  ipcMain.handle(IPC_CHANNELS.chatSendMessage, async (_, raw) => {
    const i = chatSendMessageSchema.parse(raw);
    await sendPlatformMessage(i.platform, i.content);
    if (i.platform !== 'youtube' && i.platform !== 'youtube-v' && i.platform !== 'kick') {
      await pushLocalOutboundMessage(i.platform, i.content);
    }
  });
  ipcMain.handle(IPC_CHANNELS.logsList, async (_, raw) => logService.list(eventLogFiltersSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.eventLogClearAll, async () => {
    logService.deleteAll();
  });

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
  ipcMain.handle(IPC_CHANNELS.chatLogClearAll, async () => {
    chatLogService.deleteAllSessions();
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
    await s.save(c);
    // Pre-load badges so first messages have badge images
    await loadTwitchBadges(c.channel, c.oauthToken.replace(/^oauth:/, ''));
    chatLogService.openSession('twitch', c.channel);
    suggestionService.clearSessionEntries();
    selfSenderName.twitch = c.username.toLowerCase();
    // Legacy IPC has no account id; use the channel as a stable key so
    // re-issuing this IPC for the same channel replaces the child cleanly.
    await connectTwitchAccount({ accountId: `legacy:${c.channel}`, channel: c.channel, username: c.username, oauthToken: c.oauthToken });
  });
  ipcMain.handle(IPC_CHANNELS.twitchDisconnect, async () => {
    delete selfSenderName.twitch;
    chatLogService.closeSessionsForPlatform('twitch');
    // Tear down every child the legacy IPC may have spawned. Account-model
    // disconnects flow through `twitchProvider.disconnect` instead.
    for (const accountId of Array.from(twitchAccountStatus.keys())) {
      if (accountId.startsWith('legacy:')) await disconnectTwitchAccount(accountId);
    }
    const s = await getTwitchCredentialsStore(); if (s) await s.clear();
  });
  ipcMain.handle(IPC_CHANNELS.twitchGetUserAvatars, async (_, logins) => {
    const list = Array.isArray(logins) ? logins.filter(l => typeof l === 'string') : [];
    if (list.length === 0) return {};
    const uncached = list.filter(l => !userAvatarCache.has(l));
    if (uncached.length > 0) {
      const s = await getTwitchCredentialsStore(); const c = s ? await s.load() : null;
      if (c) {
        try {
          const res = await net.fetch(`https://api.twitch.tv/helix/users?${uncached.map(l => `login=${encodeURIComponent(l)}`).join('&')}`, { headers: { Authorization: `Bearer ${c.oauthToken.replace(/^oauth:/,'')}`, 'Client-Id': TWITCH_CLIENT_ID } });
          const d = await res.json() as { data?: Array<{ login: string; profile_image_url: string }> }; (d.data ?? []).forEach((u) => userAvatarCache.set(u.login.toLowerCase(), u.profile_image_url));
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
          const gd = await g.json() as { data?: Array<{ set_id: string; versions: Array<{ id: string; image_url_1x: string }> }> }; (gd.data ?? []).forEach((set) => set.versions.forEach((v) => badgeCache.set(`${set.set_id}/${v.id}`, v.image_url_1x)));
          const u = await net.fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(c.channel)}`, { headers: h });
          const ud = await u.json(); const uid = ud.data?.[0]?.id;
          if (uid) {
            const ch = await net.fetch(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${uid}`, { headers: h });
            const cd = await ch.json() as { data?: Array<{ set_id: string; versions: Array<{ id: string; image_url_1x: string }> }> }; (cd.data ?? []).forEach((set) => set.versions.forEach((v) => badgeCache.set(`${set.set_id}/${v.id}`, v.image_url_1x)));
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
      // R2: extra scopes for Twitch moderation API (ban/timeout/delete/chat-settings/raids/shoutouts/mods/vips).
      const twitchScopes = [
        'chat:read', 'chat:edit',
        'moderator:manage:banned_users',
        'moderator:manage:chat_messages',
        'moderator:manage:chat_settings',
        'moderator:manage:shoutouts',
        'channel:manage:raids',
        'channel:manage:moderators',
        'channel:manage:vips',
      ].join('+');
      server.listen(TWITCH_REDIRECT_PORT, '127.0.0.1', () => shell.openExternal(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=http://localhost:${TWITCH_REDIRECT_PORT}/callback&response_type=token&scope=${twitchScopes}`));
    });
  });

  // YouTube Handlers
  ipcMain.handle(IPC_CHANNELS.youtubeGetSettings, async () => loadYoutubeSettings());
  ipcMain.handle(IPC_CHANNELS.youtubeSaveSettings, async (_, raw) => saveYoutubeSettings(raw));

  ipcMain.handle(IPC_CHANNELS.youtubeApiStartOAuth, async (_, raw) => {
    const input = youtubeApiStartOAuthSchema.parse(raw);
    const result = await startYouTubeOAuthFlow(
      { clientId: input.clientId, clientSecret: input.clientSecret },
      { log: (msg) => logService.info('youtube-api', msg) },
    );
    return {
      channelId: result.channelId,
      channelTitle: result.channelTitle ?? '',
      providerData: {
        clientId: input.clientId,
        clientSecretEncrypted: encryptSecret(input.clientSecret),
        refreshTokenEncrypted: encryptSecret(result.refreshToken),
        channelTitle: result.channelTitle,
      },
    };
  });

  ipcMain.handle(IPC_CHANNELS.youtubeConnect, async (_, raw) => {
    const i = youtubeConnectSchema.parse(raw);
    if (!youtubeAdapter) throw new Error('YouTube adapter not yet ready');
    await youtubeAdapter.addManualVideo(i.videoId);
  });
  ipcMain.handle(IPC_CHANNELS.youtubeDisconnect, async () => {
    youtubeAdapter?.stopAllScrapers();
  });
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

    // Resolve only when the popup is fully closed so the renderer can give
    // the user feedback ("Logado com sucesso") at the right moment.
    const closed = new Promise<void>((resolve) => {
      win.once('closed', () => resolve());
    });

    try {
      await win.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/signin?action_handle_signin=true');
    } catch (cause) {
      const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
      if (code !== 'ERR_ABORTED' && code !== 'ERR_FAILED') {
        if (!win.isDestroyed()) win.close();
        throw cause;
      }
    }

    await closed;
  });
  ipcMain.handle(IPC_CHANNELS.youtubeCheckLive, async (_, handle: unknown) => {
    const streams = await checkYouTubeLive(String(handle ?? ''));
    return { videoIds: (streams ?? []).map((s) => s.videoId) };
  });
  ipcMain.handle(IPC_CHANNELS.youtubeGetChatChannels, async () => {
    return YTLiveClient.getChatChannels();
  });

  // TikTok Handlers
  ipcMain.handle(IPC_CHANNELS.tiktokGetSettings, async () => { const s = await getTiktokSettingsStore(); return s ? s.load() : { username: '', autoConnect: false }; });
  ipcMain.handle(IPC_CHANNELS.tiktokSaveSettings, async (_, raw) => { const s = await getTiktokSettingsStore(); if (s) await s.save(tiktokSettingsSchema.parse(raw)); });
  ipcMain.handle(IPC_CHANNELS.tiktokConnect, async (_, raw) => {
    // Legacy single-account IPC. Modern callers go through accounts:connect →
    // tiktokProvider.connect; this path stays for back-compat with profiles
    // that still hit the legacy settings store. Route through the multi
    // adapter using a synthetic accountId so it coexists with new accounts.
    const c = tiktokConnectSchema.parse(raw);
    try {
      await connectTiktokAccount(`legacy:${c.username}`, c.username);
      const store = await getTiktokSettingsStore();
      if (store) await store.save({ username: c.username, autoConnect: true });
    } catch (cause) {
      setTiktokStatus('error', c.username);
      throw cause;
    }
  });
  ipcMain.handle(IPC_CHANNELS.tiktokDisconnect, async () => {
    // Tear down every TikTok child — legacy callers don't carry an accountId.
    for (const accountId of Array.from(tiktokAccountStatus.keys())) {
      await disconnectTiktokAccount(accountId);
    }
    setTiktokStatus('disconnected', null);
  });
  ipcMain.handle(IPC_CHANNELS.tiktokCheckLive, async (_, raw: unknown) => {
    const username = typeof raw === 'string' ? raw.trim() : '';
    if (!username) return { isLive: false };
    // Lightweight check — true if any connected child is currently bound to
    // this username. The wizard's "Add" step doesn't strictly require it.
    for (const [accountId, name] of tiktokAccountUsername) {
      if (name === username && tiktokAccountStatus.get(accountId) === 'connected') return { isLive: true };
    }
    return { isLive: false };
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
  ipcMain.handle(IPC_CHANNELS.kickStartOAuth, async (_, raw) => {
    const credentials = await resolveKickApiCredentials();
    const store = await getKickSettingsStore();
    const settings = store ? await store.load() : defaultKickSettings();
    // The Kick OAuth response sometimes omits the authorized channel (older
    // tokens scoped to chat:write only). Accept an explicit slug from the
    // caller so the wizard / Login flow can pass the slug typed in the form
    // or the slug stored on the existing account, falling back to the legacy
    // settings field for backwards compatibility.
    const explicitSlug = raw && typeof raw === 'object' && 'channelSlug' in raw && typeof (raw as { channelSlug?: unknown }).channelSlug === 'string'
      ? normalizeKickChannelInput((raw as { channelSlug: string }).channelSlug)
      : null;
    const fallbackChannelSlug = explicitSlug || normalizeKickChannelInput(settings.channelInput);
    const session = await startKickOAuth(credentials.clientId, credentials.clientSecret, fallbackChannelSlug);
    const tokenStore = await getKickTokenStore();
    await tokenStore?.save(session);
    return { channelSlug: session.channelSlug };
  });
  /**
   * Shared Kick per-account connect flow. Spawns a KickChatAdapter child in
   * the multi-adapter, wires moderation, and starts the per-channel stats
   * poll. Re-entrant — calling it again with the same accountId tears the
   * previous child down first.
   */
  async function connectKickAccount(
    accountId: string,
    channelSlug: string,
    credentialsInput: { clientId?: string; clientSecret?: string },
  ): Promise<void> {
    await ensureKickMultiRegistered();
    const credentials = await resolveKickApiCredentials(credentialsInput);
    const authSession = await ensureKickAuthSession(channelSlug, credentials, false);

    kickAccountStatus.set(accountId, 'connecting');
    kickAccountSlug.set(accountId, channelSlug);
    chatLogService.openSession('kick', channelSlug);
    suggestionService.clearSessionEntries();
    setKickStatus('connecting', channelSlug);

    try {
      await kickMultiAdapter.addAccount({
        accountId,
        channelSlug,
        broadcasterUserId: authSession?.broadcasterUserId ?? null,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        oauthToken: authSession?.token,
      });
      const child = kickMultiAdapter.getAccount(accountId);
      if (child) wireKickModeration(child, authSession);
      kickAccountStatus.set(accountId, 'connected');
      setKickStatus(aggregateKickStatus(), channelSlug);
      startKickStatsPoll(channelSlug, credentials, authSession);
    } catch (cause) {
      stopKickStatsPollFor(channelSlug);
      kickAccountStatus.set(accountId, 'error');
      setKickStatus(aggregateKickStatus(), channelSlug);
      throw cause;
    }
  }

  async function disconnectKickAccount(accountId: string): Promise<void> {
    const slug = kickAccountSlug.get(accountId);
    if (kickMultiAdapter.hasAccount(accountId)) {
      await kickMultiAdapter.removeAccount(accountId);
    }
    kickAccountStatus.delete(accountId);
    kickAccountSlug.delete(accountId);
    if (slug) stopKickStatsPollFor(slug);
    if (!kickMultiAdapter.hasConnectedChild()) {
      chatLogService.closeSessionsForPlatform('kick');
      setKickStatus('disconnected', null);
    } else {
      setKickStatus(aggregateKickStatus(), null);
    }
  }

  ipcMain.handle(IPC_CHANNELS.kickConnect, async (_, raw) => {
    // Legacy single-account IPC. Routes through the multi adapter using a
    // synthetic accountId so it coexists with new accounts.
    const input = kickConnectSchema.parse(raw);
    const channelSlug = normalizeKickChannelInput(input.channelInput);
    if (!channelSlug) {
      throw new Error('Kick channel is required. Use slug or URL like https://kick.com/channel');
    }
    await connectKickAccount(`legacy:${channelSlug}`, channelSlug, input);
  });
  ipcMain.handle(IPC_CHANNELS.kickDisconnect, async () => {
    // Tear down every Kick child — legacy callers don't carry an accountId.
    for (const accountId of Array.from(kickAccountStatus.keys())) {
      await disconnectKickAccount(accountId);
    }
    setKickStatus('disconnected', null);
  });
  ipcMain.handle(IPC_CHANNELS.kickGetAuthStatus, async () => getKickAuthStatus());

  // Auto-reconnect Twitch on startup. The account model is the source of
  // truth — for each enabled Twitch account, spin up a child in the
  // multi-adapter. AutoConnect is implicit: every enabled account reconnects
  // on boot. Only fall back to the legacy single-credentials store when no
  // Twitch accounts exist (back-compat for installs that haven't migrated).
  void (async () => {
    await activeProfileDirectoryReady;
    try {
      const accounts = await accountRepository.list();
      const twitchAccounts = accounts.filter(
        (a) => a.providerId === 'twitch' && a.enabled,
      );
      if (twitchAccounts.length > 0) {
        for (const account of twitchAccounts) {
          try {
            await connectTwitchAccountFromRecord(account);
            logService.info('twitch', 'Auto-reconnected account', { channel: account.channel, accountId: account.id });
          } catch (cause) {
            logService.warn('twitch', 'Auto-reconnect failed', {
              accountId: account.id,
              channel: account.channel,
              error: cause instanceof Error ? cause.message : String(cause),
            });
          }
        }
        return;
      }

      // Legacy fallback: pre-account-model installs.
      const store = await getTwitchCredentialsStore();
      if (!store) return;
      const creds = await store.load();
      if (!creds) return;
      const token = creds.oauthToken.replace(/^oauth:/, '');
      await loadTwitchBadges(creds.channel, token);
      chatLogService.openSession('twitch', creds.channel);
      suggestionService.clearSessionEntries();
      twitchChannel = creds.channel;
      selfSenderName.twitch = creds.username.toLowerCase();
      await connectTwitchAccount({
        accountId: `legacy:${creds.channel}`,
        channel: creds.channel,
        username: creds.username,
        oauthToken: creds.oauthToken,
      });
      logService.info('twitch', 'Auto-reconnected from legacy credentials', { channel: creds.channel });
    } catch (cause) {
      logService.warn('twitch', 'Auto-reconnect orchestration failed', {
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  })();

  void (async () => {
    if (!youtubeAdapter) return;
    const settings = await loadYoutubeSettings().catch(() => null);
    if (!settings) return;
    if (settings.chatChannelName) {
      selfSenderName.youtube = settings.chatChannelName.toLowerCase();
      selfSenderName['youtube-v'] = settings.chatChannelName.toLowerCase();
    }
    youtubeAdapter.setMonitoredChannels(
      settings.channels.filter((c) => c.enabled).map((c) => c.handle),
      { autoMonitor: true },
    );
    await chatService.replaceAdapter(youtubeAdapter);
  })();

  // Auto-attach the YouTube API adapter on startup. The adapter idles when
  // there are no enabled youtube-api accounts.
  void (async () => {
    // Wait for the profile directory to resolve — accountRepository.list()
    // throws otherwise during cold start.
    await activeProfileDirectoryReady;
    try {
      await refreshYoutubeApiAccounts();
    } catch (cause) {
      logService.warn('youtube-api', `Initial account scan failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    await chatService.replaceAdapter(youtubeApiAdapter);
  })();

  // Auto-reconnect TikTok on startup. Account-model takes precedence: spin up
  // a multi-adapter child per enabled tiktok account. Fall back to the legacy
  // single-account settings store for installs that haven't migrated.
  void (async () => {
    await activeProfileDirectoryReady;
    try {
      const accounts = await accountRepository.list();
      const tiktokAccounts = accounts.filter((a) => a.providerId === 'tiktok' && a.enabled);
      if (tiktokAccounts.length > 0) {
        for (const account of tiktokAccounts) {
          try {
            await connectTiktokAccount(account.id, account.channel);
            logService.info('tiktok', 'Auto-reconnected account', { username: account.channel, accountId: account.id });
          } catch (cause) {
            logService.warn('tiktok', 'Auto-reconnect failed', {
              accountId: account.id,
              username: account.channel,
              error: cause instanceof Error ? cause.message : String(cause),
            });
          }
        }
        return;
      }

      const store = await getTiktokSettingsStore();
      if (!store) return;
      const settings = await store.load();
      if (!settings.username) return;
      try {
        await connectTiktokAccount(`legacy:${settings.username}`, settings.username);
        logService.info('tiktok', 'Auto-reconnected from legacy settings', { username: settings.username });
      } catch (cause) {
        logService.warn('tiktok', 'Legacy auto-reconnect failed', { error: cause instanceof Error ? cause.message : String(cause) });
      }
    } catch (cause) {
      logService.warn('tiktok', 'Auto-reconnect orchestration failed', {
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  })();

  // Auto-reconnect Kick on startup. Account-model takes precedence: spin up
  // a multi-adapter child per enabled kick account. Fall back to the legacy
  // single-account settings store for installs that haven't migrated.
  void (async () => {
    await activeProfileDirectoryReady;
    try {
      const accounts = await accountRepository.list();
      const kickAccounts = accounts.filter((a) => a.providerId === 'kick' && a.enabled);
      if (kickAccounts.length > 0) {
        for (const account of kickAccounts) {
          const slug = normalizeKickChannelInput(account.channel) ?? account.channel;
          if (!slug) continue;
          const clientId = typeof account.providerData?.clientId === 'string' ? account.providerData.clientId : undefined;
          const clientSecret = typeof account.providerData?.clientSecret === 'string' ? account.providerData.clientSecret : undefined;
          try {
            await connectKickAccount(account.id, slug, { clientId, clientSecret });
            logService.info('kick', 'Auto-reconnected account', { channelSlug: slug, accountId: account.id });
          } catch (cause) {
            logService.warn('kick', 'Auto-reconnect failed', {
              accountId: account.id,
              channelSlug: slug,
              error: cause instanceof Error ? cause.message : String(cause),
            });
          }
        }
        return;
      }

      const store = await getKickSettingsStore();
      if (!store) return;
      const settings = await store.load();
      const slug = normalizeKickChannelInput(settings.channelInput);
      if (!slug) return;
      try {
        await connectKickAccount(`legacy:${slug}`, slug, { clientId: settings.clientId, clientSecret: settings.clientSecret });
        logService.info('kick', 'Auto-reconnected from legacy settings', { channelSlug: slug });
      } catch (cause) {
        logService.warn('kick', 'Legacy auto-reconnect failed', { channelSlug: slug, error: cause instanceof Error ? cause.message : String(cause) });
      }
    } catch (cause) {
      logService.warn('kick', 'Auto-reconnect orchestration failed', {
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  })();

  // ── R2: Moderation IPC + setModeration wiring ────────────────────────────

  async function wireTwitchModeration(adapter: TwitchChatAdapter, channel: string, oauthToken: string): Promise<void> {
    try {
      const accessToken = oauthToken.replace(/^oauth:/, '');
      const headers = { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID };
      // Resolve broadcaster (channel) and moderator (the authed user) ids in one pair of calls.
      const [broadcasterRes, modRes] = await Promise.all([
        net.fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`, { headers }),
        net.fetch('https://api.twitch.tv/helix/users', { headers }),
      ]);
      const broadcasterData = await broadcasterRes.json() as { data?: Array<{ id: string }> };
      const modData = await modRes.json() as { data?: Array<{ id: string }> };
      const broadcasterUserId = broadcasterData.data?.[0]?.id;
      const moderatorUserId = modData.data?.[0]?.id;
      if (!broadcasterUserId || !moderatorUserId) {
        logService.warn('twitch', 'Could not resolve user ids for moderation', { hasBroadcaster: !!broadcasterUserId, hasModerator: !!moderatorUserId });
        return;
      }
      const api = new TwitchModerationApi({
        accessToken,
        clientId: TWITCH_CLIENT_ID,
        broadcasterUserId,
        moderatorUserId,
      });
      adapter.setModeration(api, TWITCH_MODERATION_CAPABILITIES);
    } catch (cause) {
      logService.warn('twitch', 'Failed to wire moderation API', { error: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  function wireKickModeration(adapter: KickChatAdapter, authSession: KickAuthSession | null): void {
    if (!authSession?.token?.accessToken || typeof authSession.broadcasterUserId !== 'number') return;
    const api = new KickModerationApi({
      accessToken: authSession.token.accessToken,
      broadcasterUserId: authSession.broadcasterUserId,
    });
    adapter.setModeration(api, KICK_MODERATION_CAPABILITIES);
  }

  ipcMain.handle(IPC_CHANNELS.moderationGetCapabilities, async (_, raw) => {
    const platform = moderationGetCapabilitiesSchema.parse(raw);
    const adapter = chatService.getAdapter(platform);
    return adapter ? adapter.capabilities : null;
  });

  ipcMain.handle(IPC_CHANNELS.moderationDeleteMessage, async (_, raw) => {
    const input = moderationDeleteMessageSchema.parse(raw);
    const api = chatService.getAdapter(input.platform)?.moderation;
    if (!api) throw new Error(`Moderation not available for platform "${input.platform}"`);
    await api.deleteMessage(input.messageId);
  });

  ipcMain.handle(IPC_CHANNELS.moderationBanUser, async (_, raw) => {
    const input = moderationBanUserSchema.parse(raw);
    const api = chatService.getAdapter(input.platform)?.moderation;
    if (!api) throw new Error(`Moderation not available for platform "${input.platform}"`);
    await api.banUser(input.userId, input.reason);
  });

  ipcMain.handle(IPC_CHANNELS.moderationUnbanUser, async (_, raw) => {
    const input = moderationUnbanUserSchema.parse(raw);
    const api = chatService.getAdapter(input.platform)?.moderation;
    if (!api) throw new Error(`Moderation not available for platform "${input.platform}"`);
    await api.unbanUser(input.userId);
  });

  ipcMain.handle(IPC_CHANNELS.moderationTimeoutUser, async (_, raw) => {
    const input = moderationTimeoutUserSchema.parse(raw);
    const api = chatService.getAdapter(input.platform)?.moderation;
    if (!api) throw new Error(`Moderation not available for platform "${input.platform}"`);
    await api.timeoutUser(input.userId, input.durationSeconds, input.reason);
  });

  ipcMain.handle(IPC_CHANNELS.moderationSetMode, async (_, raw) => {
    const input = moderationSetModeSchema.parse(raw);
    const api = chatService.getAdapter(input.platform)?.moderation;
    if (!api) throw new Error(`Moderation not available for platform "${input.platform}"`);
    switch (input.mode) {
      case 'slow':
        if (!api.setSlowMode) throw new Error(`Slow mode not supported on "${input.platform}"`);
        await api.setSlowMode(input.enabled, input.value);
        break;
      case 'subscribers':
        if (!api.setSubscribersOnly) throw new Error(`Subscriber-only not supported on "${input.platform}"`);
        await api.setSubscribersOnly(input.enabled);
        break;
      case 'members':
        if (!api.setMembersOnly) throw new Error(`Members-only not supported on "${input.platform}"`);
        await api.setMembersOnly(input.enabled, input.value);
        break;
      case 'followers':
        if (!api.setFollowersOnly) throw new Error(`Follower-only not supported on "${input.platform}"`);
        await api.setFollowersOnly(input.enabled, input.value);
        break;
      case 'emote':
        if (!api.setEmoteOnly) throw new Error(`Emote-only not supported on "${input.platform}"`);
        await api.setEmoteOnly(input.enabled);
        break;
      case 'unique':
        throw new Error('Unique chat mode not yet wired');
    }
  });

  ipcMain.handle(IPC_CHANNELS.moderationManageRole, async (_, raw) => {
    const input = moderationManageRoleSchema.parse(raw);
    const api = chatService.getAdapter(input.platform)?.moderation;
    if (!api) throw new Error(`Moderation not available for platform "${input.platform}"`);
    if (input.role === 'mod') {
      const fn = input.action === 'add' ? api.addMod : api.removeMod;
      if (!fn) throw new Error(`Mod ${input.action} not supported on "${input.platform}"`);
      await fn.call(api, input.userId);
    } else {
      const fn = input.action === 'add' ? api.addVip : api.removeVip;
      if (!fn) throw new Error(`VIP ${input.action} not supported on "${input.platform}"`);
      await fn.call(api, input.userId);
    }
  });

  ipcMain.handle(IPC_CHANNELS.moderationRaid, async (_, raw) => {
    const input = moderationRaidSchema.parse(raw);
    const api = chatService.getAdapter(input.platform)?.moderation;
    if (!api?.raid) throw new Error(`Raid not supported on "${input.platform}"`);
    await api.raid(input.targetChannel);
  });

  ipcMain.handle(IPC_CHANNELS.moderationShoutout, async (_, raw) => {
    const input = moderationShoutoutSchema.parse(raw);
    const api = chatService.getAdapter(input.platform)?.moderation;
    if (!api?.shoutout) throw new Error(`Shoutout not supported on "${input.platform}"`);
    await api.shoutout(input.userId);
  });

  // ── R6: Accounts (multi-account) ─────────────────────────────────────────

  function pushAccountStatus(status: import('../shared/types.js').PlatformAccountStatus): void {
    const win = options.getWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IPC_CHANNELS.accountsStatus, status);
  }

  /** Re-broadcast every account of `providerId` after an internal status change. */
  function broadcastAccountsForProvider(providerId: string): void {
    void (async () => {
      const provider = mainPlatforms.get(providerId);
      if (!provider) return;
      const accounts = await accountRepository.list();
      for (const account of accounts) {
        if (account.providerId !== providerId) continue;
        const status = await provider.getStatus(account);
        pushAccountStatus({ accountId: account.id, status });
      }
    })().catch(() => undefined);
  }

  // ── Provider registry: each entry below knows how to bring its own
  //    accounts up/down and report status. The accounts:* IPC handlers and
  //    the on-status-change subscription below are platform-agnostic and
  //    dispatch through this registry; adding a new provider means adding
  //    one entry here and a corresponding renderer-side AuthStep.

  const twitchProvider: MainPlatformProvider = {
    providerId: 'twitch',
    getStatus: (account) => {
      const status = twitchAccountStatus.get(account.id);
      if (status === 'connected') return 'connected';
      if (status === 'connecting') return 'connecting';
      if (status === 'error') return 'error';
      return 'disconnected';
    },
    async connect(account) {
      // Intentionally NOT writing to the legacy TwitchCredentialsStore here.
      // With multi-account, that file would just track whichever account
      // connected last, and the boot path would auto-reconnect a duplicate
      // child — the very bug this provider is meant to avoid. Account
      // providerData is the source of truth.
      await connectTwitchAccountFromRecord(account);
    },
    async disconnect(account) {
      await disconnectTwitchAccount(account.id);
      if (!twitchMultiAdapter.hasConnectedChild()) {
        delete selfSenderName.twitch;
        chatLogService.closeSessionsForPlatform('twitch');
      }
    },
    async purgeStores() {
      const store = await getTwitchCredentialsStore();
      if (store) await store.clear();
    },
    onStatusChange(listener) {
      twitchStatusListeners.add(listener);
      return () => twitchStatusListeners.delete(listener);
    },
  };

  const kickProvider: MainPlatformProvider = {
    providerId: 'kick',
    getStatus: (account) => {
      if (account) {
        const status = kickAccountStatus.get(account.id);
        return status ?? 'disconnected';
      }
      return aggregateKickStatus();
    },
    async connect(account) {
      const channelSlug = normalizeKickChannelInput(account.channel) ?? account.channel;
      if (!channelSlug) throw new Error('Kick account is missing a channel slug');
      const clientId = typeof account.providerData.clientId === 'string' ? account.providerData.clientId : undefined;
      const clientSecret = typeof account.providerData.clientSecret === 'string' ? account.providerData.clientSecret : undefined;
      await connectKickAccount(account.id, channelSlug, { clientId, clientSecret });
    },
    async disconnect(account) {
      await disconnectKickAccount(account.id);
    },
    async purgeStores(account) {
      if (account) await disconnectKickAccount(account.id);
      const settingsStore = await getKickSettingsStore();
      if (settingsStore) await settingsStore.clear();
      const tokenStore = await getKickTokenStore();
      if (tokenStore) await tokenStore.clear();
    },
    onStatusChange(listener) {
      kickStatusListeners.add(listener);
      return () => kickStatusListeners.delete(listener);
    },
  };

  // TikTok's lib needs an active live to find the room id, so unlike Twitch/Kick
  // we can't keep a long-lived socket idle until chat starts. Instead, when the
  // user is offline we keep retrying in the background every TIKTOK_RETRY_MS so
  // the connection resumes automatically as soon as they go live. The provider
  // resolves successfully on the first attempt regardless — the system is
  // "watching", which is the closest analog to the other adapters' auto-connect
  // semantics. Each account has its own retry timer / watching flag so multiple
  // TikTok hosts can be tracked in parallel.
  const TIKTOK_RETRY_MS = 60_000;

  function clearTiktokRetryFor(accountId: string): void {
    const timer = tiktokRetryTimers.get(accountId);
    if (timer) {
      clearTimeout(timer);
      tiktokRetryTimers.delete(accountId);
    }
  }

  async function tryConnectTiktokAccount(accountId: string, username: string): Promise<{ ok: boolean; error?: unknown }> {
    try {
      await ensureTiktokMultiRegistered();
      await tiktokMultiAdapter.addAccount({
        accountId,
        username,
        onError: (cause) => logTikTokConnectionError('Connection error', username, cause),
        onStatusChange: (status) => {
          if (status === 'connected') tiktokWatchingAccounts.delete(accountId);
          tiktokAccountStatus.set(accountId, status);
          setTiktokStatus(aggregateTiktokStatus(), username);
          broadcastAccountsForProvider('tiktok');
        },
        onLiveStats: (stats) => options.stateHub.pushPlatformLiveStats('tiktok', username, stats),
        onCaptchaDetected: () => logService.warn('tiktok', 'CAPTCHA detected', { username }),
      });
      return { ok: true };
    } catch (cause) {
      // Make sure the half-attached child is gone so the next retry starts clean.
      try { await tiktokMultiAdapter.removeAccount(accountId); } catch { /* ignore */ }
      return { ok: false, error: cause };
    }
  }

  function scheduleTiktokRetry(accountId: string, username: string): void {
    clearTiktokRetryFor(accountId);
    if (!tiktokWatchingAccounts.has(accountId)) return;
    const timer = setTimeout(() => {
      tiktokRetryTimers.delete(accountId);
      if (!tiktokWatchingAccounts.has(accountId)) return;
      void tryConnectTiktokAccount(accountId, username).then((result) => {
        if (!tiktokWatchingAccounts.has(accountId)) return;
        if (result.ok) return;
        scheduleTiktokRetry(accountId, username);
      });
    }, TIKTOK_RETRY_MS);
    tiktokRetryTimers.set(accountId, timer);
  }

  async function connectTiktokAccount(accountId: string, username: string): Promise<void> {
    tiktokWatchingAccounts.delete(accountId);
    clearTiktokRetryFor(accountId);
    tiktokAccountStatus.set(accountId, 'connecting');
    tiktokAccountUsername.set(accountId, username);
    chatLogService.openSession('tiktok', username);
    suggestionService.clearSessionEntries();
    selfSenderName.tiktok = username.toLowerCase();
    setTiktokStatus('connecting', username);

    const result = await tryConnectTiktokAccount(accountId, username);
    if (result.ok) return;

    // First attempt failed — most commonly because the user isn't currently
    // live. Switch to "watching" so the UI can distinguish it from an
    // active in-progress connect, log the reason, and retry in background.
    tiktokWatchingAccounts.add(accountId);
    broadcastAccountsForProvider('tiktok');
    logService.info('tiktok', 'User appears offline — will retry until they go live', {
      accountId,
      username,
      retryMs: TIKTOK_RETRY_MS,
      reason: result.error instanceof Error ? result.error.message || result.error.name : String(result.error),
    });
    scheduleTiktokRetry(accountId, username);
  }

  async function disconnectTiktokAccount(accountId: string): Promise<void> {
    tiktokWatchingAccounts.delete(accountId);
    clearTiktokRetryFor(accountId);
    const username = tiktokAccountUsername.get(accountId);
    tiktokAccountStatus.delete(accountId);
    tiktokAccountUsername.delete(accountId);
    if (tiktokMultiAdapter.hasAccount(accountId)) {
      await tiktokMultiAdapter.removeAccount(accountId);
    }
    if (username) options.stateHub.pushPlatformLiveStats('tiktok', username, null);
    setTiktokStatus(aggregateTiktokStatus(), tiktokMultiAdapter.hasConnectedChild() ? null : null);
    if (!tiktokMultiAdapter.hasConnectedChild()) {
      chatLogService.closeSessionsForPlatform('tiktok');
    }
    broadcastAccountsForProvider('tiktok');
  }

  const tiktokProvider: MainPlatformProvider = {
    providerId: 'tiktok',
    getStatus: (account) => {
      if (account) {
        const accountId = account.id;
        const status = tiktokAccountStatus.get(accountId);
        if (status === 'connected') return 'connected';
        if (tiktokWatchingAccounts.has(accountId)) return 'watching';
        if (status === 'connecting') return 'connecting';
        if (status === 'captcha') return 'captcha';
        if (status === 'error') return 'error';
        return 'disconnected';
      }
      // Aggregate (legacy callers without an account hint).
      const agg = aggregateTiktokStatus();
      if (agg === 'disconnected' && tiktokWatchingAccounts.size > 0) return 'watching';
      return agg;
    },
    async connect(account) {
      await connectTiktokAccount(account.id, account.channel);
    },
    async disconnect(account) {
      await disconnectTiktokAccount(account.id);
    },
    async purgeStores(account) {
      if (account) await disconnectTiktokAccount(account.id);
      const store = await getTiktokSettingsStore();
      if (store) await store.clear();
    },
    onStatusChange(listener) {
      tiktokStatusListeners.add(listener);
      return () => tiktokStatusListeners.delete(listener);
    },
  };

  const youtubeStatusListeners = new Set<() => void>();
  const youtubeProvider: MainPlatformProvider = {
    providerId: 'youtube',
    async getStatus(account) {
      // A YouTube account is "connected" while its handle is enabled in the
      // shared YouTubeSettings.channels list — the adapter will pick it up
      // and spawn scrapers when the channel goes live. Per-video scraper
      // presence would be too noisy (offline streamers would flicker).
      const settings = await loadYoutubeSettings();
      const entry = settings.channels.find((c) => c.handle === account.channel);
      return entry?.enabled ? 'connected' : 'disconnected';
    },
    async connect(account) {
      const handle = account.channel;
      if (!handle) throw new Error('YouTube account is missing a channel handle');
      const settings = await loadYoutubeSettings();
      const channels = [...settings.channels];
      const idx = channels.findIndex((c) => c.handle === handle);
      if (idx >= 0) channels[idx] = { ...channels[idx], enabled: true };
      else channels.push({ id: randomUUID(), handle, name: account.label || handle, enabled: true });
      await saveYoutubeSettings({ ...settings, channels });
      youtubeStatusListeners.forEach((l) => l());
    },
    async disconnect(account) {
      const handle = account.channel;
      const settings = await loadYoutubeSettings();
      const channels = settings.channels.map((c) => c.handle === handle ? { ...c, enabled: false } : c);
      await saveYoutubeSettings({ ...settings, channels });
      youtubeStatusListeners.forEach((l) => l());
    },
    async purgeStores(account) {
      const settings = await loadYoutubeSettings();
      const channels = settings.channels.filter((c) => c.handle !== account.channel);
      await saveYoutubeSettings({ ...settings, channels });
      youtubeStatusListeners.forEach((l) => l());
    },
    onStatusChange(listener) {
      youtubeStatusListeners.add(listener);
      return () => youtubeStatusListeners.delete(listener);
    },
  };

  const youtubeApiStatusListeners = new Set<() => void>();
  const youtubeApiProvider: MainPlatformProvider = {
    providerId: 'youtube-api',
    async getStatus(account) {
      // Mirrors the YouTube scraper provider: the account is "connected" while
      // it's enabled in the AccountRepository. Live monitoring takes over from
      // there — going live spawns a YTApiClient automatically.
      const stored = await accountRepository.get(account.id);
      return stored?.enabled ? 'connected' : 'disconnected';
    },
    async connect(account) {
      const stored = await accountRepository.get(account.id);
      if (!stored) throw new Error(`Account ${account.id} not found`);
      if (!stored.enabled) {
        await accountRepository.upsert({ ...stored, enabled: true });
      }
      await refreshYoutubeApiAccounts();
      youtubeApiStatusListeners.forEach((l) => l());
    },
    async disconnect(account) {
      const stored = await accountRepository.get(account.id);
      if (stored?.enabled) {
        await accountRepository.upsert({ ...stored, enabled: false });
      }
      await refreshYoutubeApiAccounts();
      youtubeApiStatusListeners.forEach((l) => l());
    },
    async purgeStores() {
      // Account JSON is removed by the host before this runs — just refresh.
      await refreshYoutubeApiAccounts();
      youtubeApiStatusListeners.forEach((l) => l());
    },
    onStatusChange(listener) {
      youtubeApiStatusListeners.add(listener);
      return () => youtubeApiStatusListeners.delete(listener);
    },
  };

  for (const provider of [twitchProvider, kickProvider, tiktokProvider, youtubeProvider, youtubeApiProvider]) {
    mainPlatforms.register(provider);
    provider.onStatusChange(() => broadcastAccountsForProvider(provider.providerId));
  }

  // Symmetric snapshot used by the renderer's initial-load path. Today this
  // is a pragmatic shim over the per-platform aggregates that still live on
  // app-context — each provider should eventually expose `getAggregateStatus()`
  // via MainPlatformProvider and this handler should iterate `mainPlatforms.list()`
  // instead of hardcoding the ids below.
  ipcMain.handle(IPC_CHANNELS.platformsGetStatuses, async () => {
    const streams = getYoutubeStreams();
    return {
      twitch: { status: twitchStatus, primaryChannel: twitchChannel },
      kick: { status: aggregateKickStatus(), primaryChannel: kickSlug },
      tiktok: { status: aggregateTiktokStatus(), primaryChannel: tiktokUsername },
      youtube: {
        status: streams.some((s) => s.platform === 'youtube') ? ('connected' as const) : ('disconnected' as const),
        primaryChannel: null,
      },
      'youtube-v': {
        status: streams.some((s) => s.platform === 'youtube-v') ? ('connected' as const) : ('disconnected' as const),
        primaryChannel: null,
      },
      'youtube-api': {
        status: streams.some((s) => s.platform === 'youtube-api') ? ('connected' as const) : ('disconnected' as const),
        primaryChannel: null,
      },
    };
  });

  ipcMain.handle(IPC_CHANNELS.accountsList, async () => {
    return accountRepository.list();
  });

  ipcMain.handle(IPC_CHANNELS.accountsCreate, async (_, raw) => {
    const input = accountCreateInputSchema.parse(raw);
    const created = await accountRepository.upsert(input);
    if (created.providerId === 'youtube-api') await refreshYoutubeApiAccounts();
    // Auto-connect right after creation when the account opted in. The wizard
    // saves with autoConnect+enabled by default, so the user expects the new
    // network to come up without an extra "Connect" click. Fire-and-forget —
    // failures surface through the normal account status push.
    if (created.enabled && created.autoConnect) {
      const provider = mainPlatforms.get(created.providerId);
      if (provider) {
        pushAccountStatus({ accountId: created.id, status: 'connecting' });
        void (async () => {
          try {
            await provider.connect(created);
            pushAccountStatus({ accountId: created.id, status: 'connected' });
          } catch (cause) {
            const message = describeConnectFailure(cause, created.providerId, created.channel);
            logService.warn('accounts', 'Post-create auto-connect failed', {
              providerId: created.providerId,
              accountId: created.id,
              channel: created.channel,
              error: cause instanceof Error ? cause.message : String(cause),
            });
            pushAccountStatus({ accountId: created.id, status: 'error', detail: message });
          }
        })();
      }
    }
    return created;
  });

  ipcMain.handle(IPC_CHANNELS.accountsUpdate, async (_, raw) => {
    const input = accountUpdateInputSchema.parse(raw);
    const updated = await accountRepository.upsert(input);
    if (updated.providerId === 'youtube-api') await refreshYoutubeApiAccounts();
    return updated;
  });

  ipcMain.handle(IPC_CHANNELS.accountsDelete, async (_, raw) => {
    const input = accountIdInputSchema.parse(raw);
    const account = await accountRepository.get(input.id);
    if (account) {
      const provider = mainPlatforms.get(account.providerId);
      if (provider) {
        try { await provider.disconnect(account); }
        catch (cause) {
          logService.warn('accounts', 'Disconnect during delete failed; proceeding with delete', {
            accountId: account.id, providerId: account.providerId,
            error: cause instanceof Error ? cause.message : String(cause),
          });
        }
        try { await provider.purgeStores(account); }
        catch (cause) {
          logService.warn('accounts', 'Purging legacy stores failed during delete', {
            accountId: account.id, providerId: account.providerId,
            error: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
    }
    await accountRepository.delete(input.id);
    if (account?.providerId === 'youtube-api') await refreshYoutubeApiAccounts();
  });

  ipcMain.handle(IPC_CHANNELS.accountsConnect, async (_, raw) => {
    const input = accountIdInputSchema.parse(raw);
    const account = await accountRepository.get(input.id);
    if (!account) throw new Error(`Account "${input.id}" not found`);
    const provider = mainPlatforms.get(account.providerId);
    if (!provider) throw new Error(`Unknown providerId: ${account.providerId}`);
    pushAccountStatus({ accountId: account.id, status: 'connecting' });
    try {
      await provider.connect(account);
      pushAccountStatus({ accountId: account.id, status: 'connected' });
    } catch (cause) {
      // Some platform libraries throw Errors with empty/undefined messages,
      // which surface in the renderer as a useless "Error" string. Build a
      // descriptive fallback that includes the provider, account, and the
      // most informative field we can find on the cause.
      const message = describeConnectFailure(cause, account.providerId, account.channel);
      logService.error('accounts', 'connect failed', {
        providerId: account.providerId,
        accountId: account.id,
        channel: account.channel,
        errorName: cause instanceof Error ? cause.name : null,
        errorMessage: cause instanceof Error ? cause.message : String(cause),
        errorStack: cause instanceof Error ? cause.stack : null,
        cause: cause && typeof cause === 'object' ? JSON.stringify(cause, Object.getOwnPropertyNames(cause as object)) : null,
      });
      pushAccountStatus({
        accountId: account.id,
        status: 'error',
        detail: message,
      });
      throw new Error(message);
    }
  });

  ipcMain.handle(IPC_CHANNELS.accountsDisconnect, async (_, raw) => {
    const input = accountIdInputSchema.parse(raw);
    const account = await accountRepository.get(input.id);
    if (!account) throw new Error(`Account "${input.id}" not found`);
    const provider = mainPlatforms.get(account.providerId);
    if (provider) await provider.disconnect(account);
    pushAccountStatus({ accountId: account.id, status: 'disconnected' });
  });

  ipcMain.handle(IPC_CHANNELS.accountsGetStatus, async (_, raw) => {
    const input = accountIdInputSchema.parse(raw);
    const account = await accountRepository.get(input.id);
    if (!account) return null;
    const provider = mainPlatforms.get(account.providerId);
    const status = provider ? await provider.getStatus(account) : 'disconnected';
    return { accountId: account.id, status };
  });

  // Backfill: on first boot post-R6 read legacy stores and create equivalent
  // PlatformAccount records so the new wizard UI shows existing connections.
  void backfillAccountsFromLegacyStores().catch((cause) => {
    logService.warn('accounts', 'Account backfill failed', { error: cause instanceof Error ? cause.message : String(cause) });
  });

  async function backfillAccountsFromLegacyStores(): Promise<void> {
    await activeProfileDirectoryReady;
    const existing = await accountRepository.list();
    const seenProviders = new Set(existing.map((a) => a.providerId));

    if (!seenProviders.has('twitch')) {
      const store = await getTwitchCredentialsStore();
      const creds = store ? await store.load() : null;
      if (creds) {
        await accountRepository.upsert({
          providerId: 'twitch',
          label: creds.channel,
          channel: creds.channel,
          enabled: true,
          autoConnect: true,
          providerData: { username: creds.username, oauthToken: creds.oauthToken },
        });
        logService.info('accounts', 'Backfilled Twitch account from legacy store', { channel: creds.channel });
      }
    }

    if (!seenProviders.has('kick')) {
      const store = await getKickSettingsStore();
      const settings = store ? await store.load() : null;
      if (settings && settings.channelInput) {
        await accountRepository.upsert({
          providerId: 'kick',
          label: settings.channelInput,
          channel: settings.channelInput,
          enabled: true,
          autoConnect: settings.autoConnect,
          providerData: { clientId: settings.clientId, clientSecret: settings.clientSecret },
        });
        logService.info('accounts', 'Backfilled Kick account from legacy store', { channel: settings.channelInput });
      }
    }

    if (!seenProviders.has('tiktok')) {
      const store = await getTiktokSettingsStore();
      const settings = store ? await store.load() : null;
      if (settings && settings.username) {
        await accountRepository.upsert({
          providerId: 'tiktok',
          label: settings.username,
          channel: settings.username,
          enabled: true,
          autoConnect: settings.autoConnect,
          providerData: {},
        });
        logService.info('accounts', 'Backfilled TikTok account from legacy store', { username: settings.username });
      }
    }

    if (!seenProviders.has('youtube')) {
      const store = await getYoutubeSettingsStore();
      const settings = store ? await store.load() : null;
      if (settings?.channels?.length) {
        for (const channel of settings.channels) {
          await accountRepository.upsert({
            providerId: 'youtube',
            label: channel.name ?? channel.handle,
            channel: channel.handle,
            enabled: channel.enabled,
            autoConnect: settings.autoConnect,
            providerData: {},
          });
        }
        logService.info('accounts', 'Backfilled YouTube accounts from legacy store', { count: settings.channels.length });
      }
    }
  }

  ipcMain.handle(IPC_CHANNELS.overlayServerInfo, async () => {
    const status = overlayServer.getStatus();
    let chat: string | null = null;
    let raffles: string | null = null;
    let polls: string | null = null;
    let nowPlaying: string | null = null;
    if (status.status === 'running') {
      try { chat = overlayServer.getChatOverlayInfo().overlayUrl; } catch { chat = null; }
      try { raffles = overlayServer.getOverlayInfo().overlayUrl; } catch { raffles = null; }
      try { polls = overlayServer.getPollsOverlayInfo().overlayUrl; } catch { polls = null; }
      try { nowPlaying = overlayServer.getNowPlayingInfo()?.overlayUrl ?? null; } catch { nowPlaying = null; }
    }
    return { ...status, urls: { chat, raffles, polls, nowPlaying } };
  });

  void overlayServer.start().catch((cause) => {
    logService.error('overlay-server', 'Failed to start (port in use?)', {
      port: generalSettingsStore.load().overlayServerPort,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  });
  raffleDeadlineRunner.start();
  pollDeadlineRunner.start();
  schedulerService.start();
  void activeProfileDirectoryReady.then(() => obsService.start());

  return async () => {
    isShuttingDown = true;
    raffleDeadlineRunner.stop();
    pollDeadlineRunner.stop();
    raffleService.dispose();
    schedulerService.stop();
    stopTwitchStatsPoll();
    stopKickStatsPoll();
    musicService.reset();
    musicPlayerRef?.stop();
    await Promise.allSettled([chatService.disconnectAll(), obsService.stop(), overlayServer.stop()]);
    Object.values(IPC_CHANNELS).forEach(c => ipcMain.removeHandler(c));
  };

  async function speakWithGoogleTts(text: string, lang: string): Promise<void> {
    try {
      const parts = await getAllAudioBase64(text, { lang });
      // Concatenate all parts into one base64 string (each part is a separate MP3 chunk)
      for (const part of parts) {
        options.stateHub.pushGoogleTtsAudio({ base64: part.base64 });
      }
    } catch (cause) {
      logService.error('voice', 'Google TTS failed, falling back to OS TTS', {
        error: cause instanceof Error ? cause.message : String(cause),
      });
      void speakWithOsFallback(text);
    }
  }

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
    if (isYoutubePlatform(platform)) {
      if (!getYoutubeScraperByPlatform(platform)) {
        throw new Error('Log in to YouTube in Platforms before sending messages.');
      }
      try {
        await sendYoutubeMessage(platform, content);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (/login|not available|not ready|not connected/i.test(message)) {
          throw new Error('Log in to YouTube in Platforms before sending messages.', { cause });
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
          throw new Error('Log in to Kick in Platforms before sending messages.', { cause });
        }
        throw new Error(message || 'Log in to Kick in Platforms before sending messages.', { cause });
      }
      throw cause;
    }
  }

  function logTikTokConnectionError(message: string, username: string, cause: unknown): void {
    const metadata = {
      username,
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
    for (const stream of youtubeAdapter?.getCurrentStreams() ?? []) {
      if (stream.platform === 'youtube' || stream.platform === 'youtube-v') {
        connected.add(stream.platform);
      }
    }
    return YT_PLATFORMS.filter((platform) => connected.has(platform));
  }

  function getConnectedScheduledTargets(): PlatformId[] {
    const connected: PlatformId[] = [];
    if (twitchStatus === 'connected') connected.push('twitch');
    if (getConnectedYoutubePlatforms().length > 0) connected.push('youtube');
    if (youtubeApiAdapter.hasActiveStreams()) connected.push('youtube-api');
    return connected;
  }

  function describeConnectFailure(cause: unknown, providerId: string, channel: string): string {
    const fallback = `${providerId}: connect failed for "${channel}"`;
    if (!cause) return fallback;
    if (cause instanceof Error) {
      const msg = cause.message?.trim();
      if (msg) return `${providerId}: ${msg}`;
      return `${providerId}: ${cause.name || 'Error'} (no message; check Event Log for details)`;
    }
    if (typeof cause === 'string' && cause.trim()) return `${providerId}: ${cause}`;
    if (typeof cause === 'object') {
      const obj = cause as Record<string, unknown>;
      const candidate = (typeof obj.message === 'string' && obj.message)
        || (typeof obj.error === 'string' && obj.error)
        || (typeof obj.reason === 'string' && obj.reason);
      if (candidate) return `${providerId}: ${candidate}`;
    }
    return fallback;
  }

  function resolveAnnouncementTargets(requestedTargets: PlatformId[]): PlatformId[] {
    const resolved = new Set<PlatformId>();
    for (const target of requestedTargets) {
      if (isYoutubePlatform(target)) {
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
        continue;
      }
      if (target === 'youtube-api') {
        if (youtubeApiAdapter.hasActiveStreams()) resolved.add('youtube-api');
        continue;
      }
    }
    return Array.from(resolved);
  }

  function getYoutubeScraperByPlatform(platform: 'youtube' | 'youtube-v'): YTLiveClient | null {
    return youtubeAdapter?.getScraperByPlatform(platform) ?? null;
  }

  async function sendYoutubeMessage(platform: 'youtube' | 'youtube-v', content: string): Promise<void> {
    const scraper = getYoutubeScraperByPlatform(platform);
    if (!scraper) throw new Error(`${platform}: scraper not connected`);
    const ytSettings = await loadYoutubeSettings();
    await scraper.sendMessage(content, ytSettings.chatChannelPageId);
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

        if (isYoutubePlatform(target)) {
          if (!getYoutubeScraperByPlatform(target)) {
            const reason = `${target}: disconnected`;
            skipped.push(reason);
            logService.warn('scheduled', 'Skipped', { platform: target, reason, content });
            continue;
          }
          await sendYoutubeMessage(target, content);
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

}
