import type {
  ChatMessage,
  PermissionLevel,
  SuggestionEntry,
  SuggestionList,
  SuggestionListUpsertInput,
  SuggestionSnapshot,
} from '../../shared/types.js';
import type { CommandModule } from '../commands/command-dispatcher.js';
import type { SuggestionRepository } from './suggestion-repository.js';

interface SuggestionServiceOptions {
  repository: SuggestionRepository;
  onState: (payload: SuggestionSnapshot) => void;
  now?: () => number;
}

const PERMISSION_RANK: Record<PermissionLevel, number> = {
  everyone: 0,
  follower: 1,
  subscriber: 2,
  moderator: 3,
  broadcaster: 4,
};

export class SuggestionService implements CommandModule {
  readonly name = 'suggestion';
  private readonly commandCooldowns = new Map<string, number>();
  private readonly userCooldowns = new Map<string, number>();

  constructor(private readonly options: SuggestionServiceOptions) {}

  listLists(): SuggestionList[] {
    return this.options.repository.listLists();
  }

  upsertList(input: SuggestionListUpsertInput): SuggestionList[] {
    return this.options.repository.upsertList(input);
  }

  deleteList(id: string): SuggestionList[] {
    return this.options.repository.deleteList(id);
  }

  getEntries(listId: string): SuggestionEntry[] {
    return this.options.repository.listEntries(listId);
  }

  clearEntries(listId: string): SuggestionEntry[] {
    this.options.repository.clearEntries(listId);
    return this.options.repository.listEntries(listId);
  }

  clearSessionEntries(): void {
    this.options.repository.clearSessionEntries();
  }

  handle(message: ChatMessage, permissionLevel: PermissionLevel): void {
    const lists = this.options.repository.listLists();
    const timestamp = this.now();

    for (const list of lists) {
      if (!list.enabled) continue;

      const trigger = list.trigger;
      if (!message.content.startsWith(trigger)) continue;

      const afterTrigger = message.content.slice(trigger.length);
      if (afterTrigger.length === 0 || afterTrigger[0] !== ' ') continue;

      const content = afterTrigger.trim();
      if (!content) continue;

      if (!this.isAllowed(list.permissions, permissionLevel)) continue;
      if (!this.canRun(list, message.author, timestamp)) continue;

      const userKey = `${message.platform}:${message.author.toLowerCase()}`;

      if (!list.allowDuplicates && this.options.repository.hasUserEntry(list.id, userKey)) {
        continue;
      }

      const entry = this.options.repository.addEntry({
        listId: list.id,
        platform: message.platform,
        userKey,
        displayName: message.author,
        content,
      });

      if (entry) {
        this.commandCooldowns.set(list.id, timestamp);
        this.userCooldowns.set(`${list.id}:${message.author}`, timestamp);

        const entries = this.options.repository.listEntries(list.id);
        this.options.onState({ list, entries });
      }

      return;
    }
  }

  private isAllowed(allowedLevels: PermissionLevel[], actualLevel: PermissionLevel): boolean {
    if (actualLevel === 'broadcaster') return true;
    return allowedLevels.some((level) => PERMISSION_RANK[actualLevel] >= PERMISSION_RANK[level]);
  }

  private canRun(list: SuggestionList, userId: string, now: number): boolean {
    if (list.cooldownSeconds > 0) {
      const lastCommandRunAt = this.commandCooldowns.get(list.id);
      if (lastCommandRunAt && now - lastCommandRunAt < list.cooldownSeconds * 1000) return false;
    }

    if (list.userCooldownSeconds > 0) {
      const userKey = `${list.id}:${userId}`;
      const lastUserRunAt = this.userCooldowns.get(userKey);
      if (lastUserRunAt && now - lastUserRunAt < list.userCooldownSeconds * 1000) return false;
    }

    return true;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }
}
