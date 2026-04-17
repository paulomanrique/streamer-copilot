export interface AppInfo {
  appName: string;
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
}

export interface GeneralSettings {
  startOnLogin: boolean;
  minimizeToTray: boolean;
  eventNotifications: boolean;
}

export type PermissionLevel = 'everyone' | 'follower' | 'subscriber' | 'moderator' | 'broadcaster';

export interface CommandPermission {
  allowedLevels: PermissionLevel[];
  cooldownSeconds: number;
  userCooldownSeconds: number;
}

export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
}

export type PlatformId = 'twitch' | 'youtube' | 'youtube-v' | 'kick' | 'tiktok';

export type ChatBadge = 'moderator' | 'subscriber' | 'member' | 'vip' | 'broadcaster' | (string & {});
export interface ChatMessage {
  id: string;
  platform: PlatformId;
  author: string;
  content: string;
  badges: ChatBadge[];
  timestampLabel: string;
  color?: string;
  avatarUrl?: string;
  badgeUrls?: string[];
  streamLabel?: string;
}

export interface TwitchLiveStats {
  viewerCount: number;
  followerCount: number;
  isLive: boolean;
  hypeTrain?: {
    level: number;
    progress: number;
    goal: number;
    expiry: string; // ISO timestamp
  } | null;
}

export type StreamEventType = 'subscription' | 'superchat' | 'raid' | 'cheer' | 'follow' | 'gift';

export interface StreamEvent {
  id: string;
  platform: PlatformId;
  type: StreamEventType;
  author: string;
  amount?: number;
  message?: string;
  timestampLabel: string;
  streamLabel?: string;
}

export interface YouTubeStreamInfo {
  videoId: string;
  platform: 'youtube' | 'youtube-v';
  channelHandle: string | null;
  label: string;
  viewerCount: number | null;
  liveUrl: string;
}

export interface PlatformConnectionStatus {
  platform: PlatformId;
  label: string;
  connected: boolean;
}

export interface ObsStatusSnapshot {
  connected: boolean;
  sceneName: string;
  uptimeLabel: string;
}

export interface ObsStatsSnapshot extends ObsStatusSnapshot {
  bitrateKbps: number;
  fps: number;
  cpuPercent: number;
  ramMb: number;
  droppedFrames: number;
  droppedFramesRender: number;
}

export interface ObsConnectionSettings {
  host: string;
  port: number;
  password: string;
}

export type EventLogLevel = 'info' | 'warn' | 'error';

export interface EventLogEntry {
  id: number;
  level: EventLogLevel;
  category: string;
  message: string;
  metadataJson: string | null;
  createdAt: string;
}

export interface EventLogFilters {
  level?: EventLogLevel | 'all';
  category?: string;
  query?: string;
}

export interface ScheduledMessage {
  id: string;
  message: string;
  intervalSeconds: number;
  randomWindowSeconds: number;
  targetPlatforms: PlatformId[];
  enabled: boolean;
  lastSentAt: string | null;
}

export interface ScheduledMessageUpsertInput {
  id?: string;
  message: string;
  intervalSeconds: number;
  randomWindowSeconds: number;
  targetPlatforms: PlatformId[];
  enabled: boolean;
}

export interface ScheduledMessageDeleteInput {
  id: string;
}

export interface ScheduledStatusItem {
  id: string;
  nextFireAt: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastResult: 'sent' | 'skipped' | 'failed' | null;
  lastResultDetail: string | null;
  effectiveTargets: PlatformId[];
}

export interface ScheduledAvailableTargets {
  supported: PlatformId[];
  connected: PlatformId[];
}

export interface CommandSchedule {
  intervalSeconds: number;
  randomWindowSeconds: number;
  targetPlatforms: PlatformId[];
  enabled: boolean;
  lastSentAt: string | null;
}

export interface CommandScheduleUpsertInput {
  intervalSeconds: number;
  randomWindowSeconds: number;
  targetPlatforms: PlatformId[];
  enabled: boolean;
}

