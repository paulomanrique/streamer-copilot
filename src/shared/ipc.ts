import type {
  AppInfo,
  ChatOverlayInfo,
  ChatMessage,
  KickAuthStatus,
  KickLiveStats,
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
  ProfileSettings,
  ProfilesSnapshot,
  Raffle,
  RaffleControlActionInput,
  RaffleDeleteInput,
  RaffleEntry,
  RaffleOverlayInfo,
  RaffleRoundResult,
  RaffleSnapshot,
  RaffleCreateInput,
  RaffleUpdateInput,
  RenameProfileInput,
  RendererVoiceCapabilities,
  SoundCommand,
  SoundCommandDeleteInput,
  SoundCommandUpsertInput,
  SoundPlayPayload,
  SoundSettings,
  TextSettings,
  SuggestionEntry,
  SuggestionList,
  SuggestionListDeleteInput,
  SuggestionListUpsertInput,
  SuggestionSnapshot,
  TextCommand,
  TextCommandDeleteInput,
  TextCommandUpsertInput,
  StreamEvent,
  ScheduledMessage,
  ScheduledMessageDeleteInput,
  ScheduledMessageUpsertInput,
  ScheduledAvailableTargets,
  ScheduledStatusItem,
  SelectProfileInput,
  TwitchConnectionStatus,
  TwitchCredentials,
  KickConnectionStatus,
  KickSettings,
  VoiceCommand,
  VoiceCommandDeleteInput,
  VoiceCommandUpsertInput,
  VoiceSpeakPayload,
  MusicRequestSettings,
  MusicPlayerState,
  MusicPlayCommand,
  MusicPlayerEvent,
  WelcomeSettings,
} from './types.js';
import type { ChatSession, ChatLogMessage } from '../modules/chat-log/chat-log-service.js';
export type { ChatSession, ChatLogMessage };

export const IPC_CHANNELS = {
  appGetInfo: 'app:get-info',
  appOpenExternalUrl: 'app:open-external-url',
  profilesList: 'profiles:list',
  profilesSelect: 'profiles:select',
  profilesCreate: 'profiles:create',
  profilesRename: 'profiles:rename',
  profilesClone: 'profiles:clone',
  profilesDelete: 'profiles:delete',
  profilesPickDirectory: 'profiles:pick-directory',
  profilesGetSettings: 'profiles:get-settings',
  profilesSaveSettings: 'profiles:save-settings',
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
  textGetSettings: 'text:get-settings',
  textSaveSettings: 'text:save-settings',
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
  soundsGetSettings: 'sounds:get-settings',
  soundsSaveSettings: 'sounds:save-settings',
  obsGetSettings: 'obs:get-settings',
  obsSaveSettings: 'obs:save-settings',
  obsTestConnection: 'obs:test-connection',
  obsStats: 'obs:stats',
  obsConnected: 'obs:connected',
  obsDisconnected: 'obs:disconnected',
  chatGetRecent: 'chat:get-recent',
  chatOverlayInfo: 'chat:overlay-info',
  chatMessage: 'chat:message',
  chatMessagesBatch: 'chat:messages-batch',
  chatEvent: 'chat:event',
  chatEventsBatch: 'chat:events-batch',
  chatSendMessage: 'chat:send-message',
  logsList: 'logs:list',
  twitchLiveStats: 'twitch:live-stats',
  kickLiveStats: 'kick:live-stats',
  twitchGetUserAvatars: 'twitch:get-user-avatars',
  twitchGetBadgeUrls: 'twitch:get-badge-urls',
  twitchGetCredentials: 'twitch:get-credentials',
  twitchConnect: 'twitch:connect',
  twitchDisconnect: 'twitch:disconnect',
  twitchGetStatus: 'twitch:get-status',
  twitchStatus: 'twitch:status',
  twitchStartOAuth: 'twitch:start-oauth',
  kickStartOAuth: 'kick:start-oauth',
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
  kickConnect: 'kick:connect',
  kickDisconnect: 'kick:disconnect',
  kickGetStatus: 'kick:get-status',
  kickGetAuthStatus: 'kick:get-auth-status',
  kickGetSettings: 'kick:get-settings',
  kickSaveSettings: 'kick:save-settings',
  kickStatus: 'kick:status',
  chatLogListSessions: 'chatLog:list-sessions',
  chatLogGetMessages: 'chatLog:get-messages',
  chatLogExportSession: 'chatLog:export-session',
  chatLogDeleteSession: 'chatLog:delete-session',
  suggestionsList: 'suggestions:list',
  suggestionsUpsert: 'suggestions:upsert',
  suggestionsDelete: 'suggestions:delete',
  suggestionsEntries: 'suggestions:entries',
  suggestionsClearEntries: 'suggestions:clear-entries',
  suggestionsState: 'suggestions:state',
  voiceGoogleTtsAudio: 'voice:google-tts-audio',
  welcomeGetSettings: 'welcome:get-settings',
  welcomeSaveSettings: 'welcome:save-settings',
  welcomePickSoundFile: 'welcome:pick-sound-file',
  musicGetSettings: 'music:get-settings',
  musicSaveSettings: 'music:save-settings',
  musicGetState: 'music:get-state',
  musicSkip: 'music:skip',
  musicClearQueue: 'music:clear-queue',
  musicPlayerEvent: 'music:player-event',
  musicStateUpdate: 'music:state-update',
  musicPlay: 'music:play',
  musicStop: 'music:stop',
  musicVolume: 'music:volume',
} as const;

