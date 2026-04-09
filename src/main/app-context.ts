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
import { ScheduledMessageRepository } from '../modules/scheduled/scheduled-repository.js';
import { SchedulerService } from '../modules/scheduled/scheduler-service.js';
import { AppSettingsRepository } from '../modules/settings/app-settings-repository.js';
import { GeneralSettingsStore } from '../modules/settings/general-settings-store.js';
import { ProfileStore } from '../modules/settings/profile-store.js';
import { SoundCommandRepository } from '../modules/sounds/sound-repository.js';
import { SoundService } from '../modules/sounds/sound-service.js';
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
  renameProfileInputSchema,
  rendererVoiceCapabilitiesSchema,
  soundCommandDeleteInputSchema,
  soundCommandUpsertInputSchema,
  soundPlayPayloadSchema,
  scheduledMessageDeleteInputSchema,
  scheduledMessageUpsertInputSchema,
  selectProfileInputSchema,
  twitchCredentialsSchema,
  voiceCommandDeleteInputSchema,
  voiceCommandUpsertInputSchema,
  voiceSpeakPayloadSchema,
  youtubeConnectSchema,
  youtubeSettingsSchema,
} from '../shared/schemas.js';
import type { AppInfo, PlatformId, TwitchConnectionStatus, TwitchLiveStats } from '../shared/types.js';

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

