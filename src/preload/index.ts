import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type CopilotApi } from '../shared/ipc.js';
import type {
  CloneProfileInput,
  CreateProfileInput,
  DeleteProfileInput,
  RenameProfileInput,
  SelectProfileInput,
} from '../shared/types.js';

const copilotApi: CopilotApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo),
  listProfiles: () => ipcRenderer.invoke(IPC_CHANNELS.profilesList),
  selectProfile: (input: SelectProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesSelect, input),
  createProfile: (input: CreateProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesCreate, input),
  renameProfile: (input: RenameProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesRename, input),
  cloneProfile: (input: CloneProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesClone, input),
  deleteProfile: (input: DeleteProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesDelete, input),
  pickProfileDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.profilesPickDirectory),
};

contextBridge.exposeInMainWorld('copilot', copilotApi);