export interface VoiceCommand {
  id: string;
  trigger: string;
  template: string | null;
  language: string;
  permissions: PermissionLevel[];
  cooldownSeconds: number;
  enabled: boolean;
}

export interface VoiceCommandUpsertInput {
  id?: string;
  trigger: string;
  template: string | null;
  language: string;
  permissions: PermissionLevel[];
  cooldownSeconds: number;
  enabled: boolean;
}

export interface VoiceCommandDeleteInput {
  id: string;
}

export interface VoiceSpeakPayload {
  text: string;
  lang: string;
}

export interface TextCommand {
  id: string;
  trigger: string | null;
  response: string;
  permissions: PermissionLevel[];
  cooldownSeconds: number;
  commandEnabled: boolean;
  schedule: CommandSchedule | null;
  enabled: boolean;
}

export interface TextCommandUpsertInput {
  id?: string;
  trigger: string | null;
  response: string;
  permissions: PermissionLevel[];
  cooldownSeconds: number;
  commandEnabled: boolean;
  schedule: CommandScheduleUpsertInput | null;
  enabled: boolean;
}

export interface TextCommandDeleteInput {
  id: string;
}

export interface TextCommandResponsePayload {
  platform: PlatformId;
  content: string;
}

export interface RendererVoiceCapabilities {
  speechSynthesisAvailable: boolean;
}

export interface SoundCommand {
  id: string;
  trigger: string | null;
  filePath: string;
  permissions: PermissionLevel[];
  cooldownSeconds: number;
  commandEnabled: boolean;
  schedule: CommandSchedule | null;
  enabled: boolean;
}

export interface SoundCommandUpsertInput {
  id?: string;
  trigger: string | null;
  filePath: string;
  permissions: PermissionLevel[];
  cooldownSeconds: number;
  commandEnabled: boolean;
  schedule: CommandScheduleUpsertInput | null;
  enabled: boolean;
}

export interface SoundCommandDeleteInput {
  id: string;
}

export interface SoundPlayPayload {
  filePath: string;
}

export type RaffleMode = 'single-winner' | 'survivor-final';
export type RaffleStatus = 'draft' | 'collecting' | 'ready_to_spin' | 'spinning' | 'paused_top2' | 'completed' | 'cancelled';
export type RaffleControlAction = 'open_entries' | 'close_entries' | 'spin' | 'finalize' | 'cancel' | 'reset';
export type RaffleRoundActionType = 'spin' | 'finalize';
export type RaffleRoundResultType = 'winner' | 'eliminated';

