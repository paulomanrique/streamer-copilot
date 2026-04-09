import { execFile as execFileCallback } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';

import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';

import type { DatabaseHandle } from '../db/database.js';
import { ChatService } from '../modules/chat/chat-service.js';
import { LogRepository } from '../modules/logs/log-repository.js';
import { LogService } from '../modules/logs/log-service.js';
import { ObsService } from '../modules/obs/obs-service.js';
import { ObsSettingsStore } from '../modules/obs/obs-settings-store.js';
import { RaffleDeadlineRunner } from '../modules/raffles/raffle-deadline-runner.js';
import { RaffleOverlayServer } from '../modules/raffles/raffle-overlay-server.js';
import { RaffleRepository } from '../modules/raffles/raffle-repository.js';
import { RaffleService } from '../modules/raffles/raffle-service.js';
import { ScheduledMessageRepository } from '../modules/scheduled/scheduled-repository.js';
import { SchedulerService, type ScheduledRunState } from '../modules/scheduled/scheduler-service.js';
import { AppSettingsRepository } from '../modules/settings/app-settings-repository.js';
import { GeneralSettingsStore } from '../modules/settings/general-settings-store.js';
import { ProfileStore } from '../modules/settings/profile-store.js';
import { SoundCommandRepository } from '../modules/sounds/sound-repository.js';
import { SoundService } from '../modules/sounds/sound-service.js';
import { TextCommandRepository } from '../modules/text/text-repository.js';
import { TextService } from '../modules/text/text-service.js';
import { VoiceCommandRepository } from '../modules/voice/voice-repository.js';
import { VoiceService } from '../modules/voice/voice-service.js';
import { createKickChatAdapter } from '../platforms/kick/adapter.js';
import { TwitchCredentialsStore } from '../platforms/twitch/credentials-store.js';
import { createTwitchChatAdapter } from '../platforms/twitch/adapter.js';
import { createYouTubeChatAdapter } from '../platforms/youtube/adapter.js';
import { YouTubeSettingsStore } from '../platforms/youtube/settings-store.js';
import { YouTubeScraper } from './youtube-scraper.js';
import { APP_NAME } from '../shared/constants.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import {
  chatSendMessageSchema,
  cloneProfileInputSchema,
  createProfileInputSchema,
  deleteProfileInputSchema,
  eventLogFiltersSchema,
  generalSettingsSchema,
  obsConnectionSettingsSchema,
  raffleControlActionInputSchema,
  raffleCreateInputSchema,
  raffleDeleteInputSchema,
  raffleUpdateInputSchema,
  renameProfileInputSchema,
  rendererVoiceCapabilitiesSchema,
  soundCommandDeleteInputSchema,
  soundCommandUpsertInputSchema,
  soundPlayPayloadSchema,
  scheduledMessageDeleteInputSchema,
  scheduledMessageUpsertInputSchema,
  selectProfileInputSchema,
  textCommandDeleteInputSchema,
  textCommandUpsertInputSchema,
  twitchCredentialsSchema,
  voiceCommandDeleteInputSchema,
  voiceCommandUpsertInputSchema,
  voiceSpeakPayloadSchema,
  youtubeConnectSchema,
  youtubeSettingsSchema,
} from '../shared/schemas.js';
import type { AppInfo, PlatformId, Raffle, TwitchConnectionStatus, TwitchLiveStats, YouTubeStreamInfo } from '../shared/types.js';

const TWITCH_CLIENT_ID = 'vtwg8tzuv1nlip4qh9n6sxx2p76g0s';
const TWITCH_REDIRECT_PORT = 32999;
import { StateHub } from './state-hub.js';

interface AppContextOptions {
  appVersion: string;
  databaseHandle: DatabaseHandle;
  generalSettingsStore: GeneralSettingsStore;
  onGeneralSettingsChanged: (settings: import('../shared/types.js').GeneralSettings) => Promise<void> | void;
  stateHub: StateHub;
  userDataPath: string;
}

