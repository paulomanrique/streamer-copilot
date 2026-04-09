import type { ChatMessage, PermissionLevel } from '../../shared/types.js';

/**
 * A command handler module. Each module (sound, voice, future ones) registers here.
 * The dispatcher calls every handler for every incoming message and each handler
 * decides on its own whether the message matches its triggers.
 */
export interface CommandModule {
  readonly name: string;
  handle(message: ChatMessage, permissionLevel: PermissionLevel): void;
}

const PERMISSION_RANK: Record<PermissionLevel, number> = {
  everyone: 0,
  follower: 1,
  subscriber: 2,
  moderator: 3,
  broadcaster: 4,
};

/** How long (ms) to suppress duplicate command executions from the same author+content. */
const DEDUP_WINDOW_MS = 2_000;

/**
 * Central command dispatcher. Responsibilities:
 *  1. Resolve the sender's permission level from their chat badges.
 *  2. Deduplicate: if the same author sends the same content within DEDUP_WINDOW_MS
 *     (e.g. a viewer present in two simultaneous YT streams), only the first fires.
 *  3. Fan out to every registered module in registration order.
 */
export class CommandDispatcher {
  private readonly modules: CommandModule[] = [];
  private readonly recentKeys = new Map<string, number>();

  register(module: CommandModule): void {
    this.modules.push(module);
  }

  dispatch(message: ChatMessage): void {
    const key = this.dedupKey(message);
    const now = Date.now();

    if (this.isDuplicate(key, now)) return;
    this.recentKeys.set(key, now);
    this.pruneOldKeys(now);

    const permissionLevel = this.resolvePermission(message);
    for (const mod of this.modules) {
      mod.handle(message, permissionLevel);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private dedupKey(message: ChatMessage): string {
    // Same author + same first 60 chars of content → considered duplicate
    return `${message.author}:${message.content.slice(0, 60)}`;
  }

  private isDuplicate(key: string, now: number): boolean {
    const last = this.recentKeys.get(key);
    return last !== undefined && now - last < DEDUP_WINDOW_MS;
  }

  private pruneOldKeys(now: number): void {
    for (const [key, ts] of this.recentKeys) {
      if (now - ts > DEDUP_WINDOW_MS * 2) this.recentKeys.delete(key);
    }
  }

  /**
   * Derives the sender's effective PermissionLevel from their badge list.
   * Handles both Twitch badge strings (e.g. "moderator/1", "subscriber/3")
   * and YouTube badge strings ("member", "moderator").
   */
  private resolvePermission(message: ChatMessage): PermissionLevel {
    const badges = message.badges ?? [];

    const rank = (level: PermissionLevel) => PERMISSION_RANK[level];
    let best: PermissionLevel = 'everyone';

    for (const badge of badges) {
      const b = badge.toLowerCase();
      let level: PermissionLevel | null = null;

      if (b === 'broadcaster') level = 'broadcaster';
      else if (b.startsWith('moderator')) level = 'moderator';
      else if (b.startsWith('subscriber') || b === 'member') level = 'subscriber';
      else if (b === 'vip') level = 'subscriber'; // treat VIPs as subscribers

      if (level && rank(level) > rank(best)) best = level;
    }

    return best;
  }
}
