import { ipcMain } from 'electron';

import { ProfileStore } from '../modules/settings/profile-store.js';
import { APP_NAME } from '../shared/constants.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import { selectProfileInputSchema } from '../shared/schemas.js';
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

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.appGetInfo);
    ipcMain.removeHandler(IPC_CHANNELS.profilesList);
    ipcMain.removeHandler(IPC_CHANNELS.profilesSelect);
  };
}
