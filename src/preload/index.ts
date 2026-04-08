import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type CopilotApi } from '../shared/ipc.js';
import type {
  CloneProfileInput,
  CreateProfileInput,
  DeleteProfileInput,
  RenameProfileInput,
  ScheduledMessageDeleteInput,
  ScheduledMessageUpsertInput,
  ScheduledStatusItem,
  SelectProfileInput,
  VoiceCommandDeleteInput,
  VoiceCommandUpsertInput,
  VoiceSpeakPayload,
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
  listScheduledMessages: () => ipcRenderer.invoke(IPC_CHANNELS.scheduledList),
  upsertScheduledMessage: (input: ScheduledMessageUpsertInput) => ipcRenderer.invoke(IPC_CHANNELS.scheduledUpsert, input),
  deleteScheduledMessage: (input: ScheduledMessageDeleteInput) => ipcRenderer.invoke(IPC_CHANNELS.scheduledDelete, input),
  onScheduledStatus: (listener: (items: ScheduledStatusItem[]) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, items: ScheduledStatusItem[]) => listener(items);
    ipcRenderer.on(IPC_CHANNELS.scheduledStatus, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.scheduledStatus, wrappedListener);
    };
  },
  listVoiceCommands: () => ipcRenderer.invoke(IPC_CHANNELS.voiceList),
  upsertVoiceCommand: (input: VoiceCommandUpsertInput) => ipcRenderer.invoke(IPC_CHANNELS.voiceUpsert, input),
  deleteVoiceCommand: (input: VoiceCommandDeleteInput) => ipcRenderer.invoke(IPC_CHANNELS.voiceDelete, input),
  previewVoiceSpeak: (input: VoiceSpeakPayload) => ipcRenderer.invoke(IPC_CHANNELS.voicePreviewSpeak, input),
  onVoiceSpeak: (listener: (payload: VoiceSpeakPayload) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: VoiceSpeakPayload) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.voiceSpeak, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.voiceSpeak, wrappedListener);
    };
  },
};

contextBridge.exposeInMainWorld('copilot', copilotApi);
