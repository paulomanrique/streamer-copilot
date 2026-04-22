import { randomUUID } from 'node:crypto';

import type {
  ChatMessage,
  MusicPlayCommand,
  MusicPlayerEvent,
  MusicPlayerState,
  MusicQueueItem,
  MusicRequestSettings,
  PermissionLevel,
  PlatformId,
} from '../../shared/types.js';
import type { CommandModule } from '../commands/command-dispatcher.js';
import { isPermissionAllowed } from '../commands/permission-utils.js';

interface MusicRequestServiceOptions {
  getSettings: () => MusicRequestSettings;
  searchYouTube: (query: string) => Promise<{ videoId: string; title: string; durationSeconds: number; thumbnailUrl: string | null } | null>;
  onPlay: (cmd: MusicPlayCommand) => void;
  onStop: () => void;
  onStateUpdate: (state: MusicPlayerState) => void;
  onVolumeChange: (volume: number) => void;
  sendMessage: (platform: PlatformId, content: string) => Promise<void>;
  logInfo: (message: string, metadata?: unknown) => void;
  logError: (message: string, metadata?: unknown) => void;
  now?: () => number;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export class MusicRequestService implements CommandModule {
  readonly name = 'music-request';

  private queue: MusicQueueItem[] = [];
  private currentItem: MusicQueueItem | null = null;
  private isPlaying = false;
  private readonly commandCooldowns = new Map<string, number>();
  private readonly userCooldowns = new Map<string, number>();

  constructor(private readonly options: MusicRequestServiceOptions) {}

  handle(message: ChatMessage, permissionLevel: PermissionLevel): void {
    const settings = this.options.getSettings();
    if (!settings.enabled) return;

    const content = message.content.trim();

    // Request trigger: "!sr <query>"
    if (content.startsWith(settings.requestTrigger + ' ') || content === settings.requestTrigger) {
      const query = content.slice(settings.requestTrigger.length).trim();
      if (!query) return;
      void this.handleRequest(message, permissionLevel, query, settings);
      return;
    }

    // Skip trigger
    if (content === settings.skipTrigger || content.startsWith(settings.skipTrigger + ' ')) {
      this.handleSkip(message, permissionLevel, settings);
      return;
    }

    // Queue trigger
    if (content === settings.queueTrigger || content.startsWith(settings.queueTrigger + ' ')) {
      void this.handleQueue(message, settings);
      return;
    }

    // Cancel trigger
    if (content === settings.cancelTrigger || content.startsWith(settings.cancelTrigger + ' ')) {
      void this.handleCancel(message, settings);
      return;
    }
  }

  private async handleRequest(
    message: ChatMessage,
    permissionLevel: PermissionLevel,
    query: string,
    settings: MusicRequestSettings,
  ): Promise<void> {
    if (!isPermissionAllowed(settings.requestPermissions, permissionLevel)) return;
    if (!this.canRun('request', message.author, settings)) return;

    if (this.queue.length >= settings.maxQueueSize) {
      void this.options.sendMessage(message.platform, `❌ Queue is full (${settings.maxQueueSize} max)`).catch(() => {});
      return;
    }

    try {
      const result = await this.options.searchYouTube(query);
      if (!result) {
        void this.options.sendMessage(message.platform, `�� No results found for: ${query}`).catch(() => {});
        return;
      }

      if (result.durationSeconds > settings.maxDurationSeconds) {
        const maxMin = Math.floor(settings.maxDurationSeconds / 60);
        void this.options.sendMessage(message.platform, `❌ Song too long (max ${maxMin} min): ${result.title}`).catch(() => {});
        return;
      }

      const item: MusicQueueItem = {
        id: randomUUID(),
        videoId: result.videoId,
        title: result.title,
        durationSeconds: result.durationSeconds,
        thumbnailUrl: result.thumbnailUrl,
        requestedBy: message.author,
        platform: message.platform,
        requestedAt: new Date().toISOString(),
      };

      this.queue.push(item);
      this.updateCooldowns('request', message.author);

      const position = this.queue.length;
      const dur = formatDuration(item.durationSeconds);
      void this.options.sendMessage(
        message.platform,
        `🎵 Added: ${item.title} (${dur}) — #${position} in queue`,
      ).catch(() => {});

      this.options.logInfo('Music request added', { title: item.title, requestedBy: message.author, position });
      this.pushState();

      if (!this.isPlaying) {
        this.playNext();
      }
    } catch (cause) {
      this.options.logError('Failed to search YouTube', {
        query,
        error: cause instanceof Error ? cause.message : String(cause),
      });
      void this.options.sendMessage(message.platform, `❌ Failed to search: ${query}`).catch(() => {});
    }
  }

  private handleSkip(message: ChatMessage, permissionLevel: PermissionLevel, settings: MusicRequestSettings): void {
    if (!isPermissionAllowed(settings.skipPermissions, permissionLevel)) return;

    if (!this.isPlaying && !this.currentItem) {
      void this.options.sendMessage(message.platform, '❌ Nothing is playing').catch(() => {});
      return;
    }

    this.options.logInfo('Music skipped', { skippedBy: message.author, title: this.currentItem?.title });
    void this.options.sendMessage(message.platform, `⏭ Skipped: ${this.currentItem?.title ?? 'current song'}`).catch(() => {});

    this.options.onStop();
    this.playNext();
  }

  private async handleQueue(message: ChatMessage, _settings: MusicRequestSettings): Promise<void> {
    if (!this.currentItem && this.queue.length === 0) {
      void this.options.sendMessage(message.platform, '🎵 Queue is empty').catch(() => {});
      return;
    }

    const parts: string[] = [];
    if (this.currentItem) {
      parts.push(`Now: ${this.currentItem.title}`);
    }

    if (this.queue.length > 0) {
      const shown = this.queue.slice(0, 3).map((item, i) => `${i + 1}. ${item.title} — @${item.requestedBy}`);
      const remaining = this.queue.length - 3;
      let queueStr = shown.join(', ');
      if (remaining > 0) queueStr += ` (+${remaining} more)`;
      parts.push(`Queue: ${queueStr}`);
    }

    void this.options.sendMessage(message.platform, `🎵 ${parts.join(' | ')}`).catch(() => {});
  }

  private async handleCancel(message: ChatMessage, _settings: MusicRequestSettings): Promise<void> {
    let idx = -1;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].requestedBy.toLowerCase() === message.author.toLowerCase()) {
        idx = i;
        break;
      }
    }

    if (idx === -1) {
      void this.options.sendMessage(message.platform, `❌ No song found in queue for @${message.author}`).catch(() => {});
      return;
    }

    const removed = this.queue.splice(idx, 1)[0];
    this.options.logInfo('Music request cancelled', { title: removed.title, cancelledBy: message.author });
    void this.options.sendMessage(message.platform, `❌ Removed: ${removed.title}`).catch(() => {});
    this.pushState();
  }

  playNext(): void {
    this.currentItem = null;
    this.isPlaying = false;

    if (this.queue.length === 0) {
      this.pushState();
      return;
    }

    const item = this.queue.shift()!;
    this.currentItem = item;
    this.isPlaying = true;
    this.pushState();

    const settings = this.options.getSettings();
    this.options.onPlay({
      itemId: item.id,
      videoId: item.videoId,
      title: item.title,
      volume: settings.volume,
    });

    this.options.logInfo('Music playing', { title: item.title, requestedBy: item.requestedBy });
  }

  onPlayerEvent(event: MusicPlayerEvent): void {
    if (event.type === 'ended') {
      this.options.logInfo('Music ended', { itemId: event.itemId });
    } else {
      this.options.logError('Music playback error', { itemId: event.itemId, errorCode: event.errorCode });
    }
    this.playNext();
  }

  skip(): void {
    this.options.onStop();
    this.playNext();
  }

  clearQueue(): void {
    this.queue = [];
    if (this.isPlaying) {
      this.options.onStop();
      this.currentItem = null;
      this.isPlaying = false;
    }
    this.pushState();
  }

  getState(): MusicPlayerState {
    return {
      currentItem: this.currentItem,
      queue: [...this.queue],
      isPlaying: this.isPlaying,
    };
  }

  reset(): void {
    this.queue = [];
    this.currentItem = null;
    this.isPlaying = false;
    this.commandCooldowns.clear();
    this.userCooldowns.clear();
    this.options.onStop();
    this.pushState();
  }

  removeFromQueue(itemId: string): void {
    this.queue = this.queue.filter((item) => item.id !== itemId);
    this.pushState();
  }

  private pushState(): void {
    this.options.onStateUpdate(this.getState());
  }

  private canRun(action: string, userId: string, settings: MusicRequestSettings): boolean {
    const now = this.now();
    const globalCd = settings.cooldownSeconds;
    const userCd = settings.userCooldownSeconds;

    if (globalCd > 0) {
      const lastAt = this.commandCooldowns.get(action);
      if (lastAt && now - lastAt < globalCd * 1000) return false;
    }

    if (userCd > 0) {
      const key = `${action}:${userId}`;
      const lastAt = this.userCooldowns.get(key);
      if (lastAt && now - lastAt < userCd * 1000) return false;
    }

    return true;
  }

  private updateCooldowns(action: string, userId: string): void {
    const now = this.now();
    this.commandCooldowns.set(action, now);
    this.userCooldowns.set(`${action}:${userId}`, now);
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }
}
