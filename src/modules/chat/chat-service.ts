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
  private readonly adapterDetachHandlers = new Map<PlatformId, Array<() => void>>();
  private readonly messages: ChatMessage[] = [];
  private readonly events: StreamEvent[] = [];

  constructor(private readonly options: ChatServiceOptions) {}

  registerAdapter(adapter: PlatformChatAdapter): void {
    this.adapters.set(adapter.platform, adapter);
    this.adapterDetachHandlers.set(adapter.platform, [
      adapter.onMessage((message) => this.handleMessage(message)),
      adapter.onEvent((event) => this.handleEvent(event)),
    ]);
  }

  async replaceAdapter(adapter: PlatformChatAdapter): Promise<void> {
    await this.removeAdapter(adapter.platform);
    this.registerAdapter(adapter);
    await adapter.connect();
  }

  async removeAdapter(platform: PlatformId): Promise<void> {
    const existing = this.adapters.get(platform);
    if (!existing) return;

    const detachHandlers = this.adapterDetachHandlers.get(platform) ?? [];
    for (const detach of detachHandlers) detach();
    this.adapterDetachHandlers.delete(platform);

    await existing.disconnect();
    this.adapters.delete(platform);
  }

  async connectAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.connect();
    }
  }

  async disconnectAll(): Promise<void> {
    for (const detachers of this.adapterDetachHandlers.values()) {
      for (const detach of detachers) detach();
    }
    this.adapterDetachHandlers.clear();

    for (const adapter of this.adapters.values()) {
      await adapter.disconnect();
    }
    this.adapters.clear();
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

    this.messages.push(message);
    if (this.messages.length > this.maxHistory) {
      this.messages.shift();
    }
    this.options.onMessage(message);
  }

  private handleEvent(event: StreamEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxHistory) {
      this.events.shift();
    }
    this.options.onEvent(event);
  }

  private get maxHistory(): number {
    return this.options.maxHistory ?? 100;
  }
}