export function createAppContext(options: AppContextOptions): () => Promise<void> {
  const execFile = promisify(execFileCallback);
  const profileStore = new ProfileStore(options.userDataPath);
  const appSettingsRepository = new AppSettingsRepository(options.databaseHandle.db);
  const generalSettingsStore = options.generalSettingsStore;
  const obsSettingsStore = new ObsSettingsStore(appSettingsRepository);
  const logRepository = new LogRepository(options.databaseHandle.db);
  const logService = new LogService(logRepository);
  const raffleRepository = new RaffleRepository(options.databaseHandle.db);
  const scheduledRepository = new ScheduledMessageRepository(options.databaseHandle.db);
  const soundRepository = new SoundCommandRepository(options.databaseHandle.db);
  const textRepository = new TextCommandRepository(options.databaseHandle.db);
  const voiceRepository = new VoiceCommandRepository(options.databaseHandle.db);
  const schedulerService = new SchedulerService({
    repository: scheduledRepository,
    onStatus: (items) => options.stateHub.pushScheduledStatus(items),
    onDueMessage: (message) => dispatchScheduledMessageWithResult(message.message, message.targetPlatforms),
    resolveEffectiveTargets: (message) => resolveDispatchTargets(message.targetPlatforms),
  });
  const soundService = new SoundService({
    repository: soundRepository,
    onPlay: (payload) => options.stateHub.pushSoundPlay(payload),
  });
  const textService = new TextService({
    repository: textRepository,
    onRespond: async (payload) => {
      try {
        await chatService.sendMessage(payload.platform, payload.content);
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
  let twitchStatus: TwitchConnectionStatus = 'disconnected';
  let twitchStatsTimer: ReturnType<typeof setInterval> | null = null;
  const userAvatarCache = new Map<string, string>();
  const badgeCache = new Map<string, string>();
  const youtubeScrapers = new Map<string, YouTubeScraper>();
  const youtubeStreamData = new Map<string, {
    label: string;
    viewerCount: number | null;
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

  interface LiveStreamInfo {
    videoId: string;
    title: string;
    viewCount: number | null;
    channelHandle: string;
  }

  function getLabelFromTitle(title: string, idx: number): string {
    const lower = title.toLowerCase();
    if (lower.includes('horizontal')) return 'H';
    if (lower.includes('vertical') || lower.includes('shorts')) return 'V';
    return String(idx + 1);
  }

  function getYtText(obj: unknown): string {
    if (!obj || typeof obj !== 'object') return '';
    const o = obj as Record<string, unknown>;
    if (typeof o.simpleText === 'string') return o.simpleText;
    if (Array.isArray(o.runs)) return (o.runs as Array<Record<string, unknown>>).map((r) => String(r.text ?? '')).join('');
    return '';
  }

  const checkYouTubeLive = async (handle: string): Promise<LiveStreamInfo[]> => {
    try {
      // Extract handle from full URL if needed (e.g. https://www.youtube.com/@user)
      const handleMatch = handle.match(/(?:youtube\.com\/)?(@?[\w-]+)(?:\/.*)?$/);
      const rawHandle = handleMatch ? handleMatch[1] : handle;
      const normalizedHandle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
      const url = `https://www.youtube.com/${normalizedHandle}/streams`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!response.ok) return [];
      const html = await response.text();
      const streams = extractYtLiveVideoIds(html);
      return streams.map((stream) => ({ ...stream, channelHandle: normalizedHandle }));
    } catch { return []; }
  };

  function extractYtInitialData(html: string): unknown {
    const marker = 'var ytInitialData = ';
    const start = html.indexOf(marker);
    if (start === -1) return null;
    const jsonStart = start + marker.length;
    let depth = 0;
    let end = jsonStart;
    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    try { return JSON.parse(html.slice(jsonStart, end)); } catch { return null; }
  }

  function findLiveVideoIds(obj: unknown, found: LiveStreamInfo[] = []): LiveStreamInfo[] {
    if (!obj || typeof obj !== 'object') return found;
    if (Array.isArray(obj)) {
      for (const item of obj) findLiveVideoIds(item, found);
      return found;
    }
    const record = obj as Record<string, unknown>;
    if (typeof record.videoId === 'string' && Array.isArray(record.thumbnailOverlays)) {
      const isLive = record.thumbnailOverlays.some((overlay: unknown) => {
        if (!overlay || typeof overlay !== 'object') return false;
        const tots = (overlay as Record<string, unknown>).thumbnailOverlayTimeStatusRenderer as Record<string, unknown> | undefined;
        return tots?.style === 'LIVE';
      });
      if (isLive) {
        const title = getYtText(record.title);
        const viewCountRaw = getYtText(record.viewCountText);
        const viewCount = viewCountRaw ? parseInt(viewCountRaw.replace(/[^0-9]/g, ''), 10) || null : null;
        found.push({ videoId: record.videoId, title, viewCount, channelHandle: '' });
      }
    }
    for (const value of Object.values(record)) findLiveVideoIds(value, found);
    return found;
  }

  function extractYtLiveVideoIds(html: string): LiveStreamInfo[] {
    const data = extractYtInitialData(html);
    if (!data) return [];
    return findLiveVideoIds(data);
  }

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
        scraper.stop();
        youtubeScrapers.delete(videoId);
        youtubeStreamData.delete(videoId);
        logService.info('youtube', `Stopped scraper for ${videoId} (no longer live)`);
      } else if (updated.viewCount !== null) {
        const data = youtubeStreamData.get(videoId);
        if (data) youtubeStreamData.set(videoId, { ...data, viewerCount: updated.viewCount });
      }
    }

    // Start scrapers for newly detected streams (up to 2)
    const fmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });
    for (let i = 0; i < Math.min(allLiveStreams.length, YT_PLATFORMS.length); i++) {
      const { videoId, title, viewCount } = allLiveStreams[i];
      if (youtubeScrapers.has(videoId)) continue;
      const platform = YT_PLATFORMS[i];
      const label = getLabelFromTitle(title, i);
      youtubeStreamData.set(videoId, {
        label,
        viewerCount: viewCount,
        platform,
        channelHandle: allLiveStreams[i].channelHandle,
      });
      logService.info('youtube', `Auto-detected live (${platform}, label=${label}): ${videoId} — "${title}"`);
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
      const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID }
      });
      const userData = (await userRes.json()) as { data?: Array<{ id: string }> };
      const userId = userData.data?.[0]?.id;
      if (!userId) return;

      const [streamRes, followersRes, hypeRes] = await Promise.all([
        fetch(`https://api.twitch.tv/helix/streams?user_id=${userId}`, { headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID } }),
        fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userId}`, { headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID } }),
        fetch(`https://api.twitch.tv/helix/hypetrain/events?broadcaster_id=${userId}`, { headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID } }),
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
    } catch {}
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
      const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`, { headers: h });
      const userData = (await userRes.json()) as { data?: Array<{ id: string }> };
      const broadcasterId = userData.data?.[0]?.id;
      const urls = ['https://api.twitch.tv/helix/chat/badges/global'];
      if (broadcasterId) urls.push(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcasterId}`);
      const jsons = await Promise.all(
        urls.map(async (url) => (await fetch(url, { headers: h })).json() as Promise<{ data?: Array<{ set_id: string; versions: Array<{ id: string; image_url_2x: string }> }> }>),
      );
      for (const json of jsons) {
        for (const set of json.data ?? []) {
          for (const version of set.versions) badgeCache.set(`${set.set_id}/${version.id}`, version.image_url_2x);
        }
      }
    } catch {}
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

  const setTwitchStatus = (status: TwitchConnectionStatus) => {
    twitchStatus = status;
    options.stateHub.pushTwitchStatus(status);
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
  });

  raffleService = new RaffleService({
    repository: raffleRepository,
    getOverlayInfo: (raffleId) => raffleOverlayServer.getOverlayInfo(raffleId),
    onState: (payload) => options.stateHub.pushRaffleState(payload),
    onEntry: (payload) => options.stateHub.pushRaffleEntry(payload),
    onResult: (payload) => options.stateHub.pushRaffleResult(payload),
    onAnnounceWinner: async (raffle, winner) => {
      const content = formatWinnerAnnouncement(raffle, winner.displayName);
      for (const target of resolveRaffleAnnouncementTargets(raffle.acceptedPlatforms)) {
        try {
          await chatService.sendMessage(target, content);
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
    raffleService, soundService, textService, voiceService,
    onMessage: (message) => options.stateHub.pushChatMessage(message),
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
  ipcMain.handle(IPC_CHANNELS.profilesSelect, async (_, raw) => profileStore.select(selectProfileInputSchema.parse(raw).profileId));
  ipcMain.handle(IPC_CHANNELS.profilesCreate, async (_, raw) => { const i = createProfileInputSchema.parse(raw); return profileStore.create(i.name, i.directory); });
  ipcMain.handle(IPC_CHANNELS.profilesRename, async (_, raw) => { const i = renameProfileInputSchema.parse(raw); return profileStore.rename(i.profileId, i.name); });
  ipcMain.handle(IPC_CHANNELS.profilesClone, async (_, raw) => { const i = cloneProfileInputSchema.parse(raw); return profileStore.clone(i.profileId, i.name, i.directory); });
  ipcMain.handle(IPC_CHANNELS.profilesDelete, async (_, raw) => profileStore.delete(deleteProfileInputSchema.parse(raw).profileId));
  ipcMain.handle(IPC_CHANNELS.profilesPickDirectory, async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.generalGetSettings, async () => generalSettingsStore.load());
  ipcMain.handle(IPC_CHANNELS.generalSaveSettings, async (_, raw) => {
    const s = generalSettingsSchema.parse(raw);
    const saved = generalSettingsStore.save(s);
    await options.onGeneralSettingsChanged(saved);
    return saved;
  });

  ipcMain.handle(IPC_CHANNELS.scheduledList, async () => schedulerService.list());
  ipcMain.handle(IPC_CHANNELS.scheduledUpsert, async (_, raw) => schedulerService.upsert(scheduledMessageUpsertInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.scheduledDelete, async (_, raw) => schedulerService.delete(scheduledMessageDeleteInputSchema.parse(raw).id));
  ipcMain.handle(IPC_CHANNELS.scheduledGetAvailableTargets, async () => ({
    supported: [...SCHEDULED_SUPPORTED_TARGETS],
    connected: getConnectedScheduledTargets(),
  }));

  ipcMain.handle(IPC_CHANNELS.rafflesList, async () => raffleService.list());
  ipcMain.handle(IPC_CHANNELS.rafflesCreate, async (_, raw) => raffleService.create(raffleCreateInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.rafflesUpdate, async (_, raw) => raffleService.update(raffleUpdateInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.rafflesDelete, async (_, raw) => raffleService.delete(raffleDeleteInputSchema.parse(raw).id));
  ipcMain.handle(IPC_CHANNELS.rafflesGetActive, async () => raffleService.getActive());
  ipcMain.handle(IPC_CHANNELS.rafflesGetSnapshot, async (_, raw) => raffleService.getSnapshot(String(raw ?? '')));
  ipcMain.handle(IPC_CHANNELS.rafflesControl, async (_, raw) => raffleService.control(raffleControlActionInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.rafflesOverlayInfo, async (_, raw) => raffleService.getOverlayInfo(String(raw ?? '')));

  ipcMain.handle(IPC_CHANNELS.textList, async () => textService.list());
  ipcMain.handle(IPC_CHANNELS.textUpsert, async (_, raw) => textService.upsert(textCommandUpsertInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.textDelete, async (_, raw) => textService.delete(textCommandDeleteInputSchema.parse(raw).id));

  ipcMain.handle(IPC_CHANNELS.voiceList, async () => voiceService.list());
  ipcMain.handle(IPC_CHANNELS.voiceUpsert, async (_, raw) => voiceService.upsert(voiceCommandUpsertInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.voiceDelete, async (_, raw) => voiceService.delete(voiceCommandDeleteInputSchema.parse(raw).id));
  ipcMain.handle(IPC_CHANNELS.voicePreviewSpeak, async (_, raw) => voiceService.previewSpeak(voiceSpeakPayloadSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.voiceSetRendererCapabilities, async (_, raw) => { rendererSpeechSynthesisAvailable = rendererVoiceCapabilitiesSchema.parse(raw).speechSynthesisAvailable; });

  ipcMain.handle(IPC_CHANNELS.soundsList, async () => soundService.list());
  ipcMain.handle(IPC_CHANNELS.soundsUpsert, async (_, raw) => soundService.upsert(soundCommandUpsertInputSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.soundsDelete, async (_, raw) => soundService.delete(soundCommandDeleteInputSchema.parse(raw).id));
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

  ipcMain.handle(IPC_CHANNELS.obsGetSettings, async () => obsService.getSettings());
  ipcMain.handle(IPC_CHANNELS.obsSaveSettings, async (_, raw) => obsService.saveSettings(obsConnectionSettingsSchema.parse(raw)));
  ipcMain.handle(IPC_CHANNELS.obsTestConnection, async (_, raw) => obsService.testConnection(obsConnectionSettingsSchema.parse(raw)));

  ipcMain.handle(IPC_CHANNELS.chatGetRecent, async () => chatService.getRecent());
  ipcMain.handle(IPC_CHANNELS.chatSendMessage, async (_, raw) => {
    const i = chatSendMessageSchema.parse(raw);
    await chatService.sendMessage(i.platform, i.content);
    await pushLocalOutboundMessage(i.platform, i.content);
  });
  ipcMain.handle(IPC_CHANNELS.logsList, async (_, raw) => logService.list(eventLogFiltersSchema.parse(raw)));

  // Twitch Handlers
  ipcMain.handle(IPC_CHANNELS.twitchGetCredentials, async () => { const s = await getTwitchCredentialsStore(); return s ? s.load() : null; });
  ipcMain.handle(IPC_CHANNELS.twitchConnect, async (_, raw) => {
    const c = twitchCredentialsSchema.parse(raw);
    const s = await getTwitchCredentialsStore(); if (!s) throw new Error('No profile');
    await s.save(c); setTwitchStatus('connecting');
    // Pre-load badges so first messages have badge images
    await loadTwitchBadges(c.channel, c.oauthToken.replace(/^oauth:/, ''));
    await chatService.replaceAdapter(createTwitchChatAdapter({ channels: [c.channel], username: c.username, password: c.oauthToken, onStatusChange: setTwitchStatus, resolveBadgeUrls }));
  });
  ipcMain.handle(IPC_CHANNELS.twitchDisconnect, async () => { await chatService.removeAdapter('twitch'); setTwitchStatus('disconnected'); const s = await getTwitchCredentialsStore(); if (s) await s.clear(); });
  ipcMain.handle(IPC_CHANNELS.twitchGetStatus, async () => twitchStatus);
  ipcMain.handle(IPC_CHANNELS.twitchGetUserAvatars, async (_, logins) => {
    const list = Array.isArray(logins) ? logins.filter(l => typeof l === 'string') : [];
    if (list.length === 0) return {};
    const uncached = list.filter(l => !userAvatarCache.has(l));
    if (uncached.length > 0) {
      const s = await getTwitchCredentialsStore(); const c = s ? await s.load() : null;
      if (c) {
        try {
          const res = await fetch(`https://api.twitch.tv/helix/users?${uncached.map(l => `login=${encodeURIComponent(l)}`).join('&')}`, { headers: { Authorization: `Bearer ${c.oauthToken.replace(/^oauth:/,'')}`, 'Client-Id': TWITCH_CLIENT_ID } });
          const d = await res.json(); (d.data ?? []).forEach((u: any) => userAvatarCache.set(u.login.toLowerCase(), u.profile_image_url));
          uncached.forEach(l => { if (!userAvatarCache.has(l.toLowerCase())) userAvatarCache.set(l.toLowerCase(), ''); });
        } catch {}
      }
    }
    const res: any = {}; list.forEach(l => { const u = userAvatarCache.get(l.toLowerCase()); if (u) res[l] = u; });
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
          const g = await fetch('https://api.twitch.tv/helix/chat/badges/global', { headers: h });
          const gd = await g.json(); (gd.data ?? []).forEach((set: any) => set.versions.forEach((v: any) => badgeCache.set(`${set.set_id}/${v.id}`, v.image_url_1x)));
          const u = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(c.channel)}`, { headers: h });
          const ud = await u.json(); const uid = ud.data?.[0]?.id;
          if (uid) {
            const ch = await fetch(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${uid}`, { headers: h });
            const cd = await ch.json(); (cd.data ?? []).forEach((set: any) => set.versions.forEach((v: any) => badgeCache.set(`${set.set_id}/${v.id}`, v.image_url_1x)));
          }
        } catch {}
      }
    }
    const res: any = {}; list.forEach(i => { const u = badgeCache.get(i); if (u) res[i] = u; });
    return res;
  });
  ipcMain.handle(IPC_CHANNELS.twitchStartOAuth, async () => {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, `http://localhost:${TWITCH_REDIRECT_PORT}`);
        if (url.pathname === '/callback') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!DOCTYPE html><html><body style="background:#0e0e10;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><div>Connecting...<script>const t=new URLSearchParams(window.location.hash.substring(1)).get("access_token");if(t)fetch("/token?t="+t).then(()=>document.body.innerHTML="Connected! You can close this tab.")</script></div></body></html>'); return; }
        if (url.pathname === '/token') {
          const t = url.searchParams.get('t'); res.end('ok'); server.close();
          if (!t) return reject(new Error('No token'));
          const r = await fetch('https://api.twitch.tv/helix/users', { headers: { Authorization: `Bearer ${t}`, 'Client-Id': TWITCH_CLIENT_ID } });
          const d = await r.json(); const login = d.data?.[0]?.login;
          if (!login) return reject(new Error('No login'));
          resolve({ accessToken: t, username: login });
        }
      }).listen(TWITCH_REDIRECT_PORT, '127.0.0.1', () => shell.openExternal(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=http://localhost:${TWITCH_REDIRECT_PORT}/callback&response_type=token&scope=chat:read+chat:edit`));
    });
  });

  // YouTube Handlers
  ipcMain.handle(IPC_CHANNELS.youtubeGetSettings, async () => { const s = await getYoutubeSettingsStore(); return s ? s.load() : { channels: [], autoConnect: true }; });
  ipcMain.handle(IPC_CHANNELS.youtubeSaveSettings, async (_, raw) => { const s = await getYoutubeSettingsStore(); if (s) { await s.save(youtubeSettingsSchema.parse(raw)); startYoutubeMonitor(); } });
  ipcMain.handle(IPC_CHANNELS.youtubeConnect, async (_, raw) => {
    const i = youtubeConnectSchema.parse(raw);
    const fmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });
    if (!youtubeScrapers.has(i.videoId)) {
      const idx = youtubeScrapers.size;
      const platform = YT_PLATFORMS[idx] ?? 'youtube-v';
      const label = String(idx + 1);
      youtubeStreamData.set(i.videoId, { label, viewerCount: null, platform, channelHandle: null });
      const scraper = new YouTubeScraper({
        videoId: i.videoId,
        onMessage: (m) => chatService.injectMessage({ id: `yt-${Date.now()}`, timestampLabel: fmt.format(new Date()), ...m, platform, streamLabel: label }),
        onLog: (msg) => logService.info('youtube', msg),
      });
      youtubeScrapers.set(i.videoId, scraper);
      await scraper.start();
    }
    options.stateHub.pushYoutubeStatus(getYoutubeStreams());
  });
  ipcMain.handle(IPC_CHANNELS.youtubeDisconnect, async () => {
    for (const scraper of youtubeScrapers.values()) scraper.stop();
    youtubeScrapers.clear();
    youtubeStreamData.clear();
    options.stateHub.pushYoutubeStatus([]);
  });
  ipcMain.handle(IPC_CHANNELS.youtubeGetStatus, async () => getYoutubeStreams());
  ipcMain.handle(IPC_CHANNELS.youtubeOpenLogin, async (e) => {
    const win = new BrowserWindow({ width: 600, height: 800, parent: BrowserWindow.fromWebContents(e.sender)!, modal: true, title: 'YouTube Login', autoHideMenuBar: true });
    win.webContents.on('did-navigate', (_, u) => { const t = new URL(u); if (t.hostname.includes('youtube.com') && t.pathname === '/' && !u.includes('signin')) setTimeout(() => { if (!win.isDestroyed()) win.close(); }, 1500); });
    await win.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/signin?action_handle_signin=true');
  });
  ipcMain.handle(IPC_CHANNELS.youtubeCheckLive, async (_, handle: unknown) => {
    const streams = await checkYouTubeLive(String(handle ?? ''));
    return { videoIds: streams.map((s) => s.videoId) };
  });

  // Auto-reconnect Twitch from saved credentials on startup
  void (async () => {
    const store = await getTwitchCredentialsStore();
    if (!store) return;
    const creds = await store.load();
    if (!creds) return;
    try {
      const token = creds.oauthToken.replace(/^oauth:/, '');
      await loadTwitchBadges(creds.channel, token);
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