export interface RecentChatSnapshot {
  messages: ChatMessage[];
  events: StreamEvent[];
}

export interface CopilotApi {
  getAppInfo: () => Promise<AppInfo>;
  openExternalUrl: (url: string) => Promise<void>;
  listProfiles: () => Promise<ProfilesSnapshot>;
  selectProfile: (input: SelectProfileInput) => Promise<ProfilesSnapshot>;
  createProfile: (input: CreateProfileInput) => Promise<ProfilesSnapshot>;
  renameProfile: (input: RenameProfileInput) => Promise<ProfilesSnapshot>;
  cloneProfile: (input: CloneProfileInput) => Promise<ProfilesSnapshot>;
  deleteProfile: (input: DeleteProfileInput) => Promise<ProfilesSnapshot>;
  pickProfileDirectory: () => Promise<string | null>;
  getProfileSettings: () => Promise<ProfileSettings>;
  saveProfileSettings: (settings: ProfileSettings) => Promise<ProfileSettings>;
  getGeneralSettings: () => Promise<GeneralSettings>;
  saveGeneralSettings: (input: GeneralSettings) => Promise<GeneralSettings>;
  listScheduledMessages: () => Promise<ScheduledMessage[]>;
  upsertScheduledMessage: (input: ScheduledMessageUpsertInput) => Promise<ScheduledMessage[]>;
  deleteScheduledMessage: (input: ScheduledMessageDeleteInput) => Promise<ScheduledMessage[]>;
  getScheduledAvailableTargets: () => Promise<ScheduledAvailableTargets>;
  onScheduledStatus: (listener: (items: ScheduledStatusItem[]) => void) => () => void;
  listRaffles: () => Promise<Raffle[]>;
  createRaffle: (input: RaffleCreateInput) => Promise<Raffle[]>;
  updateRaffle: (input: RaffleUpdateInput) => Promise<Raffle[]>;
  deleteRaffle: (input: RaffleDeleteInput) => Promise<Raffle[]>;
  getActiveRaffle: () => Promise<Raffle | null>;
  getRaffleSnapshot: (raffleId: string) => Promise<RaffleSnapshot>;
  controlRaffle: (input: RaffleControlActionInput) => Promise<RaffleSnapshot>;
  getRaffleOverlayInfo: (raffleId: string) => Promise<RaffleOverlayInfo>;
  onRaffleState: (listener: (payload: RaffleSnapshot | null) => void) => () => void;
  onRaffleEntry: (listener: (payload: RaffleEntry) => void) => () => void;
  onRaffleResult: (listener: (payload: RaffleRoundResult) => void) => () => void;
  listRaffleSounds: () => Promise<Record<'spinning' | 'eliminated' | 'winner', string[]>>;
  previewRaffleSound: (event: 'spinning' | 'eliminated' | 'winner', filename: string) => Promise<void>;
  listTextCommands: () => Promise<TextCommand[]>;
  upsertTextCommand: (input: TextCommandUpsertInput) => Promise<TextCommand[]>;
  deleteTextCommand: (input: TextCommandDeleteInput) => Promise<TextCommand[]>;
  getTextSettings: () => Promise<TextSettings>;
  saveTextSettings: (input: TextSettings) => Promise<TextSettings>;
  listVoiceCommands: () => Promise<VoiceCommand[]>;
  upsertVoiceCommand: (input: VoiceCommandUpsertInput) => Promise<VoiceCommand[]>;
  deleteVoiceCommand: (input: VoiceCommandDeleteInput) => Promise<VoiceCommand[]>;
  previewSpeak: (input: VoiceSpeakPayload) => Promise<void>;
  setRendererVoiceCapabilities: (input: RendererVoiceCapabilities) => Promise<void>;
  onVoiceSpeak: (listener: (payload: VoiceSpeakPayload) => void) => () => void;
  onGoogleTtsAudio: (listener: (payload: { base64: string }) => void) => () => void;
  listSoundCommands: () => Promise<SoundCommand[]>;
  upsertSoundCommand: (input: SoundCommandUpsertInput) => Promise<SoundCommand[]>;
  deleteSoundCommand: (input: SoundCommandDeleteInput) => Promise<SoundCommand[]>;
  pickSoundFile: () => Promise<string | null>;
  readSoundFile: (filePath: string) => Promise<string>;
  previewPlay: (input: SoundPlayPayload) => Promise<void>;
  onSoundPlay: (listener: (payload: SoundPlayPayload) => void) => () => void;
  getSoundSettings: () => Promise<SoundSettings>;
  saveSoundSettings: (input: SoundSettings) => Promise<SoundSettings>;
  getObsSettings: () => Promise<ObsConnectionSettings>;
  saveObsSettings: (input: ObsConnectionSettings) => Promise<ObsConnectionSettings>;
  testObsConnection: (input: ObsConnectionSettings) => Promise<void>;
  onObsStats: (listener: (payload: ObsStatsSnapshot) => void) => () => void;
  onObsConnected: (listener: () => void) => () => void;
  onObsDisconnected: (listener: () => void) => () => void;
  getRecentChat: () => Promise<RecentChatSnapshot>;
  getChatOverlayInfo: () => Promise<ChatOverlayInfo>;
  sendChatMessage: (input: { platform: PlatformId; content: string }) => Promise<void>;
  onChatMessage: (listener: (payload: ChatMessage) => void) => () => void;
  onChatMessagesBatch: (listener: (payload: ChatMessage[]) => void) => () => void;
  onChatEvent: (listener: (payload: StreamEvent) => void) => () => void;
  onChatEventsBatch: (listener: (payload: StreamEvent[]) => void) => () => void;
  listEventLogs: (filters?: EventLogFilters) => Promise<EventLogEntry[]>;
  twitchGetCredentials: () => Promise<TwitchCredentials | null>;
  twitchConnect: (input: TwitchCredentials) => Promise<void>;
  twitchDisconnect: () => Promise<void>;
  twitchGetStatus: () => Promise<TwitchConnectionStatus>;
  onTwitchStatus: (listener: (status: TwitchConnectionStatus, channel: string | null) => void) => () => void;
  onTwitchLiveStats: (listener: (stats: TwitchLiveStats) => void) => () => void;
  onKickLiveStats: (listener: (stats: KickLiveStats | null) => void) => () => void;
  onYoutubeStatus: (listener: (streams: import('./types.js').YouTubeStreamInfo[]) => void) => () => void;
  twitchGetUserAvatars: (logins: string[]) => Promise<Record<string, string>>;
  twitchGetBadgeUrls: (badgeIds: string[]) => Promise<Record<string, string>>;
  twitchStartOAuth: () => Promise<{ username: string; accessToken: string }>;
  kickStartOAuth: () => Promise<{ channelSlug: string }>;
  youtubeConnect: (input: { videoId: string }) => Promise<void>;
  youtubeDisconnect: () => Promise<void>;
  youtubeGetStatus: () => Promise<import('./types.js').YouTubeStreamInfo[]>;
  youtubeOpenLogin: () => Promise<void>;
  youtubeGetSettings: () => Promise<import('./types.js').YouTubeSettings>;
  youtubeSaveSettings: (settings: import('./types.js').YouTubeSettings) => Promise<import('./types.js').YouTubeSettings>;
  youtubeCheckLive: (handle: string) => Promise<{ videoIds: string[] }>;
  tiktokConnect: (input: { username: string }) => Promise<void>;
  tiktokDisconnect: () => Promise<void>;
  tiktokGetStatus: () => Promise<import('./types.js').TikTokConnectionStatus>;
  tiktokGetSettings: () => Promise<import('./types.js').TikTokSettings>;
  tiktokSaveSettings: (settings: import('./types.js').TikTokSettings) => Promise<void>;
  onTiktokStatus: (listener: (status: import('./types.js').TikTokConnectionStatus, username: string | null) => void) => () => void;
  tiktokCheckLive: (username: string) => Promise<{ isLive: boolean }>;
  kickConnect: (input: { channelInput: string; clientId: string; clientSecret: string }) => Promise<void>;
  kickDisconnect: () => Promise<void>;
  kickGetStatus: () => Promise<KickConnectionStatus>;
  kickGetAuthStatus: () => Promise<KickAuthStatus>;
  kickGetSettings: () => Promise<KickSettings>;
  kickSaveSettings: (settings: KickSettings) => Promise<void>;
  onKickStatus: (listener: (status: KickConnectionStatus, slug: string | null) => void) => () => void;
  chatLogListSessions: (filters?: { platform?: string }) => Promise<ChatSession[]>;
  chatLogGetMessages: (sessionId: string, opts?: { limit?: number; offset?: number }) => Promise<ChatLogMessage[]>;
  chatLogExportSession: (sessionId: string) => Promise<void>;
  chatLogDeleteSession: (sessionId: string) => Promise<void>;
  listSuggestionLists: () => Promise<SuggestionList[]>;
  upsertSuggestionList: (input: SuggestionListUpsertInput) => Promise<SuggestionList[]>;
  deleteSuggestionList: (input: SuggestionListDeleteInput) => Promise<SuggestionList[]>;
  getSuggestionEntries: (listId: string) => Promise<SuggestionEntry[]>;
  clearSuggestionEntries: (listId: string) => Promise<SuggestionEntry[]>;
  onSuggestionState: (listener: (payload: SuggestionSnapshot) => void) => () => void;
  getWelcomeSettings: () => Promise<WelcomeSettings>;
  saveWelcomeSettings: (input: WelcomeSettings) => Promise<WelcomeSettings>;
  pickWelcomeSoundFile: () => Promise<string | null>;
  getMusicSettings: () => Promise<MusicRequestSettings>;
  saveMusicSettings: (input: MusicRequestSettings) => Promise<MusicRequestSettings>;
  getMusicState: () => Promise<MusicPlayerState>;
  musicSkip: () => Promise<void>;
  musicClearQueue: () => Promise<void>;
  musicPlayerEvent: (event: MusicPlayerEvent) => Promise<void>;
  onMusicStateUpdate: (listener: (state: MusicPlayerState) => void) => () => void;
  onMusicPlay: (listener: (cmd: MusicPlayCommand) => void) => () => void;
  onMusicStop: (listener: () => void) => () => void;
  onMusicVolume: (listener: (volume: number) => void) => () => void;
}
