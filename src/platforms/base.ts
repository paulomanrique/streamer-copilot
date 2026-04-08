import type { ChatMessage, PlatformId, StreamEvent } from '../shared/types.js';

export interface PlatformChatAdapter {
  readonly platform: PlatformId;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  onMessage: (handler: (message: ChatMessage) => void) => () => void;
  onEvent: (handler: (event: StreamEvent) => void) => () => void;
}
