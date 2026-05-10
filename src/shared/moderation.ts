/**
 * Capabilities-based moderation contract. Each adapter declares which
 * moderation actions its platform supports; the UI only renders what exists.
 */
export interface PlatformCapabilities {
  // Common
  canDeleteMessage: boolean;
  canBanUser: boolean;
  canTimeoutUser: boolean;
  canSetSlowMode: boolean;

  // Platform-specific
  canSetSubscribersOnly: boolean;
  canSetMembersOnly: boolean;
  canSetFollowersOnly: boolean;
  canSetEmoteOnly: boolean;
  canSetUniqueChat: boolean;
  canClearChat: boolean;
  canManageMods: boolean;
  canManageVips: boolean;
  canRaid: boolean;
  canShoutout: boolean;
}

export interface ModerationApi {
  deleteMessage(messageId: string): Promise<void>;
  banUser(userId: string, reason?: string): Promise<void>;
  unbanUser(userId: string): Promise<void>;
  timeoutUser(userId: string, durationSeconds: number, reason?: string): Promise<void>;

  // Optional — present only when the matching capability is true.
  setSlowMode?(enabled: boolean, seconds?: number): Promise<void>;
  setSubscribersOnly?(enabled: boolean): Promise<void>;
  setMembersOnly?(enabled: boolean, level?: number): Promise<void>;
  setFollowersOnly?(enabled: boolean, minDurationMinutes?: number): Promise<void>;
  setEmoteOnly?(enabled: boolean): Promise<void>;
  clearChat?(): Promise<void>;
  addMod?(userId: string): Promise<void>;
  removeMod?(userId: string): Promise<void>;
  addVip?(userId: string): Promise<void>;
  removeVip?(userId: string): Promise<void>;
  raid?(targetChannel: string): Promise<void>;
  shoutout?(userId: string): Promise<void>;
}
