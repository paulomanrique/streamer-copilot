import { execFile as execFileCallback } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { BrowserWindow, dialog, ipcMain } from 'electron';
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
import { createTwitchChatAdapter } from '../platforms/twitch/adapter.js';
import { createYouTubeChatAdapter } from '../platforms/youtube/adapter.js';
import { APP_NAME } from '../shared/constants.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import {
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
  voiceCommandDeleteInputSchema,
  voiceCommandUpsertInputSchema,
  voiceSpeakPayloadSchema,
} from '../shared/schemas.js';
import type { AppInfo, PlatformId } from '../shared/types.js';
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
  const chatService = new ChatService({
    soundService,
    voiceService,
    onMessage: (message) => options.stateHub.pushChatMessage(message),
    onEvent: (event) => options.stateHub.pushChatEvent(event),
  });
  chatService.registerAdapter(
    createTwitchChatAdapter({
      channels: readCsvEnv('TWITCH_CHANNELS') ?? readSingleValueAsArray(process.env.TWITCH_CHANNEL),
      username: process.env.TWITCH_USERNAME ?? process.env.TWITCH_BOT_USERNAME,
      password: process.env.TWITCH_OAUTH_TOKEN ?? process.env.TWITCH_PASSWORD,
      mockAuthor: 'Streamer',
    }),
  );
  chatService.registerAdapter(
    createYouTubeChatAdapter({
      liveChatId: process.env.YOUTUBE_LIVE_CHAT_ID,
      accessToken: process.env.YOUTUBE_ACCESS_TOKEN,
      refreshToken: process.env.YOUTUBE_REFRESH_TOKEN,
      clientId: process.env.YOUTUBE_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
      apiKey: process.env.YOUTUBE_API_KEY,
      mockAuthor: 'YouTube',
      mockChannel: process.env.YOUTUBE_CHANNEL_TITLE ?? 'YouTube',
    }),
  );
  chatService.registerAdapter(
    createKickChatAdapter({
      channelSlug: process.env.KICK_CHANNEL_SLUG,
      chatroomId: process.env.KICK_CHATROOM_ID,
      clientId: process.env.KICK_CLIENT_ID,
      clientSecret: process.env.KICK_CLIENT_SECRET,
    }),
  );
  const obsService = new ObsService({
    settingsStore: obsSettingsStore,
    onConnected: () => {
      logService.info('obs', 'OBS connection established');
      options.stateHub.pushObsConnected();
    },
    onDisconnected: () => {
      logService.warn('obs', 'OBS connection lost');
      options.stateHub.pushObsDisconnected();
    },
    onStats: (stats) => options.stateHub.pushObsStats(stats),
  });
  const soundsDirectory = path.join(options.userDataPath, 'sounds');

  schedulerService.start();
  void chatService.connectAll().catch((cause: unknown) => {
    logService.warn('chat', 'Chat adapters failed to connect cleanly', {
      error: cause instanceof Error ? cause.message : String(cause),
    });
  });
  obsService.start();
  logService.info('app', 'Application context initialized', {
    userDataPath: options.userDataPath,
  });

  ipcMain.handle(IPC_CHANNELS.appGetInfo, async (): Promise<AppInfo> => ({
    appName: APP_NAME,
    appVersion: options.appVersion,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
  }));

  ipcMain.handle(IPC_CHANNELS.profilesList, async () => profileStore.list());

  ipcMain.handle(IPC_CHANNELS.profilesSelect, async (_event, rawInput: unknown) => {
    const input = selectProfileInputSchema.parse(rawInput);
    const snapshot = await profileStore.select(input.profileId);
    logService.info('profiles', 'Profile selected', { profileId: input.profileId });
    return snapshot;
  });

  ipcMain.handle(IPC_CHANNELS.profilesCreate, async (_event, rawInput: unknown) => {
    const input = createProfileInputSchema.parse(rawInput);
    const snapshot = await profileStore.create(input.name, input.directory);
    logService.info('profiles', 'Profile created', { name: input.name, directory: input.directory });
    return snapshot;
  });

  ipcMain.handle(IPC_CHANNELS.profilesRename, async (_event, rawInput: unknown) => {
    const input = renameProfileInputSchema.parse(rawInput);
    const snapshot = await profileStore.rename(input.profileId, input.name);
    logService.info('profiles', 'Profile renamed', { profileId: input.profileId, name: input.name });
    return snapshot;
  });

  ipcMain.handle(IPC_CHANNELS.profilesClone, async (_event, rawInput: unknown) => {
    const input = cloneProfileInputSchema.parse(rawInput);
    const snapshot = await profileStore.clone(input.profileId, input.name, input.directory);
    logService.info('profiles', 'Profile cloned', {
      profileId: input.profileId,
      name: input.name,
      directory: input.directory,
    });
    return snapshot;
  });

  ipcMain.handle(IPC_CHANNELS.profilesDelete, async (_event, rawInput: unknown) => {
    const input = deleteProfileInputSchema.parse(rawInput);
    const snapshot = await profileStore.delete(input.profileId);
    logService.warn('profiles', 'Profile deleted', { profileId: input.profileId });
    return snapshot;
  });

  ipcMain.handle(IPC_CHANNELS.profilesPickDirectory, async (event) => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Select profile directory',
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.generalGetSettings, async () => generalSettingsStore.load());

  ipcMain.handle(IPC_CHANNELS.generalSaveSettings, async (_event, rawInput: unknown) => {
    const input = generalSettingsSchema.parse(rawInput);
    const saved = generalSettingsStore.save(input);
    await options.onGeneralSettingsChanged(saved);
    logService.info('settings', 'General settings saved', saved);
    return saved;
  });

  ipcMain.handle(IPC_CHANNELS.scheduledList, async () => schedulerService.list());

  ipcMain.handle(IPC_CHANNELS.scheduledUpsert, async (_event, rawInput: unknown) => {
    const input = scheduledMessageUpsertInputSchema.parse(rawInput);
    const items = schedulerService.upsert(input);
    logService.info('scheduled', 'Scheduled message saved', { id: input.id ?? null, message: input.message });
    return items;
  });

  ipcMain.handle(IPC_CHANNELS.scheduledDelete, async (_event, rawInput: unknown) => {
    const input = scheduledMessageDeleteInputSchema.parse(rawInput);
    const items = schedulerService.delete(input.id);
    logService.warn('scheduled', 'Scheduled message deleted', { id: input.id });
    return items;
  });

  ipcMain.handle(IPC_CHANNELS.voiceList, async () => voiceService.list());

  ipcMain.handle(IPC_CHANNELS.voiceUpsert, async (_event, rawInput: unknown) => {
    const input = voiceCommandUpsertInputSchema.parse(rawInput);
    const items = voiceService.upsert(input);
    logService.info('voice', 'Voice command saved', { trigger: input.trigger, id: input.id ?? null });
    return items;
  });

  ipcMain.handle(IPC_CHANNELS.voiceDelete, async (_event, rawInput: unknown) => {
    const input = voiceCommandDeleteInputSchema.parse(rawInput);
    const items = voiceService.delete(input.id);
    logService.warn('voice', 'Voice command deleted', { id: input.id });
    return items;
  });

  ipcMain.handle(IPC_CHANNELS.voicePreviewSpeak, async (_event, rawInput: unknown) => {
    const input = voiceSpeakPayloadSchema.parse(rawInput);
    voiceService.previewSpeak(input);
  });

  ipcMain.handle(IPC_CHANNELS.voiceSetRendererCapabilities, async (_event, rawInput: unknown) => {
    const input = rendererVoiceCapabilitiesSchema.parse(rawInput);
    rendererSpeechSynthesisAvailable = input.speechSynthesisAvailable;
  });

  ipcMain.handle(IPC_CHANNELS.soundsList, async () => soundService.list());

  ipcMain.handle(IPC_CHANNELS.soundsUpsert, async (_event, rawInput: unknown) => {
    const input = soundCommandUpsertInputSchema.parse(rawInput);
    const items = soundService.upsert(input);
    logService.info('sounds', 'Sound command saved', { trigger: input.trigger, id: input.id ?? null });
    return items;
  });

  ipcMain.handle(IPC_CHANNELS.soundsDelete, async (_event, rawInput: unknown) => {
    const input = soundCommandDeleteInputSchema.parse(rawInput);
    const items = soundService.delete(input.id);
    logService.warn('sounds', 'Sound command deleted', { id: input.id });
    return items;
  });

  ipcMain.handle(IPC_CHANNELS.soundsPickFile, async (event) => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Select sound file',
      properties: ['openFile'],
      filters: [
        {
          name: 'Audio',
          extensions: ['mp3', 'ogg', 'wav'],
        },
      ],
    };
    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) return null;

    const sourcePath = result.filePaths[0];
    const extension = path.extname(sourcePath);
    const destinationPath = path.join(soundsDirectory, `${randomUUID()}${extension}`);

    await fs.mkdir(soundsDirectory, { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
    logService.info('sounds', 'Sound file imported', { sourcePath, destinationPath });

    return destinationPath;
  });

  ipcMain.handle(IPC_CHANNELS.soundsPreviewPlay, async (_event, rawInput: unknown) => {
    const input = soundPlayPayloadSchema.parse(rawInput);
    soundService.previewPlay(input);
  });

  ipcMain.handle(IPC_CHANNELS.obsGetSettings, async () => obsService.getSettings());

  ipcMain.handle(IPC_CHANNELS.obsSaveSettings, async (_event, rawInput: unknown) => {
    const input = obsConnectionSettingsSchema.parse(rawInput);
    const saved = await obsService.saveSettings(input);
    logService.info('obs', 'OBS settings saved', { host: saved.host, port: saved.port });
    return saved;
  });

  ipcMain.handle(IPC_CHANNELS.obsTestConnection, async (_event, rawInput: unknown) => {
    const input = obsConnectionSettingsSchema.parse(rawInput);
    await obsService.testConnection(input);
    logService.info('obs', 'OBS connection test succeeded', { host: input.host, port: input.port });
  });

  ipcMain.handle(IPC_CHANNELS.chatGetRecent, async () => chatService.getRecent());
  ipcMain.handle(IPC_CHANNELS.logsList, async (_event, rawInput: unknown) => {
    const filters = eventLogFiltersSchema.parse(rawInput);
    return logService.list(filters);
  });

  return () => {
    schedulerService.stop();
    void chatService.disconnectAll();
    void obsService.stop();
    ipcMain.removeHandler(IPC_CHANNELS.appGetInfo);
    ipcMain.removeHandler(IPC_CHANNELS.profilesList);
    ipcMain.removeHandler(IPC_CHANNELS.profilesSelect);
    ipcMain.removeHandler(IPC_CHANNELS.profilesCreate);
    ipcMain.removeHandler(IPC_CHANNELS.profilesRename);
    ipcMain.removeHandler(IPC_CHANNELS.profilesClone);
    ipcMain.removeHandler(IPC_CHANNELS.profilesDelete);
    ipcMain.removeHandler(IPC_CHANNELS.profilesPickDirectory);
    ipcMain.removeHandler(IPC_CHANNELS.generalGetSettings);
    ipcMain.removeHandler(IPC_CHANNELS.generalSaveSettings);
    ipcMain.removeHandler(IPC_CHANNELS.scheduledList);
    ipcMain.removeHandler(IPC_CHANNELS.scheduledUpsert);
    ipcMain.removeHandler(IPC_CHANNELS.scheduledDelete);
    ipcMain.removeHandler(IPC_CHANNELS.voiceList);
    ipcMain.removeHandler(IPC_CHANNELS.voiceUpsert);
    ipcMain.removeHandler(IPC_CHANNELS.voiceDelete);
    ipcMain.removeHandler(IPC_CHANNELS.voicePreviewSpeak);
    ipcMain.removeHandler(IPC_CHANNELS.voiceSetRendererCapabilities);
    ipcMain.removeHandler(IPC_CHANNELS.soundsList);
    ipcMain.removeHandler(IPC_CHANNELS.soundsUpsert);
    ipcMain.removeHandler(IPC_CHANNELS.soundsDelete);
    ipcMain.removeHandler(IPC_CHANNELS.soundsPickFile);
    ipcMain.removeHandler(IPC_CHANNELS.soundsPreviewPlay);
    ipcMain.removeHandler(IPC_CHANNELS.obsGetSettings);
    ipcMain.removeHandler(IPC_CHANNELS.obsSaveSettings);
    ipcMain.removeHandler(IPC_CHANNELS.obsTestConnection);
    ipcMain.removeHandler(IPC_CHANNELS.chatGetRecent);
    ipcMain.removeHandler(IPC_CHANNELS.logsList);
  };

  async function speakWithOsFallback(text: string): Promise<void> {
    if (process.platform === 'darwin') {
      await execFile('say', [text]);
      return;
    }

    if (process.platform === 'linux') {
      await execFile('espeak', [text]);
      return;
    }

    if (process.platform === 'win32') {
      const escapedText = text.replace(/'/g, "''");
      await execFile('powershell', [
        '-NoProfile',
        '-Command',
        `Add-Type -AssemblyName System.Speech; $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speaker.Speak('${escapedText}')`,
      ]);
      return;
    }

    options.stateHub.pushVoiceSpeak({ text, lang: 'en-US' });
  }

  async function dispatchScheduledMessage(content: string, platforms: PlatformId[]): Promise<void> {
    const results = await Promise.allSettled(
      platforms.map(async (platform) => {
        await chatService.sendMessage(platform, content);
        logService.info('scheduled', 'Scheduled message dispatched', { platform, content });
      }),
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') return;
      logService.warn('scheduled', 'Scheduled message skipped', {
        platform: platforms[index],
        content,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    });
  }

  function readCsvEnv(value: string | undefined): string[] | undefined {
    if (!value) return undefined;
    const items = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }

  function readSingleValueAsArray(value: string | undefined): string[] | undefined {
    if (!value?.trim()) return undefined;
    return [value.trim()];
  }
}
