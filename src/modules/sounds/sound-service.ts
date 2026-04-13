import type { ChatMessage, PermissionLevel, SoundCommand, SoundPlayPayload } from '../../shared/types.js';
import type { CommandModule } from '../commands/command-dispatcher.js';
import { SoundCommandRepository } from './sound-repository.js';

interface SoundServiceOptions {
  repository: SoundCommandRepository;
  onPlay: (payload: SoundPlayPayload) => void;
  now?: () => number;
}

interface ChatPermissionContext {
  permissionLevel: PermissionLevel;
  userId: string;
}

const PERMISSION_RANK: Record<PermissionLevel, number> = {
  everyone: 0,
  follower: 1,
  subscriber: 2,
  moderator: 3,
  broadcaster: 4,
};

export class SoundService implements CommandModule {
  readonly name = 'sound';
  private readonly commandCooldowns = new Map<string, number>();
  private readonly userCooldowns = new Map<string, number>();

  constructor(private readonly options: SoundServiceOptions) {}

  list(): SoundCommand[] {
    return this.options.repository.list();
  }

  upsert(input: Parameters<SoundCommandRepository['upsert']>[0]): SoundCommand[] {
    return this.options.repository.upsert(input);
  }

  delete(id: string): SoundCommand[] {
    return this.options.repository.delete(id);
  }

  previewPlay(payload: SoundPlayPayload): void {
    this.options.onPlay(payload);
  }

  /** CommandModule entry point — called by CommandDispatcher with resolved permission. */
  handle(message: ChatMessage, permissionLevel: PermissionLevel): void {
    this.handleChatMessage(message.content, { permissionLevel, userId: message.author });
  }

  handleChatMessage(content: string, context: ChatPermissionContext): SoundPlayPayload | null {
    const commands = this.options.repository.list();

    for (const command of commands) {
      const timestamp = this.now();
      if (!command.enabled) continue;
      if (command.commandEnabled === false || !command.trigger) continue;
      if (!content.startsWith(command.trigger)) continue;
      if (!this.isAllowed(command.permissions, context.permissionLevel)) continue;
      if (!this.canRun(command, context.userId, timestamp)) continue;

      const payload = { filePath: command.filePath };
      this.commandCooldowns.set(command.id, timestamp);
      this.userCooldowns.set(this.buildUserKey(command.id, context.userId), timestamp);
      this.options.onPlay(payload);
      return payload;
    }

    return null;
  }

  private isAllowed(allowedLevels: PermissionLevel[], actualLevel: PermissionLevel): boolean {
    if (actualLevel === 'broadcaster') return true;

    return allowedLevels.some((level) => PERMISSION_RANK[actualLevel] >= PERMISSION_RANK[level]);
  }

  private canRun(command: SoundCommand, userId: string, now: number): boolean {
    const lastCommandRunAt = this.commandCooldowns.get(command.id);
    if (lastCommandRunAt && now - lastCommandRunAt < command.cooldownSeconds * 1000) return false;

    const userKey = this.buildUserKey(command.id, userId);
    const lastUserRunAt = this.userCooldowns.get(userKey);
    if (lastUserRunAt && now - lastUserRunAt < command.cooldownSeconds * 1000) return false;

    return true;
  }

  private buildUserKey(commandId: string, userId: string): string {
    return `${commandId}:${userId}`;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }
}
