import type { ChatMessage, PermissionLevel } from '../../shared/types.js';
import { resolvePermissionLevel } from './permission-utils.js';

/**
 * A command handler module. Each module (sound, voice, future ones) registers here.
 * The dispatcher calls every handler for every incoming message and each handler
 * decides on its own whether the message matches its triggers.
 */
export interface CommandModule {
  readonly name: string;
  handle(message: ChatMessage, permissionLevel: PermissionLevel): void;
}

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
      try {
        mod.handle(message, permissionLevel);
      } catch {
        // Swallow per-module errors so one failing command never breaks the pipeline
      }
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

  private resolvePermission(message: ChatMessage): PermissionLevel {
    return resolvePermissionLevel(message);
  }
}
