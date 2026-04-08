import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';

import { ProfileStore } from '../modules/settings/profile-store.js';
import { APP_NAME } from '../shared/constants.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import {
  cloneProfileInputSchema,
  createProfileInputSchema,
  deleteProfileInputSchema,
  renameProfileInputSchema,
  selectProfileInputSchema,
} from '../shared/schemas.js';
import type { AppInfo } from '../shared/types.js';

interface AppContextOptions {
  appVersion: string;
  userDataPath: string;
}

export function createAppContext(options: AppContextOptions): () => void {
  const profileStore = new ProfileStore(options.userDataPath);

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

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.appGetInfo);
    ipcMain.removeHandler(IPC_CHANNELS.profilesList);
    ipcMain.removeHandler(IPC_CHANNELS.profilesSelect);
    ipcMain.removeHandler(IPC_CHANNELS.profilesCreate);
    ipcMain.removeHandler(IPC_CHANNELS.profilesRename);
    ipcMain.removeHandler(IPC_CHANNELS.profilesClone);
    ipcMain.removeHandler(IPC_CHANNELS.profilesDelete);
    ipcMain.removeHandler(IPC_CHANNELS.profilesPickDirectory);
  };
}
