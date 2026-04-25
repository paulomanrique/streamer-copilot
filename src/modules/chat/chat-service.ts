import type { RecentChatSnapshot } from '../../shared/ipc.js';
import type { ChatMessage, PlatformId, StreamEvent } from '../../shared/types.js';
import type { PlatformChatAdapter } from '../../platforms/base.js';
import { CommandDispatcher } from '../commands/command-dispatcher.js';
import { RaffleService } from '../raffles/raffle-service.js';
import { SoundService } from '../sounds/sound-service.js';
import { SuggestionService } from '../suggestions/suggestion-service.js';
import { TextService } from '../text/text-service.js';
import { VoiceService } from '../voice/voice-service.js';
import { MusicRequestService } from '../music/music-request-service.js';

interface ChatServiceOptions {
  raffleService: RaffleService;
  soundService: SoundService;
  suggestionService: SuggestionService;
  textService: TextService;
  voiceService: VoiceService;
  musicService: MusicRequestService;
  onMessage: (message: ChatMessage) => void;
  onEvent: (event: StreamEvent) => void;
  maxHistory?: number;
}

export class ChatService {
  private readonly adapters = new Map<PlatformId, PlatformChatAdapter>();
  private readonly adapterDetachHandlers = new Map<PlatformId, Array<() => void>>();
  private readonly messages: ChatMessage[] = [];
  private readonly events: StreamEvent[] = [];
  private readonly dispatcher: CommandDispatcher;

  constructor(private readonly options: ChatServiceOptions) {
    this.dispatcher = new CommandDispatcher();
    this.dispatcher.register(options.soundService);
    this.dispatcher.register(options.textService);
    this.dispatcher.register(options.voiceService);
    this.dispatcher.register(options.raffleService);
    this.dispatcher.register(options.suggestionService);
    this.dispatcher.register(options.musicService);
  }

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

  clearRecent(): void {
    this.messages.length = 0;
    this.events.length = 0;
  }

  /**
   * Public entry point for messages that don't come through a registered adapter
   * (e.g. YouTube scraper, injected test messages). Goes through the same
   * CommandDispatcher pipeline as adapter messages.
   */
  injectMessage(message: ChatMessage): void {
    this.handleMessage(message);
  }

  /**
   * Public entry point for events emitted by integrations that don't implement
   * PlatformChatAdapter directly, such as the YouTube DOM scraper.
   */
  injectEvent(event: StreamEvent): void {
    this.handleEvent(event);
  }

  private handleMessage(message: ChatMessage): void {
    try {
      if (!message.isHistory) {
        this.dispatcher.dispatch(message);
      }
    } catch {
      // Guard: dispatch errors must never prevent the message from reaching the UI
    }

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
