import type {
  AppInfo,
  ChatMessage,
  TwitchLiveStats,
  CloneProfileInput,
  CreateProfileInput,
  DeleteProfileInput,
  EventLogEntry,
  EventLogFilters,
  GeneralSettings,
  ObsConnectionSettings,
  ObsStatsSnapshot,
  PlatformId,
  ProfilesSnapshot,
  RenameProfileInput,
  RendererVoiceCapabilities,
  SoundCommand,
  SoundCommandDeleteInput,
  SoundCommandUpsertInput,
  SoundPlayPayload,
  StreamEvent,
  ScheduledMessage,
  ScheduledMessageDeleteInput,
  ScheduledMessageUpsertInput,
  ScheduledStatusItem,
  SelectProfileInput,
  TwitchConnectionStatus,
  TwitchCredentials,
  VoiceCommand,
  VoiceCommandDeleteInput,
  VoiceCommandUpsertInput,
  VoiceSpeakPayload,
} from './types.js';

export const IPC_CHANNELS = {
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
  soundsReadFile: 'sounds:read-file',
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
} as const;

export interface RecentChatSnapshot {
  messages: ChatMessage[];
  events: StreamEvent[];
}

export interface CopilotApi {
  getAppInfo: () => Promise<AppInfo>;
  listProfiles: () => Promise<ProfilesSnapshot>;
  selectProfile: (input: SelectProfileInput) => Promise<ProfilesSnapshot>;
  createProfile: (input: CreateProfileInput) => Promise<ProfilesSnapshot>;
  renameProfile: (input: RenameProfileInput) => Promise<ProfilesSnapshot>;
  cloneProfile: (input: CloneProfileInput) => Promise<ProfilesSnapshot>;
  deleteProfile: (input: DeleteProfileInput) => Promise<ProfilesSnapshot>;
  pickProfileDirectory: () => Promise<string | null>;
  getGeneralSettings: () => Promise<GeneralSettings>;
  saveGeneralSettings: (input: GeneralSettings) => Promise<GeneralSettings>;
  listScheduledMessages: () => Promise<ScheduledMessage[]>;
  upsertScheduledMessage: (input: ScheduledMessageUpsertInput) => Promise<ScheduledMessage[]>;
  deleteScheduledMessage: (input: ScheduledMessageDeleteInput) => Promise<ScheduledMessage[]>;
  onScheduledStatus: (listener: (items: ScheduledStatusItem[]) => void) => () => void;
  listVoiceCommands: () => Promise<VoiceCommand[]>;
  upsertVoiceCommand: (input: VoiceCommandUpsertInput) => Promise<VoiceCommand[]>;
  deleteVoiceCommand: (input: VoiceCommandDeleteInput) => Promise<VoiceCommand[]>;
  previewSpeak: (input: VoiceSpeakPayload) => Promise<void>;
  setRendererVoiceCapabilities: (input: RendererVoiceCapabilities) => Promise<void>;
  onVoiceSpeak: (listener: (payload: VoiceSpeakPayload) => void) => () => void;
  listSoundCommands: () => Promise<SoundCommand[]>;
  upsertSoundCommand: (input: SoundCommandUpsertInput) => Promise<SoundCommand[]>;
  deleteSoundCommand: (input: SoundCommandDeleteInput) => Promise<SoundCommand[]>;
  pickSoundFile: () => Promise<string | null>;
  readSoundFile: (filePath: string) => Promise<string>;
  previewPlay: (input: SoundPlayPayload) => Promise<void>;
  onSoundPlay: (listener: (payload: SoundPlayPayload) => void) => () => void;
  getObsSettings: () => Promise<ObsConnectionSettings>;
  saveObsSettings: (input: ObsConnectionSettings) => Promise<ObsConnectionSettings>;
  testObsConnection: (input: ObsConnectionSettings) => Promise<void>;
  onObsStats: (listener: (payload: ObsStatsSnapshot) => void) => () => void;
  onObsConnected: (listener: () => void) => () => void;
  onObsDisconnected: (listener: () => void) => () => void;
  getRecentChat: () => Promise<RecentChatSnapshot>;
  sendChatMessage: (input: { platform: PlatformId; content: string }) => Promise<void>;
  onChatMessage: (listener: (payload: ChatMessage) => void) => () => void;
  onChatEvent: (listener: (payload: StreamEvent) => void) => () => void;
  listEventLogs: (filters?: EventLogFilters) => Promise<EventLogEntry[]>;
  twitchGetCredentials: () => Promise<TwitchCredentials | null>;
  twitchConnect: (input: TwitchCredentials) => Promise<void>;
  twitchDisconnect: () => Promise<void>;
  twitchGetStatus: () => Promise<TwitchConnectionStatus>;
  onTwitchStatus: (listener: (status: TwitchConnectionStatus) => void) => () => void;
  onTwitchLiveStats: (listener: (stats: TwitchLiveStats) => void) => () => void;
  onYoutubeStatus: (listener: (connected: boolean) => void) => () => void;
  twitchGetUserAvatars: (logins: string[]) => Promise<Record<string, string>>;
  twitchGetBadgeUrls: (badgeIds: string[]) => Promise<Record<string, string>>;
  twitchStartOAuth: () => Promise<{ username: string; accessToken: string }>;
  youtubeConnect: (input: { videoId: string }) => Promise<void>;
  youtubeDisconnect: () => Promise<void>;
  youtubeGetStatus: () => Promise<boolean>;
  youtubeOpenLogin: () => Promise<void>;
  youtubeGetSettings: () => Promise<import('./types.js').YouTubeSettings>;
  youtubeSaveSettings: (settings: import('./types.js').YouTubeSettings) => Promise<void>;
  youtubeCheckLive: (handle: string) => Promise<{ videoIds: string[] }>;
}
