export interface AppInfo {
  appName: string;
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
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

export type PlatformId = 'twitch' | 'youtube' | 'kick' | 'tiktok';

export type ChatBadge = 'moderator' | 'subscriber' | 'member';

export interface ChatMessage {
  id: string;
  platform: PlatformId;
  author: string;
  content: string;
  badges: ChatBadge[];
  timestampLabel: string;
}

export type StreamEventType = 'subscription' | 'superchat' | 'raid' | 'cheer';

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