export interface Raffle {
  id: string;
  title: string;
  entryCommand: string;
  mode: RaffleMode;
  status: RaffleStatus;
  entryDeadlineAt: string | null;
  acceptedPlatforms: PlatformId[];
  staffTriggerCommand: string;
  openAnnouncementTemplate: string;
  eliminationAnnouncementTemplate: string;
  winnerAnnouncementTemplate: string;
  spinSoundFile: string | null;
  eliminatedSoundFile: string | null;
  winnerSoundFile: string | null;
  winnerEntryId: string | null;
  top2EntryIds: string[];
  entriesCount: number;
  activeEntriesCount: number;
  lastSpinAt: string | null;
  currentRound: number;
  overlaySessionId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RaffleEntry {
  id: string;
  raffleId: string;
  platform: PlatformId;
  userKey: string;
  displayName: string;
  sourceMessageId: string | null;
  enteredAt: string;
  isEliminated: boolean;
  eliminationOrder: number | null;
  isWinner: boolean;
}

export interface RaffleAnimationConfig {
  targetEntryId: string | null;
  targetRotationDeg: number;
  durationMs: number;
  startedAt: string | null;
}

export interface RaffleOverlayState {
  raffleId: string;
  title: string;
  mode: RaffleMode;
  status: RaffleStatus;
  sessionId: string | null;
  totalEntries: number;
  activeEntries: Array<{
    id: string;
    label: string;
  }>;
  highlightedEntryId: string | null;
  highlightedEntryLabel: string | null;
  top2EntryIds: string[];
  top2Labels: string[];
  round: number;
  animation: RaffleAnimationConfig;
  updatedAt: string;
}

export interface RaffleRoundResult {
  id: string;
  raffleId: string;
  roundNumber: number;
  actionType: RaffleRoundActionType;
  selectedEntryId: string;
  selectedEntryName: string;
  resultType: RaffleRoundResultType;
  participantCountBefore: number;
  participantCountAfter: number;
  animationSeedJson: string | null;
  createdAt: string;
}

export interface RaffleCreateInput {
  title: string;
  entryCommand: string;
  mode: RaffleMode;
  entryDeadlineAt: string | null;
  acceptedPlatforms: PlatformId[];
  staffTriggerCommand: string;
  openAnnouncementTemplate: string;
  eliminationAnnouncementTemplate: string;
  winnerAnnouncementTemplate: string;
  spinSoundFile: string | null;
  eliminatedSoundFile: string | null;
  winnerSoundFile: string | null;
  enabled: boolean;
}

export interface RaffleUpdateInput extends RaffleCreateInput {
  id: string;
}

export interface RaffleDeleteInput {
  id: string;
}

export interface RaffleControlActionInput {
  raffleId: string;
  action: RaffleControlAction;
}

export interface RaffleOverlayInfo {
  raffleId: string;
  overlayUrl: string;
  stateUrl: string;
}

export interface RaffleSnapshot {
  raffle: Raffle;
  entries: RaffleEntry[];
  activeEntries: RaffleEntry[];
  overlay: RaffleOverlayState | null;
  history: RaffleRoundResult[];
}

export type TwitchConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TwitchCredentials {
  channel: string;
  username: string;
  oauthToken: string;
}

export interface YouTubeChannelConfig {
  id: string; // Internal ID
  handle: string; // @handle or channel ID
  name?: string;
  enabled: boolean;
}

export interface YouTubeSettings {
  channels: YouTubeChannelConfig[];
  autoConnect: boolean;
}

export type TikTokConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TikTokSettings {
  username: string;
  signApiKey: string;
  autoConnect: boolean;
}

export interface ProfileSummary {
  id: string;
  name: string;
  directory: string;
  lastUsedAt: string;
}

export interface ProfilesSnapshot {
  activeProfileId: string;
  profiles: ProfileSummary[];
}

export interface SelectProfileInput {
  profileId: string;
}

export interface CreateProfileInput {
  name: string;
  directory: string;
}

export interface RenameProfileInput {
  profileId: string;
  name: string;
}

export interface CloneProfileInput {
  profileId: string;
  name: string;
  directory: string;
}

export interface DeleteProfileInput {
  profileId: string;
}

// --- Suggestions ---

export type SuggestionListMode = 'global' | 'session';

export interface SuggestionList {
  id: string;
  title: string;
  trigger: string;
  feedbackTemplate: string;
  mode: SuggestionListMode;
  allowDuplicates: boolean;
  permissions: PermissionLevel[];
  cooldownSeconds: number;
  userCooldownSeconds: number;
  enabled: boolean;
  entryCount: number;
}

export interface SuggestionEntry {
  id: string;
  listId: string;
  platform: PlatformId;
  userKey: string;
  displayName: string;
  content: string;
  createdAt: string;
}

export interface SuggestionListUpsertInput {
  id?: string;
  title: string;
  trigger: string;
  feedbackTemplate: string;
  mode: SuggestionListMode;
  allowDuplicates: boolean;
  permissions: PermissionLevel[];
  cooldownSeconds: number;
  userCooldownSeconds: number;
  enabled: boolean;
}

export interface SuggestionListDeleteInput {
  id: string;
}

export interface SuggestionSnapshot {
  list: SuggestionList;
  entries: SuggestionEntry[];
}
