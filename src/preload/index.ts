import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type CopilotApi } from '../shared/ipc.js';
import type { SelectProfileInput } from '../shared/types.js';

const copilotApi: CopilotApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo),
  listProfiles: () => ipcRenderer.invoke(IPC_CHANNELS.profilesList),
  selectProfile: (input: SelectProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesSelect, input),
};

contextBridge.exposeInMainWorld('copilot', copilotApi);
