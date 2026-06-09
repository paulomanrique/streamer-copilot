import type {
  ChatMessage,
  PermissionLevel,
  TextCommand,
  TextCommandResponsePayload,
  TextSettings,
  UserList,
} from '../../shared/types.js';
import type { CommandModule } from '../commands/command-dispatcher.js';
import { isCommandAllowed } from '../commands/permission-utils.js';
import { TextCommandRepository } from './text-repository.js';

interface TextServiceOptions {
  repository: TextCommandRepository;
  getSettings: () => TextSettings;
  getUserLists: () => UserList[];
  onRespond: (payload: TextCommandResponsePayload) => void | Promise<void>;
  now?: () => number;
}

export class TextService implements CommandModule {
  readonly name = 'text';
  private readonly commandCooldowns = new Map<string, number>();
  private readonly userCooldowns = new Map<string, number>();

  constructor(private readonly options: TextServiceOptions) {}

  list(): TextCommand[] {
    return this.options.repository.list();
  }

  upsert(input: Parameters<TextCommandRepository['upsert']>[0]): TextCommand[] {
    return this.options.repository.upsert(input);
  }

  delete(id: string): TextCommand[] {
    return this.options.repository.delete(id);
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

  handleMessage(message: ChatMessage): TextCommandResponsePayload | null {
    const commands = this.options.repository.list();
    const userLists = this.options.getUserLists();
    const content = message.content;
    const userId = message.author;

    for (const command of commands) {
      const timestamp = this.now();
      if (!command.enabled) continue;
      if (command.commandEnabled === false || !command.trigger) continue;
      if (!content.startsWith(command.trigger)) continue;
      if (!isCommandAllowed(command.permissions, message, userLists)) continue;
      if (!this.canRun(command, userId, timestamp)) continue;

      const payload: TextCommandResponsePayload = {
        platform: message.platform,
        content: command.response,
      };

      this.commandCooldowns.set(command.id, timestamp);
      this.userCooldowns.set(this.buildUserKey(command.id, userId), timestamp);
      void this.options.onRespond(payload);
      return payload;
    }

    return null;
  }

  private canRun(command: TextCommand, userId: string, now: number): boolean {
    const settings = this.options.getSettings();
    const globalCd = command.cooldownSeconds ?? settings.defaultCooldownSeconds;
    const userCd = command.userCooldownSeconds ?? settings.defaultUserCooldownSeconds;

    if (globalCd > 0) {
      const lastCommandRunAt = this.commandCooldowns.get(command.id);
      if (lastCommandRunAt && now - lastCommandRunAt < globalCd * 1000) return false;
    }

    if (userCd > 0) {
      const userKey = this.buildUserKey(command.id, userId);
      const lastUserRunAt = this.userCooldowns.get(userKey);
      if (lastUserRunAt && now - lastUserRunAt < userCd * 1000) return false;
    }

    return true;
  }

  private buildUserKey(commandId: string, userId: string): string {
    return `${commandId}:${userId}`;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }
}
