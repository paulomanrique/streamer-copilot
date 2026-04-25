import type { ChatMessage, PermissionLevel, VoiceCommand, VoiceSpeakPayload } from '../../shared/types.js';
import type { CommandModule } from '../commands/command-dispatcher.js';
import { isPermissionAllowed } from '../commands/permission-utils.js';
import { VoiceCommandRepository } from './voice-repository.js';

interface VoiceServiceOptions {
  repository: VoiceCommandRepository;
  onSpeak: (payload: VoiceSpeakPayload) => void;
  now?: () => number;
}

interface ChatPermissionContext {
  permissionLevel: PermissionLevel;
}

export class VoiceService implements CommandModule {
  readonly name = 'voice';
  private readonly commandCooldowns = new Map<string, number>();
  private readonly userCooldowns = new Map<string, number>();

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
    this.handleChatMessage(message.content, { permissionLevel, author: message.author });
  }

  handleChatMessage(content: string, context: ChatPermissionContext & { author?: string }): VoiceSpeakPayload | null {
    const commands = this.options.repository.list();

    for (const command of commands) {
      if (!command.enabled) continue;
      if (!content.startsWith(command.trigger)) continue;
      if (!isPermissionAllowed(command.permissions, context.permissionLevel)) continue;
      if (!this.canRun(command, context.author)) continue;

      let extractedText = command.template ?? content.slice(command.trigger.length).trim();
      if (!extractedText) return null;

      if (extractedText.length > command.characterLimit) {
        extractedText = extractedText.slice(0, command.characterLimit);
      }

      if (command.announceUsername && context.author) {
        extractedText = `${context.author} disse: ${extractedText}`;
      }

      const payload = { text: extractedText, lang: command.language };

      this.commandCooldowns.set(command.id, this.now());
      if (context.author) this.userCooldowns.set(`${command.id}:${context.author}`, this.now());
      this.options.onSpeak(payload);
      return payload;
    }

    return null;
  }

  private canRun(command: VoiceCommand, author?: string): boolean {
    const now = this.now();
    if (command.cooldownSeconds > 0) {
      const last = this.commandCooldowns.get(command.id);
      if (last && now - last < command.cooldownSeconds * 1000) return false;
    }
    if (command.userCooldownSeconds > 0 && author) {
      const last = this.userCooldowns.get(`${command.id}:${author}`);
      if (last && now - last < command.userCooldownSeconds * 1000) return false;
    }
    return true;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }
}
