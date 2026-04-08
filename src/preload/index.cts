import { contextBridge, ipcRenderer } from 'electron';

import type { CopilotApi, RecentChatSnapshot } from '../shared/ipc.js';
import type {
  ChatMessage,
  CloneProfileInput,
  CreateProfileInput,
  DeleteProfileInput,
  EventLogEntry,
  EventLogFilters,
  GeneralSettings,
  ObsConnectionSettings,
  ObsStatsSnapshot,
  RenameProfileInput,
  RendererVoiceCapabilities,
  ScheduledMessageDeleteInput,
  ScheduledMessageUpsertInput,
  ScheduledStatusItem,
  SelectProfileInput,
  SoundCommandDeleteInput,
  SoundCommandUpsertInput,
  SoundPlayPayload,
  StreamEvent,
  VoiceCommandDeleteInput,
  VoiceCommandUpsertInput,
  VoiceSpeakPayload,
} from '../shared/types.js';

const IPC_CHANNELS = {
  appGetInfo: 'app:get-info',
  profilesList: 'profiles:list',
  profilesSelect: 'profiles:select',
  profilesCreate: 'profiles:create',
  profilesRename: 'profiles:rename',
  profilesClone: 'profiles:clone',
  profilesDelete: 'profiles:delete',
  profilesPickDirectory: 'profiles:pick-directory',
  generalGetSettings: 'general:get-settings',
  generalSaveSettings: 'general:save-settings',
  scheduledList: 'scheduled:list',
  scheduledUpsert: 'scheduled:upsert',
  scheduledDelete: 'scheduled:delete',
  scheduledStatus: 'scheduled:status',
  voiceList: 'voice:list',
  voiceUpsert: 'voice:upsert',
  voiceDelete: 'voice:delete',
  voicePreviewSpeak: 'voice:preview-speak',
  voiceSpeak: 'voice:speak',
  voiceSetRendererCapabilities: 'voice:set-renderer-capabilities',
  soundsList: 'sounds:list',
  soundsUpsert: 'sounds:upsert',
  soundsDelete: 'sounds:delete',
  soundsPickFile: 'sounds:pick-file',
  soundsPreviewPlay: 'sounds:preview-play',
  soundsPlay: 'sounds:play',
  obsGetSettings: 'obs:get-settings',
  obsSaveSettings: 'obs:save-settings',
  obsTestConnection: 'obs:test-connection',
  obsStats: 'obs:stats',
  obsConnected: 'obs:connected',
  obsDisconnected: 'obs:disconnected',
  chatGetRecent: 'chat:get-recent',
  chatMessage: 'chat:message',
  chatEvent: 'chat:event',
  logsList: 'logs:list',
} as const;

const copilotApi: CopilotApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo),
  listProfiles: () => ipcRenderer.invoke(IPC_CHANNELS.profilesList),
  selectProfile: (input: SelectProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesSelect, input),
  createProfile: (input: CreateProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesCreate, input),
  renameProfile: (input: RenameProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesRename, input),
  cloneProfile: (input: CloneProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesClone, input),
  deleteProfile: (input: DeleteProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesDelete, input),
  pickProfileDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.profilesPickDirectory),
  getGeneralSettings: () => ipcRenderer.invoke(IPC_CHANNELS.generalGetSettings) as Promise<GeneralSettings>,
  saveGeneralSettings: (input: GeneralSettings) =>
    ipcRenderer.invoke(IPC_CHANNELS.generalSaveSettings, input) as Promise<GeneralSettings>,
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
