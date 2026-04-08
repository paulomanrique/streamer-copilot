import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type CopilotApi, type RecentChatSnapshot } from '../shared/ipc.js';
import type {
  ChatMessage,
  CloneProfileInput,
  CreateProfileInput,
  DeleteProfileInput,
  EventLogEntry,
  EventLogFilters,
  ObsConnectionSettings,
  ObsStatsSnapshot,
  RenameProfileInput,
  RendererVoiceCapabilities,
  SoundCommandDeleteInput,
  SoundCommandUpsertInput,
  SoundPlayPayload,
  StreamEvent,
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
  setRendererVoiceCapabilities: (input: RendererVoiceCapabilities) =>
    ipcRenderer.invoke(IPC_CHANNELS.voiceSetRendererCapabilities, input),
  onVoiceSpeak: (listener: (payload: VoiceSpeakPayload) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: VoiceSpeakPayload) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.voiceSpeak, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.voiceSpeak, wrappedListener);
    };
  },
  listSoundCommands: () => ipcRenderer.invoke(IPC_CHANNELS.soundsList),
  upsertSoundCommand: (input: SoundCommandUpsertInput) => ipcRenderer.invoke(IPC_CHANNELS.soundsUpsert, input),
  deleteSoundCommand: (input: SoundCommandDeleteInput) => ipcRenderer.invoke(IPC_CHANNELS.soundsDelete, input),
  pickSoundFile: () => ipcRenderer.invoke(IPC_CHANNELS.soundsPickFile),
  previewSoundPlay: (input: SoundPlayPayload) => ipcRenderer.invoke(IPC_CHANNELS.soundsPreviewPlay, input),
  onSoundPlay: (listener: (payload: SoundPlayPayload) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: SoundPlayPayload) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.soundsPlay, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.soundsPlay, wrappedListener);
    };
  },
  getObsSettings: () => ipcRenderer.invoke(IPC_CHANNELS.obsGetSettings),
  saveObsSettings: (input: ObsConnectionSettings) => ipcRenderer.invoke(IPC_CHANNELS.obsSaveSettings, input),
  testObsConnection: (input: ObsConnectionSettings) => ipcRenderer.invoke(IPC_CHANNELS.obsTestConnection, input),
  onObsStats: (listener: (payload: ObsStatsSnapshot) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: ObsStatsSnapshot) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.obsStats, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.obsStats, wrappedListener);
    };
  },
  onObsConnected: (listener: () => void) => {
    const wrappedListener = () => listener();
    ipcRenderer.on(IPC_CHANNELS.obsConnected, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.obsConnected, wrappedListener);
    };
  },
  onObsDisconnected: (listener: () => void) => {
    const wrappedListener = () => listener();
    ipcRenderer.on(IPC_CHANNELS.obsDisconnected, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.obsDisconnected, wrappedListener);
    };
  },
  getRecentChat: () => ipcRenderer.invoke(IPC_CHANNELS.chatGetRecent) as Promise<RecentChatSnapshot>,
  onChatMessage: (listener: (payload: ChatMessage) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: ChatMessage) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.chatMessage, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.chatMessage, wrappedListener);
    };
  },
  onChatEvent: (listener: (payload: StreamEvent) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: StreamEvent) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.chatEvent, wrappedListener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.chatEvent, wrappedListener);
    };
  },
  listEventLogs: (filters?: EventLogFilters) => ipcRenderer.invoke(IPC_CHANNELS.logsList, filters) as Promise<EventLogEntry[]>,
};

contextBridge.exposeInMainWorld('copilot', copilotApi);
