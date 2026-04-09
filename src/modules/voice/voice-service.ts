import type { ChatMessage, PermissionLevel, VoiceCommand, VoiceSpeakPayload } from '../../shared/types.js';
import type { CommandModule } from '../commands/command-dispatcher.js';
import { VoiceCommandRepository } from './voice-repository.js';

interface VoiceServiceOptions {
  repository: VoiceCommandRepository;
  onSpeak: (payload: VoiceSpeakPayload) => void;
  now?: () => number;
}

interface ChatPermissionContext {
  permissionLevel: PermissionLevel;
}

const PERMISSION_RANK: Record<PermissionLevel, number> = {
  everyone: 0,
  follower: 1,
  subscriber: 2,
  moderator: 3,
  broadcaster: 4,
};

export class VoiceService implements CommandModule {
  readonly name = 'voice';
  private readonly commandCooldowns = new Map<string, number>();

  constructor(private readonly options: VoiceServiceOptions) {}

  list(): VoiceCommand[] {
    return this.options.repository.list();
  }

  upsert(input: Parameters<VoiceCommandRepository['upsert']>[0]): VoiceCommand[] {
    return this.options.repository.upsert(input);
  }

  delete(id: string): VoiceCommand[] {
    return this.options.repository.delete(id);
  }

  previewSpeak(payload: VoiceSpeakPayload): void {
    this.options.onSpeak(payload);
  }

  /** CommandModule entry point — called by CommandDispatcher with resolved permission. */
  handle(message: ChatMessage, permissionLevel: PermissionLevel): void {
    this.handleChatMessage(message.content, { permissionLevel });
  }

  handleChatMessage(content: string, context: ChatPermissionContext): VoiceSpeakPayload | null {
    const commands = this.options.repository.list();

    for (const command of commands) {
      if (!command.enabled) continue;
      if (!content.startsWith(command.trigger)) continue;
      if (!this.isAllowed(command.permissions, context.permissionLevel)) continue;
      if (!this.canRun(command)) continue;

      const extractedText = command.template ?? content.slice(command.trigger.length).trim();
      if (!extractedText) return null;

      const payload = {
        text: extractedText,
        lang: command.language,
      };

      this.commandCooldowns.set(command.id, this.now());
      this.options.onSpeak(payload);
      return payload;
    }

    return null;
  }

  private isAllowed(allowedLevels: PermissionLevel[], actualLevel: PermissionLevel): boolean {
    if (actualLevel === 'broadcaster') return true;
    return allowedLevels.some((level) => PERMISSION_RANK[actualLevel] >= PERMISSION_RANK[level]);
  }

  private canRun(command: VoiceCommand): boolean {
    const lastRunAt = this.commandCooldowns.get(command.id);
    if (!lastRunAt) return true;
    return this.now() - lastRunAt >= command.cooldownSeconds * 1000;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }
}
