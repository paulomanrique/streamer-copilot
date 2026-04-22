import type {
  ChatMessage,
  PermissionLevel,
  TextCommand,
  TextCommandResponsePayload,
  TextSettings,
} from '../../shared/types.js';
import type { CommandModule } from '../commands/command-dispatcher.js';
import { isPermissionAllowed } from '../commands/permission-utils.js';
import { TextCommandRepository } from './text-repository.js';

interface TextServiceOptions {
  repository: TextCommandRepository;
  getSettings: () => TextSettings;
  onRespond: (payload: TextCommandResponsePayload) => void | Promise<void>;
  now?: () => number;
}

interface ChatPermissionContext {
  permissionLevel: PermissionLevel;
  userId: string;
  platform: ChatMessage['platform'];
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

  handle(message: ChatMessage, permissionLevel: PermissionLevel): void {
    this.handleChatMessage(message.content, {
      permissionLevel,
      userId: message.author,
      platform: message.platform,
    });
  }

  handleChatMessage(content: string, context: ChatPermissionContext): TextCommandResponsePayload | null {
    const commands = this.options.repository.list();

    for (const command of commands) {
      const timestamp = this.now();
      if (!command.enabled) continue;
      if (command.commandEnabled === false || !command.trigger) continue;
      if (!content.startsWith(command.trigger)) continue;
      if (!isPermissionAllowed(command.permissions, context.permissionLevel)) continue;
      if (!this.canRun(command, context.userId, timestamp)) continue;

      const payload: TextCommandResponsePayload = {
        platform: context.platform,
        content: command.response,
      };

      this.commandCooldowns.set(command.id, timestamp);
      this.userCooldowns.set(this.buildUserKey(command.id, context.userId), timestamp);
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