export function createAppContext(options: AppContextOptions): () => void {
  const execFile = promisify(execFileCallback);
  const profileStore = new ProfileStore(options.userDataPath);
  const appSettingsRepository = new AppSettingsRepository(options.databaseHandle.db);
  const generalSettingsStore = options.generalSettingsStore;
  const obsSettingsStore = new ObsSettingsStore(appSettingsRepository);
  const logRepository = new LogRepository(options.databaseHandle.db);
  const logService = new LogService(logRepository);
  const scheduledRepository = new ScheduledMessageRepository(options.databaseHandle.db);
  const soundRepository = new SoundCommandRepository(options.databaseHandle.db);
  const voiceRepository = new VoiceCommandRepository(options.databaseHandle.db);
  const schedulerService = new SchedulerService({
    repository: scheduledRepository,
    onStatus: (items) => options.stateHub.pushScheduledStatus(items),
    onDueMessage: (message) => {
      void dispatchScheduledMessage(message.message, message.targetPlatforms);
    },
  });
  const soundService = new SoundService({
    repository: soundRepository,
    onPlay: (payload) => options.stateHub.pushSoundPlay(payload),
  });
  let rendererSpeechSynthesisAvailable = process.platform !== 'linux';
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
  let youtubeScraper: YouTubeScraper | null = null;
  let youtubeMonitorTimer: ReturnType<typeof setInterval> | null = null;
  let lastDetectedVideoId: string | null = null;

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

  const checkYouTubeLive = async (handle: string): Promise<string | null> => {
    try {
      const url = handle.startsWith('UC')
        ? `https://www.youtube.com/channel/${handle}/live`
        : `https://www.youtube.com/${handle.startsWith('@') ? '' : '@'}${handle}/live`;

      const res = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      const html = await res.text();

      // Must be an active live broadcast
      const isLive = html.includes('"liveBroadcastContent":"live"') || html.includes('"isLive":true');
      if (!isLive) return null;

      const match = html.match(/"videoId":"([0-9A-Za-z_-]{11})"/);
      return match ? match[1] : null;
    } catch { return null; }
  };

  const runYoutubeMonitor = async () => {
    const store = await getYoutubeSettingsStore();
    if (!store) return;
    const settings = await store.load();
    if (!settings.autoConnect || settings.channels.length === 0) return;

    for (const channel of settings.channels) {
      if (!channel.enabled) continue;
      const videoId = await checkYouTubeLive(channel.handle);
      if (videoId && videoId !== lastDetectedVideoId) {
        logService.info('youtube', `Auto-detected live for ${channel.handle}: ${videoId}`);
        lastDetectedVideoId = videoId;
        if (youtubeScraper) youtubeScraper.stop();
        youtubeScraper = new YouTubeScraper({
          videoId,
          onMessage: (message) => {
            (chatService as any).handleMessage({
              id: `yt-auto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              timestampLabel: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
              ...message,
            });
          },
          onLog: (msg) => logService.info('youtube', msg),
        });
        await youtubeScraper.start();
        options.stateHub.pushYoutubeStatus(true);
        break;
      }
    }
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

  const chatService = new ChatService({
    soundService, voiceService,
    onMessage: (message) => options.stateHub.pushChatMessage(message),
    onEvent: (event) => options.stateHub.pushChatEvent(event),
  });

  const obsService = new ObsService({
    settingsStore: obsSettingsStore,
    onConnected: () => { logService.info('obs', 'OBS connected'); options.stateHub.pushObsConnected(); },
    onDisconnected: () => { logService.warn('obs', 'OBS disconnected'); options.stateHub.pushObsDisconnected(); },
    onStats: (stats) => options.stateHub.pushObsStats(stats),
  });

  // --- IPC HANDLERS ---
  ipcMain.handle(IPC_CHANNELS.appGetInfo, async (): Promise<AppInfo> => ({
    appName: APP_NAME, appVersion: options.appVersion,
    electronVersion: process.versions.electron, chromeVersion: process.versions.chrome, nodeVersion: process.versions.node,
  }));

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
    const store = await getTwitchCredentialsStore();
    const creds = store ? await store.load() : null;
    if (creds) options.stateHub.pushChatMessage({ id: `sent-${Date.now()}`, platform: i.platform, author: creds.username, content: i.content, badges: [], timestampLabel: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date()) });
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
    const i = youtubeConnectSchema.parse(raw); if (youtubeScraper) youtubeScraper.stop();
    youtubeScraper = new YouTubeScraper({ videoId: i.videoId, onMessage: (m) => (chatService as any).handleMessage({ id: `yt-${Date.now()}`, timestampLabel: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date()), ...m }), onLog: (msg) => logService.info('youtube', msg) });
    await youtubeScraper.start(); options.stateHub.pushYoutubeStatus(true);
  });
  ipcMain.handle(IPC_CHANNELS.youtubeDisconnect, async () => { if (youtubeScraper) { youtubeScraper.stop(); youtubeScraper = null; } options.stateHub.pushYoutubeStatus(false); });
  ipcMain.handle(IPC_CHANNELS.youtubeGetStatus, async () => youtubeScraper !== null);
  ipcMain.handle(IPC_CHANNELS.youtubeOpenLogin, async (e) => {
    const win = new BrowserWindow({ width: 600, height: 800, parent: BrowserWindow.fromWebContents(e.sender)!, modal: true, title: 'YouTube Login', autoHideMenuBar: true });
    win.webContents.on('did-navigate', (_, u) => { const t = new URL(u); if (t.hostname.includes('youtube.com') && t.pathname === '/' && !u.includes('signin')) setTimeout(() => { if (!win.isDestroyed()) win.close(); }, 1500); });
    await win.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/signin?action_handle_signin=true');
  });
  ipcMain.handle(IPC_CHANNELS.youtubeCheckLive, async (_, handle: unknown) => {
    const videoId = await checkYouTubeLive(String(handle ?? ''));
    return { videoId };
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
  obsService.start();

  return () => {
    schedulerService.stop(); stopTwitchStatsPoll(); if (youtubeMonitorTimer) clearInterval(youtubeMonitorTimer);
    void chatService.disconnectAll(); void obsService.stop();
    Object.values(IPC_CHANNELS).forEach(c => ipcMain.removeHandler(c));
  };

  async function speakWithOsFallback(text: string): Promise<void> {
    if (process.platform === 'darwin') await execFile('say', [text]);
    else if (process.platform === 'linux') await execFile('espeak', [text]);
    else if (process.platform === 'win32') await execFile('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak('${text.replace(/'/g, "''")}')`]);
    else options.stateHub.pushVoiceSpeak({ text, lang: 'en-US' });
  }

  async function dispatchScheduledMessage(content: string, platforms: PlatformId[]): Promise<void> {
    await Promise.allSettled(platforms.map(async (p) => { await chatService.sendMessage(p, content); logService.info('scheduled', 'Sent', { platform: p, content }); }));
  }

  function readCsvEnv(v: string | undefined): string[] | undefined { return v ? v.split(',').map(i => i.trim()).filter(Boolean) : undefined; }
  function readSingleValueAsArray(v: string | undefined): string[] | undefined { return v?.trim() ? [v.trim()] : undefined; }
}
