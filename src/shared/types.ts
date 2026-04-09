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

export interface RendererVoiceCapabilities {
  speechSynthesisAvailable: boolean;
}

export interface SoundCommand {
  id: string;
  trigger: string;
  filePath: string;
  permissions: PermissionLevel[];
  cooldownSeconds: number;
  enabled: boolean;
}

export interface SoundCommandUpsertInput {
  id?: string;
  trigger: string;
  filePath: string;
  permissions: PermissionLevel[];
  cooldownSeconds: number;
  enabled: boolean;
}

export interface SoundCommandDeleteInput {
  id: string;
}

export interface SoundPlayPayload {
  filePath: string;
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
