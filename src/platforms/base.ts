export type SupportedPlatform = 'twitch' | 'youtube' | 'kick';

export interface PlatformChatAdapter {
  platform: SupportedPlatform;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}
