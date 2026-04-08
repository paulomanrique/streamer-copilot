import type {
  AppInfo,
  ChatMessage,
  CloneProfileInput,
  CreateProfileInput,
  DeleteProfileInput,
  EventLogEntry,
  EventLogFilters,
  GeneralSettings,
  ObsConnectionSettings,
  ObsStatsSnapshot,
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
  previewVoiceSpeak: (input: VoiceSpeakPayload) => Promise<void>;
  setRendererVoiceCapabilities: (input: RendererVoiceCapabilities) => Promise<void>;
  onVoiceSpeak: (listener: (payload: VoiceSpeakPayload) => void) => () => void;
  listSoundCommands: () => Promise<SoundCommand[]>;
  upsertSoundCommand: (input: SoundCommandUpsertInput) => Promise<SoundCommand[]>;
  deleteSoundCommand: (input: SoundCommandDeleteInput) => Promise<SoundCommand[]>;
  pickSoundFile: () => Promise<string | null>;
  previewSoundPlay: (input: SoundPlayPayload) => Promise<void>;
  onSoundPlay: (listener: (payload: SoundPlayPayload) => void) => () => void;
  getObsSettings: () => Promise<ObsConnectionSettings>;
  saveObsSettings: (input: ObsConnectionSettings) => Promise<ObsConnectionSettings>;
  testObsConnection: (input: ObsConnectionSettings) => Promise<void>;
  onObsStats: (listener: (payload: ObsStatsSnapshot) => void) => () => void;
  onObsConnected: (listener: () => void) => () => void;
  onObsDisconnected: (listener: () => void) => () => void;
  getRecentChat: () => Promise<RecentChatSnapshot>;
  onChatMessage: (listener: (payload: ChatMessage) => void) => () => void;
  onChatEvent: (listener: (payload: StreamEvent) => void) => () => void;
  listEventLogs: (filters?: EventLogFilters) => Promise<EventLogEntry[]>;
}
