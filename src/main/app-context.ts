import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';

import type { DatabaseHandle } from '../db/database.js';
import { ScheduledMessageRepository } from '../modules/scheduled/scheduled-repository.js';
import { SchedulerService } from '../modules/scheduled/scheduler-service.js';
import { ProfileStore } from '../modules/settings/profile-store.js';
import { APP_NAME } from '../shared/constants.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import {
  cloneProfileInputSchema,
  createProfileInputSchema,
  deleteProfileInputSchema,
  renameProfileInputSchema,
  scheduledMessageDeleteInputSchema,
  scheduledMessageUpsertInputSchema,
  selectProfileInputSchema,
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
  const profileStore = new ProfileStore(options.userDataPath);
  const scheduledRepository = new ScheduledMessageRepository(options.databaseHandle.db);
  const schedulerService = new SchedulerService({
    repository: scheduledRepository,
    onStatus: (items) => options.stateHub.pushScheduledStatus(items),
  });

  schedulerService.start();

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

  return () => {
    schedulerService.stop();
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
  };
}
