import type {
  ChatMessage,
  PermissionLevel,
  UserList,
  VoiceCommand,
  VoiceSpeakPayload,
} from '../../shared/types.js';
import type { CommandModule } from '../commands/command-dispatcher.js';
import { isCommandAllowed } from '../commands/permission-utils.js';
import { VoiceCommandRepository } from './voice-repository.js';

interface VoiceServiceOptions {
  repository: VoiceCommandRepository;
  getUserLists: () => UserList[];
  onSpeak: (payload: VoiceSpeakPayload) => void;
  now?: () => number;
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

  /** Clears in-memory cooldown state. Called on profile switch — cloned
   *  profiles share command ids, so a cooldown stamped in one profile would
   *  otherwise keep blocking the same command in the next. */
  reset(): void {
    this.commandCooldowns.clear();
    this.userCooldowns.clear();
  }

  handle(message: ChatMessage, _permissionLevel: PermissionLevel): void {
    this.handleMessage(message);
  }

  handleMessage(message: ChatMessage): VoiceSpeakPayload | null {
    const commands = this.options.repository.list();
    const userLists = this.options.getUserLists();
    const content = message.content;
    const author = message.author;

    for (const command of commands) {
      const timestamp = this.now();
      if (!command.enabled) continue;
      if (!content.startsWith(command.trigger)) continue;
      // The trigger matched: this command alone decides the outcome. Falling
      // through to another command with the same trigger (stale duplicates
      // from old versions of the TTS page) would bypass the permissions the
      // streamer configured on the one the UI manages.
      if (!isCommandAllowed(command.permissions, message, userLists)) return null;
      if (!this.canRun(command, author, timestamp)) return null;

      let extractedText = command.template ?? content.slice(command.trigger.length).trim();
      if (!extractedText) return null;

      if (extractedText.length > command.characterLimit) {
        extractedText = extractedText.slice(0, command.characterLimit);
      }

      if (command.announceUsername && author) {
        extractedText = `${author} disse: ${extractedText}`;
      }

      const payload = { text: extractedText, lang: command.language };

      this.commandCooldowns.set(command.id, timestamp);
      if (author) this.userCooldowns.set(`${command.id}:${author}`, timestamp);
      this.options.onSpeak(payload);
      return payload;
    }

    return null;
  }

  /** `now` is captured once per message so the cooldown is stamped with the
   *  same timestamp it was checked against (mirrors SoundService). */
  private canRun(command: VoiceCommand, author: string | undefined, now: number): boolean {
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
