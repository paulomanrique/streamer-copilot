import { contextBridge, ipcRenderer } from 'electron';

import type { CopilotApi, RecentChatSnapshot, ChatSession, ChatLogMessage } from '../shared/ipc.js';
import type {
  ChatMessage,
  CloneProfileInput,
  TwitchLiveStats,
  CreateProfileInput,
  DeleteProfileInput,
  EventLogEntry,
  EventLogFilters,
  GeneralSettings,
  ObsConnectionSettings,
  ObsStatsSnapshot,
  ProfilesSnapshot,
  Raffle,
  RaffleControlActionInput,
  RaffleCreateInput,
  RaffleDeleteInput,
  RaffleEntry,
  RaffleOverlayInfo,
  RaffleRoundResult,
  RaffleSnapshot,
  RaffleUpdateInput,
  RenameProfileInput,
  RendererVoiceCapabilities,
  ScheduledAvailableTargets,
  ScheduledMessage,
  ScheduledMessageDeleteInput,
  ScheduledMessageUpsertInput,
  ScheduledStatusItem,
  SelectProfileInput,
  TextCommand,
  TextCommandDeleteInput,
  TextCommandUpsertInput,
  SoundCommand,
  SoundCommandDeleteInput,
  SoundCommandUpsertInput,
  SoundPlayPayload,
  StreamEvent,
  TikTokConnectionStatus,
  TikTokSettings,
  TwitchConnectionStatus,
  TwitchCredentials,
  VoiceCommand,
  VoiceCommandDeleteInput,
  VoiceCommandUpsertInput,
  VoiceSpeakPayload,
  YouTubeStreamInfo,
} from '../shared/types.js';

const IPC_CHANNELS = {
  appGetInfo: 'app:get-info',
  appOpenExternalUrl: 'app:open-external-url',
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
  scheduledGetAvailableTargets: 'scheduled:get-available-targets',
  scheduledStatus: 'scheduled:status',
  rafflesList: 'raffles:list',
  rafflesCreate: 'raffles:create',
  rafflesUpdate: 'raffles:update',
  rafflesDelete: 'raffles:delete',
  rafflesGetActive: 'raffles:get-active',
  rafflesGetSnapshot: 'raffles:get-snapshot',
  rafflesControl: 'raffles:control',
  rafflesOverlayInfo: 'raffles:overlay-info',
  rafflesState: 'raffles:state',
  rafflesEntry: 'raffles:entry',
  rafflesResult: 'raffles:result',
  rafflesSoundsList: 'raffles:sounds-list',
  rafflesSoundsPreview: 'raffles:sounds-preview',
  textList: 'text:list',
  textUpsert: 'text:upsert',
  textDelete: 'text:delete',
  voiceList: 'voice:list',
  voiceUpsert: 'voice:upsert',
  voiceDelete: 'voice:delete',
  voiceSpeak: 'voice:speak',
  voicePreviewSpeak: 'voice:preview-speak',
  voiceSetRendererCapabilities: 'voice:set-renderer-capabilities',
  soundsList: 'sounds:list',
  soundsUpsert: 'sounds:upsert',
  soundsDelete: 'sounds:delete',
  soundsPickFile: 'sounds:pick-file',
  soundsReadFile: 'sounds:read-file',
  soundsPlay: 'sounds:play',
  soundsPreviewPlay: 'sounds:preview-play',
  obsGetSettings: 'obs:get-settings',
  obsSaveSettings: 'obs:save-settings',
  obsTestConnection: 'obs:test-connection',
  obsConnected: 'obs:connected',
  obsDisconnected: 'obs:disconnected',
  obsStats: 'obs:stats',
  chatGetRecent: 'chat:get-recent',
  chatMessage: 'chat:message',
  chatEvent: 'chat:event',
  chatSendMessage: 'chat:send-message',
  logsList: 'logs:list',
  twitchLiveStats: 'twitch:live-stats',
  twitchGetUserAvatars: 'twitch:get-user-avatars',
  twitchGetBadgeUrls: 'twitch:get-badge-urls',
  twitchGetCredentials: 'twitch:get-credentials',
  twitchConnect: 'twitch:connect',
  twitchDisconnect: 'twitch:disconnect',
  twitchGetStatus: 'twitch:get-status',
  twitchStatus: 'twitch:status',
  twitchStartOAuth: 'twitch:start-oauth',
  youtubeConnect: 'youtube:connect',
  youtubeDisconnect: 'youtube:disconnect',
  youtubeGetStatus: 'youtube:get-status',
  youtubeOpenLogin: 'youtube:open-login',
  youtubeGetSettings: 'youtube:get-settings',
  youtubeSaveSettings: 'youtube:save-settings',
  youtubeCheckLive: 'youtube:check-live',
  tiktokConnect: 'tiktok:connect',
  tiktokDisconnect: 'tiktok:disconnect',
  tiktokGetStatus: 'tiktok:get-status',
  tiktokGetSettings: 'tiktok:get-settings',
  tiktokSaveSettings: 'tiktok:save-settings',
  tiktokStatus: 'tiktok:status',
  tiktokCheckLive: 'tiktok:check-live',
  chatLogListSessions: 'chatLog:list-sessions',
  chatLogGetMessages: 'chatLog:get-messages',
  chatLogExportSession: 'chatLog:export-session',
  chatLogDeleteSession: 'chatLog:delete-session',
} as const;

