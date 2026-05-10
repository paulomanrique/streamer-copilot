import type { ChatMessage, StreamEvent } from '../../shared/types.js';

/**
 * Common options handed to every YouTube live-chat client implementation.
 *
 * Both drivers (scrape via youtubei.js, and pure API via googleapis) own a
 * single live video and emit normalized chat messages and stream events.
 * Constructors stay driver-specific because the underlying clients need
 * driver-specific extras (e.g. OAuth credentials for the API driver), but
 * the runtime surface is uniform.
 */
export interface YouTubeLiveClientOptions {
  videoId: string;
  onMessage: (message: Omit<ChatMessage, 'id' | 'timestampLabel'>) => void;
  onEvent?: (event: Omit<StreamEvent, 'id' | 'timestampLabel'>) => void;
  onLog?: (message: string) => void;
  onViewerCount?: (count: number) => void;
}

export interface YouTubeLiveModerationApi {
  deleteMessage(messageId: string): Promise<void>;
  banUser(channelId: string): Promise<void>;
  /** Temporary ban; YouTube's minimum is 10s and maximum 300s. */
  timeoutUser(channelId: string, durationSec: number): Promise<void>;
}

export interface YouTubeLiveClient {
  readonly videoId: string;
  start(): Promise<void>;
  stop(): void;
  /**
   * Send a message to live chat. `onBehalfOfUser` is the YouTube channel page
   * id ("obou") used by the scrape driver when posting from a brand account;
   * the API driver ignores it (the OAuth grant already targets a channel).
   */
  sendMessage(content: string, onBehalfOfUser?: string): Promise<void>;
  /** Present only when the underlying driver supports real moderation. */
  readonly moderation?: YouTubeLiveModerationApi;
}
