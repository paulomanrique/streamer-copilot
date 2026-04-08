import type { RecentChatSnapshot } from '../../shared/ipc.js';
import type { ChatMessage, PlatformId, StreamEvent } from '../../shared/types.js';
import type { PlatformChatAdapter } from '../../platforms/base.js';
import { SoundService } from '../sounds/sound-service.js';
import { VoiceService } from '../voice/voice-service.js';

interface ChatServiceOptions {
  soundService: SoundService;
  voiceService: VoiceService;
  onMessage: (message: ChatMessage) => void;
  onEvent: (event: StreamEvent) => void;
  maxHistory?: number;
}

export class ChatService {
  private readonly adapters = new Map<PlatformId, PlatformChatAdapter>();
  private readonly detachHandlers: Array<() => void> = [];
  private readonly messages: ChatMessage[] = [];
  private readonly events: StreamEvent[] = [];

  constructor(private readonly options: ChatServiceOptions) {}

  registerAdapter(adapter: PlatformChatAdapter): void {
    this.adapters.set(adapter.platform, adapter);
    this.detachHandlers.push(adapter.onMessage((message) => this.handleMessage(message)));
    this.detachHandlers.push(adapter.onEvent((event) => this.handleEvent(event)));
  }

  async connectAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.connect();
    }
  }

  async disconnectAll(): Promise<void> {
    for (const detach of this.detachHandlers.splice(0)) {
      detach();
    }

    for (const adapter of this.adapters.values()) {
      await adapter.disconnect();
    }
  }

  async sendMessage(platform: PlatformId, content: string): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`No adapter registered for platform "${platform}"`);
    }

    await adapter.sendMessage(content);
  }

  getRecent(): RecentChatSnapshot {
    return {
      messages: [...this.messages],
      events: [...this.events],
    };
  }

  private handleMessage(message: ChatMessage): void {
    this.options.soundService.handleChatMessage(message.content, {
      permissionLevel: 'everyone',
      userId: message.author,
    });
    this.options.voiceService.handleChatMessage(message.content, {
      permissionLevel: 'everyone',
    });

    this.messages.unshift(message);
    this.messages.splice(this.maxHistory);
    this.options.onMessage(message);
  }

  private handleEvent(event: StreamEvent): void {
    this.events.unshift(event);
    this.events.splice(this.maxHistory);
    this.options.onEvent(event);
  }

  private get maxHistory(): number {
    return this.options.maxHistory ?? 100;
  }
}
