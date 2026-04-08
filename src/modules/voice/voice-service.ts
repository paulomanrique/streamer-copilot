import type { PermissionLevel, VoiceCommand, VoiceSpeakPayload } from '../../shared/types.js';
import { VoiceCommandRepository } from './voice-repository.js';

interface VoiceServiceOptions {
  repository: VoiceCommandRepository;
  onSpeak: (payload: VoiceSpeakPayload) => void;
  now?: () => number;
}

interface ChatPermissionContext {
  permissionLevel: PermissionLevel;
}

export class VoiceService {
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

  handleChatMessage(content: string, context: ChatPermissionContext): VoiceSpeakPayload | null {
    const commands = this.options.repository.list();

    for (const command of commands) {
      if (!command.enabled) continue;
      if (!content.startsWith(command.trigger)) continue;
      if (!command.permissions.includes(context.permissionLevel)) continue;
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

  private canRun(command: VoiceCommand): boolean {
    const lastRunAt = this.commandCooldowns.get(command.id);
    if (!lastRunAt) return true;
    return this.now() - lastRunAt >= command.cooldownSeconds * 1000;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }
}
