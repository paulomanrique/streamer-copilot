import { execFile as execFileCallback } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';

import type { DatabaseHandle } from '../db/database.js';
import { ChatService } from '../modules/chat/chat-service.js';
import { ObsService } from '../modules/obs/obs-service.js';
import { ObsSettingsStore } from '../modules/obs/obs-settings-store.js';
import { ScheduledMessageRepository } from '../modules/scheduled/scheduled-repository.js';
import { SchedulerService } from '../modules/scheduled/scheduler-service.js';
import { AppSettingsRepository } from '../modules/settings/app-settings-repository.js';
import { ProfileStore } from '../modules/settings/profile-store.js';
import { SoundCommandRepository } from '../modules/sounds/sound-repository.js';
import { SoundService } from '../modules/sounds/sound-service.js';
import { VoiceCommandRepository } from '../modules/voice/voice-repository.js';
import { VoiceService } from '../modules/voice/voice-service.js';
import { APP_NAME } from '../shared/constants.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import {
  cloneProfileInputSchema,
  createProfileInputSchema,
  deleteProfileInputSchema,
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
import type { AppInfo } from '../shared/types.js';
import { StateHub } from './state-hub.js';

interface AppContextOptions {
  appVersion: string;
  databaseHandle: DatabaseHandle;
  stateHub: StateHub;
  userDataPath: string;
}

export function createAppContext(options: AppContextOptions): () => void {
  const execFile = promisify(execFileCallback);
  const profileStore = new ProfileStore(options.userDataPath);
  const appSettingsRepository = new AppSettingsRepository(options.databaseHandle.db);
  const obsSettingsStore = new ObsSettingsStore(appSettingsRepository);
  const scheduledRepository = new ScheduledMessageRepository(options.databaseHandle.db);
  const soundRepository = new SoundCommandRepository(options.databaseHandle.db);
  const voiceRepository = new VoiceCommandRepository(options.databaseHandle.db);
  const schedulerService = new SchedulerService({
    repository: scheduledRepository,
    onStatus: (items) => options.stateHub.pushScheduledStatus(items),
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
  const obsService = new ObsService({
    settingsStore: obsSettingsStore,
    onConnected: () => options.stateHub.pushObsConnected(),
    onDisconnected: () => options.stateHub.pushObsDisconnected(),
    onStats: (stats) => options.stateHub.pushObsStats(stats),
  });
  const soundsDirectory = path.join(options.userDataPath, 'sounds');

  schedulerService.start();
  void chatService.connectAll();
  obsService.start();

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
    return profileStore.select(input.profileId);
  });

  ipcMain.handle(IPC_CHANNELS.profilesCreate, async (_event, rawInput: unknown) => {
    const input = createProfileInputSchema.parse(rawInput);
    return profileStore.create(input.name, input.directory);
  });

  ipcMain.handle(IPC_CHANNELS.profilesRename, async (_event, rawInput: unknown) => {
    const input = renameProfileInputSchema.parse(rawInput);
    return profileStore.rename(input.profileId, input.name);
  });

  ipcMain.handle(IPC_CHANNELS.profilesClone, async (_event, rawInput: unknown) => {
    const input = cloneProfileInputSchema.parse(rawInput);
    return profileStore.clone(input.profileId, input.name, input.directory);
  });

  ipcMain.handle(IPC_CHANNELS.profilesDelete, async (_event, rawInput: unknown) => {
    const input = deleteProfileInputSchema.parse(rawInput);
    return profileStore.delete(input.profileId);
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

  ipcMain.handle(IPC_CHANNELS.scheduledList, async () => schedulerService.list());

  ipcMain.handle(IPC_CHANNELS.scheduledUpsert, async (_event, rawInput: unknown) => {
    const input = scheduledMessageUpsertInputSchema.parse(rawInput);
    return schedulerService.upsert(input);
  });

  ipcMain.handle(IPC_CHANNELS.scheduledDelete, async (_event, rawInput: unknown) => {
    const input = scheduledMessageDeleteInputSchema.parse(rawInput);
    return schedulerService.delete(input.id);
  });

  ipcMain.handle(IPC_CHANNELS.voiceList, async () => voiceService.list());

  ipcMain.handle(IPC_CHANNELS.voiceUpsert, async (_event, rawInput: unknown) => {
    const input = voiceCommandUpsertInputSchema.parse(rawInput);
    return voiceService.upsert(input);
  });

  ipcMain.handle(IPC_CHANNELS.voiceDelete, async (_event, rawInput: unknown) => {
    const input = voiceCommandDeleteInputSchema.parse(rawInput);
    return voiceService.delete(input.id);
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
    return soundService.upsert(input);
  });

  ipcMain.handle(IPC_CHANNELS.soundsDelete, async (_event, rawInput: unknown) => {
    const input = soundCommandDeleteInputSchema.parse(rawInput);
    return soundService.delete(input.id);
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

    return destinationPath;
  });

  ipcMain.handle(IPC_CHANNELS.soundsPreviewPlay, async (_event, rawInput: unknown) => {
    const input = soundPlayPayloadSchema.parse(rawInput);
    soundService.previewPlay(input);
  });

  ipcMain.handle(IPC_CHANNELS.obsGetSettings, async () => obsService.getSettings());

  ipcMain.handle(IPC_CHANNELS.obsSaveSettings, async (_event, rawInput: unknown) => {
    const input = obsConnectionSettingsSchema.parse(rawInput);
    return obsService.saveSettings(input);
  });

  ipcMain.handle(IPC_CHANNELS.obsTestConnection, async (_event, rawInput: unknown) => {
    const input = obsConnectionSettingsSchema.parse(rawInput);
    await obsService.testConnection(input);
  });

  ipcMain.handle(IPC_CHANNELS.chatGetRecent, async () => chatService.getRecent());

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
}
