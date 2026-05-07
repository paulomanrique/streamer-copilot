import type { ChatMessage, PlatformId, StreamEvent } from '../shared/types.js';
import type { ModerationApi, PlatformCapabilities } from '../shared/moderation.js';

export const READ_ONLY_CAPABILITIES: PlatformCapabilities = Object.freeze({
  canDeleteMessage: false,
  canBanUser: false,
  canTimeoutUser: false,
  canSetSlowMode: false,
  canSetSubscribersOnly: false,
  canSetMembersOnly: false,
  canSetFollowersOnly: false,
  canSetEmoteOnly: false,
  canSetUniqueChat: false,
  canClearChat: false,
  canManageMods: false,
  canManageVips: false,
  canRaid: false,
  canShoutout: false,
});

export interface PlatformChatAdapter {
  readonly platform: PlatformId;
  readonly capabilities: PlatformCapabilities;
  readonly moderation?: ModerationApi;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  onMessage: (handler: (message: ChatMessage) => void) => () => void;
  onEvent: (handler: (event: StreamEvent) => void) => () => void;
}