const copilotApi: CopilotApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo),
  openExternalUrl: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.appOpenExternalUrl, url),
  listProfiles: () => ipcRenderer.invoke(IPC_CHANNELS.profilesList),
  selectProfile: (input: SelectProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesSelect, input),
  createProfile: (input: CreateProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesCreate, input),
  renameProfile: (input: RenameProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesRename, input),
  cloneProfile: (input: CloneProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesClone, input),
  deleteProfile: (input: DeleteProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.profilesDelete, input),
  pickProfileDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.profilesPickDirectory) as Promise<string | null>,
  getGeneralSettings: () => ipcRenderer.invoke(IPC_CHANNELS.generalGetSettings),
  saveGeneralSettings: (settings: GeneralSettings) => ipcRenderer.invoke(IPC_CHANNELS.generalSaveSettings, settings),
  listScheduledMessages: () => ipcRenderer.invoke(IPC_CHANNELS.scheduledList),
  upsertScheduledMessage: (input: ScheduledMessageUpsertInput) => ipcRenderer.invoke(IPC_CHANNELS.scheduledUpsert, input),
  deleteScheduledMessage: (input: ScheduledMessageDeleteInput) => ipcRenderer.invoke(IPC_CHANNELS.scheduledDelete, input),
  getScheduledAvailableTargets: () => ipcRenderer.invoke(IPC_CHANNELS.scheduledGetAvailableTargets) as Promise<ScheduledAvailableTargets>,
  onScheduledStatus: (listener: (items: ScheduledStatusItem[]) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, items: ScheduledStatusItem[]) => listener(items);
    ipcRenderer.on(IPC_CHANNELS.scheduledStatus, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.scheduledStatus, wrappedListener); };
  },
  listRaffles: () => ipcRenderer.invoke(IPC_CHANNELS.rafflesList) as Promise<Raffle[]>,
  createRaffle: (input: RaffleCreateInput) => ipcRenderer.invoke(IPC_CHANNELS.rafflesCreate, input),
  updateRaffle: (input: RaffleUpdateInput) => ipcRenderer.invoke(IPC_CHANNELS.rafflesUpdate, input),
  deleteRaffle: (input: RaffleDeleteInput) => ipcRenderer.invoke(IPC_CHANNELS.rafflesDelete, input),
  getActiveRaffle: () => ipcRenderer.invoke(IPC_CHANNELS.rafflesGetActive) as Promise<Raffle | null>,
  getRaffleSnapshot: (raffleId: string) => ipcRenderer.invoke(IPC_CHANNELS.rafflesGetSnapshot, raffleId) as Promise<RaffleSnapshot>,
  controlRaffle: (input: RaffleControlActionInput) => ipcRenderer.invoke(IPC_CHANNELS.rafflesControl, input) as Promise<RaffleSnapshot>,
  getRaffleOverlayInfo: (raffleId: string) => ipcRenderer.invoke(IPC_CHANNELS.rafflesOverlayInfo, raffleId) as Promise<RaffleOverlayInfo>,
  onRaffleState: (listener: (payload: RaffleSnapshot | null) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: RaffleSnapshot | null) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.rafflesState, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.rafflesState, wrappedListener); };
  },
  onRaffleEntry: (listener: (payload: RaffleEntry) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: RaffleEntry) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.rafflesEntry, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.rafflesEntry, wrappedListener); };
  },
  onRaffleResult: (listener: (payload: RaffleRoundResult) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: RaffleRoundResult) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.rafflesResult, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.rafflesResult, wrappedListener); };
  },
  listRaffleSounds: () => ipcRenderer.invoke(IPC_CHANNELS.rafflesSoundsList) as Promise<Record<'spinning' | 'eliminated' | 'winner', string[]>>,
  previewRaffleSound: (event: 'spinning' | 'eliminated' | 'winner', filename: string) => ipcRenderer.invoke(IPC_CHANNELS.rafflesSoundsPreview, { event, filename }),
  listTextCommands: () => ipcRenderer.invoke(IPC_CHANNELS.textList) as Promise<TextCommand[]>,
  upsertTextCommand: (input: TextCommandUpsertInput) => ipcRenderer.invoke(IPC_CHANNELS.textUpsert, input),
  deleteTextCommand: (input: TextCommandDeleteInput) => ipcRenderer.invoke(IPC_CHANNELS.textDelete, input),
  listVoiceCommands: () => ipcRenderer.invoke(IPC_CHANNELS.voiceList),
  upsertVoiceCommand: (input: VoiceCommandUpsertInput) => ipcRenderer.invoke(IPC_CHANNELS.voiceUpsert, input),
  deleteVoiceCommand: (input: VoiceCommandDeleteInput) => ipcRenderer.invoke(IPC_CHANNELS.voiceDelete, input),
  previewSpeak: (input: VoiceSpeakPayload) => ipcRenderer.invoke(IPC_CHANNELS.voicePreviewSpeak, input),
  setRendererVoiceCapabilities: (input: RendererVoiceCapabilities) => ipcRenderer.invoke(IPC_CHANNELS.voiceSetRendererCapabilities, input),
  onVoiceSpeak: (listener: (payload: VoiceSpeakPayload) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: VoiceSpeakPayload) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.voiceSpeak, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.voiceSpeak, wrappedListener); };
  },
  listSoundCommands: () => ipcRenderer.invoke(IPC_CHANNELS.soundsList),
  upsertSoundCommand: (input: SoundCommandUpsertInput) => ipcRenderer.invoke(IPC_CHANNELS.soundsUpsert, input),
  deleteSoundCommand: (input: SoundCommandDeleteInput) => ipcRenderer.invoke(IPC_CHANNELS.soundsDelete, input),
  pickSoundFile: () => ipcRenderer.invoke(IPC_CHANNELS.soundsPickFile) as Promise<string | null>,
  readSoundFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.soundsReadFile, filePath) as Promise<string>,
  previewPlay: (input: SoundPlayPayload) => ipcRenderer.invoke(IPC_CHANNELS.soundsPreviewPlay, input),
  onSoundPlay: (listener: (payload: SoundPlayPayload) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: SoundPlayPayload) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.soundsPlay, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.soundsPlay, wrappedListener); };
  },
  getObsSettings: () => ipcRenderer.invoke(IPC_CHANNELS.obsGetSettings),
  saveObsSettings: (settings: ObsConnectionSettings) => ipcRenderer.invoke(IPC_CHANNELS.obsSaveSettings, settings),
  testObsConnection: (settings: ObsConnectionSettings) => ipcRenderer.invoke(IPC_CHANNELS.obsTestConnection, settings),
  onObsConnected: (listener: () => void) => {
    const wrappedListener = () => listener();
    ipcRenderer.on(IPC_CHANNELS.obsConnected, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.obsConnected, wrappedListener); };
  },
  onObsDisconnected: (listener: () => void) => {
    const wrappedListener = () => listener();
    ipcRenderer.on(IPC_CHANNELS.obsDisconnected, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.obsDisconnected, wrappedListener); };
  },
  onObsStats: (listener: (stats: ObsStatsSnapshot) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, stats: ObsStatsSnapshot) => listener(stats);
    ipcRenderer.on(IPC_CHANNELS.obsStats, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.obsStats, wrappedListener); };
  },
  getRecentChat: () => ipcRenderer.invoke(IPC_CHANNELS.chatGetRecent) as Promise<RecentChatSnapshot>,
  onChatMessage: (listener: (message: ChatMessage) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, message: ChatMessage) => listener(message);
    ipcRenderer.on(IPC_CHANNELS.chatMessage, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.chatMessage, wrappedListener); };
  },
  onChatEvent: (listener: (event: StreamEvent) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, event: StreamEvent) => listener(event);
    ipcRenderer.on(IPC_CHANNELS.chatEvent, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.chatEvent, wrappedListener); };
  },
  sendChatMessage: (input: { platform: import('../shared/types.js').PlatformId; content: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.chatSendMessage, input),
  listEventLogs: (filters?: EventLogFilters) => ipcRenderer.invoke(IPC_CHANNELS.logsList, filters) as Promise<EventLogEntry[]>,
  twitchGetCredentials: () => ipcRenderer.invoke(IPC_CHANNELS.twitchGetCredentials) as Promise<TwitchCredentials | null>,
  twitchConnect: (input: TwitchCredentials) => ipcRenderer.invoke(IPC_CHANNELS.twitchConnect, input),
  twitchDisconnect: () => ipcRenderer.invoke(IPC_CHANNELS.twitchDisconnect) as Promise<void>,
  twitchGetStatus: () => ipcRenderer.invoke(IPC_CHANNELS.twitchGetStatus) as Promise<TwitchConnectionStatus>,
  twitchGetUserAvatars: (logins: string[]) => ipcRenderer.invoke(IPC_CHANNELS.twitchGetUserAvatars, logins) as Promise<Record<string, string>>,
  twitchGetBadgeUrls: (badgeIds: string[]) => ipcRenderer.invoke(IPC_CHANNELS.twitchGetBadgeUrls, badgeIds) as Promise<Record<string, string>>,
  twitchStartOAuth: () => ipcRenderer.invoke(IPC_CHANNELS.twitchStartOAuth) as Promise<{ username: string; accessToken: string }>,
  youtubeConnect: (input) => ipcRenderer.invoke(IPC_CHANNELS.youtubeConnect, input),
  youtubeDisconnect: () => ipcRenderer.invoke(IPC_CHANNELS.youtubeDisconnect),
  youtubeGetStatus: () => ipcRenderer.invoke(IPC_CHANNELS.youtubeGetStatus) as Promise<YouTubeStreamInfo[]>,
  youtubeOpenLogin: () => ipcRenderer.invoke(IPC_CHANNELS.youtubeOpenLogin),
  youtubeGetSettings: () => ipcRenderer.invoke(IPC_CHANNELS.youtubeGetSettings),
  youtubeSaveSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.youtubeSaveSettings, settings),
  youtubeCheckLive: (handle) => ipcRenderer.invoke(IPC_CHANNELS.youtubeCheckLive, handle) as Promise<{ videoIds: string[] }>,
  tiktokConnect: (input: { username: string }) => ipcRenderer.invoke(IPC_CHANNELS.tiktokConnect, input),
  tiktokDisconnect: () => ipcRenderer.invoke(IPC_CHANNELS.tiktokDisconnect) as Promise<void>,
  tiktokGetStatus: () => ipcRenderer.invoke(IPC_CHANNELS.tiktokGetStatus) as Promise<TikTokConnectionStatus>,
  tiktokGetSettings: () => ipcRenderer.invoke(IPC_CHANNELS.tiktokGetSettings) as Promise<TikTokSettings>,
  tiktokSaveSettings: (settings: TikTokSettings) => ipcRenderer.invoke(IPC_CHANNELS.tiktokSaveSettings, settings),
  onTiktokStatus: (listener: (status: TikTokConnectionStatus, username: string | null) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, status: TikTokConnectionStatus, username: string | null) => listener(status, username);
    ipcRenderer.on(IPC_CHANNELS.tiktokStatus, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.tiktokStatus, wrappedListener); };
  },
  tiktokCheckLive: (username: string) => ipcRenderer.invoke(IPC_CHANNELS.tiktokCheckLive, username) as Promise<{ isLive: boolean }>,
  chatLogListSessions: (filters?) => ipcRenderer.invoke(IPC_CHANNELS.chatLogListSessions, filters) as Promise<ChatSession[]>,
  chatLogGetMessages: (sessionId, opts?) => ipcRenderer.invoke(IPC_CHANNELS.chatLogGetMessages, sessionId, opts) as Promise<ChatLogMessage[]>,
  chatLogExportSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.chatLogExportSession, sessionId),
  chatLogDeleteSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.chatLogDeleteSession, sessionId),
  onTwitchStatus: (listener: (status: TwitchConnectionStatus, channel: string | null) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, status: TwitchConnectionStatus, channel: string | null) => listener(status, channel);
    ipcRenderer.on(IPC_CHANNELS.twitchStatus, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.twitchStatus, wrappedListener); };
  },
  onTwitchLiveStats: (listener: (stats: TwitchLiveStats) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, stats: TwitchLiveStats) => listener(stats);
    ipcRenderer.on(IPC_CHANNELS.twitchLiveStats, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.twitchLiveStats, wrappedListener); };
  },
  onYoutubeStatus: (listener: (streams: YouTubeStreamInfo[]) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, streams: YouTubeStreamInfo[]) => listener(streams);
    ipcRenderer.on(IPC_CHANNELS.youtubeGetStatus, wrappedListener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.youtubeGetStatus, wrappedListener); };
  },
};

contextBridge.exposeInMainWorld('copilot', copilotApi);
