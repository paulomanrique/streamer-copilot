import type { ChatMessage, PlatformId, StreamEvent, TwitchConnectionStatus } from '../../shared/types.js';
import type { ModerationApi, PlatformCapabilities } from '../../shared/moderation.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';
import { TwitchChatAdapter, type TwitchAdapterOptions } from './adapter.js';

/**
 * Aggregates one `TwitchChatAdapter` per connected account behind a single
 * `PlatformChatAdapter` registration. Each child owns one tmi.js client (so it
 * can authenticate as its own bot identity and join its own channel); the
 * wrapper just fans messages/events out to listeners and routes moderation
 * back to whichever child holds the message.
 *
 * Why a wrapper instead of a multi-channel single adapter: tmi.js needs a
 * single login per client, and Twitch accounts in this app each carry their
 * own oauth token + identity in `providerData`. Sharing one client across
 * accounts would force one identity to read/post on someone else's channel.
 */
export interface TwitchAccountOptions extends TwitchAdapterOptions {
  /** Stable id used to de-duplicate across re-connects. */
  accountId: string;
}

interface ChildEntry {
  adapter: TwitchChatAdapter;
  detachers: Array<() => void>;
}

export class TwitchMultiChatAdapter implements PlatformChatAdapter {
  readonly platform: PlatformId = 'twitch';

  private readonly messageHandlers = new Set<(message: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(event: StreamEvent) => void>();
  private readonly children = new Map<string, ChildEntry>();
  /** Twitch IRC message id → accountId. Lets moderation pick the right child. */
  private readonly messageOwners = new Map<string, string>();

  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onEvent(handler: (event: StreamEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /** Aggregate capabilities — exposes any feature supported by at least one child. */
  get capabilities(): PlatformCapabilities {
    let merged = { ...READ_ONLY_CAPABILITIES };
    for (const { adapter } of this.children.values()) {
      const c = adapter.capabilities;
      for (const key of Object.keys(merged) as Array<keyof PlatformCapabilities>) {
        if (c[key]) merged = { ...merged, [key]: true };
      }
    }
    return merged;
  }

  /** Moderation routes per-call: delete uses messageId→child mapping, user
   *  actions delegate to the first child with a moderation API (typical case
   *  is a single Twitch account; multi-channel ban semantics are best handled
   *  per-channel in the Twitch UI itself). */
  get moderation(): ModerationApi | undefined {
    const anyMod = Array.from(this.children.values()).some(({ adapter }) => adapter.moderation);
    if (!anyMod) return undefined;
    return {
      deleteMessage: (messageId) => this.routeDelete(messageId),
      banUser: (userId, reason) => this.routeBan(userId, reason),
      unbanUser: (userId) => this.routeUnban(userId),
      timeoutUser: (userId, durationSeconds, reason) => this.routeTimeout(userId, durationSeconds, reason),
    };
  }

  /** Connect is a no-op — children connect on `addAccount`. */
  async connect(): Promise<void> {
    // The wrapper is registered with chatService once; child connects happen
    // as accounts come online via `addAccount`.
  }

  async disconnect(): Promise<void> {
    const entries = Array.from(this.children.entries());
    for (const [accountId] of entries) {
      await this.removeAccount(accountId);
    }
  }

  async sendMessage(content: string): Promise<void> {
    // Without a per-call account hint, send through the first child that
    // accepts. Most setups have a single Twitch identity, so this matches
    // intent. Targeted multi-account send would need a richer chat-input UI.
    for (const { adapter } of this.children.values()) {
      try {
        await adapter.sendMessage(content);
        return;
      } catch {
        // try next child
      }
    }
    throw new Error('No connected Twitch adapter to send through');
  }

  async addAccount(options: TwitchAccountOptions): Promise<void> {
    const { accountId, ...adapterOptions } = options;
    if (this.children.has(accountId)) {
      await this.removeAccount(accountId);
    }
    const adapter = new TwitchChatAdapter(adapterOptions);
    const detachers: Array<() => void> = [
      adapter.onMessage((message) => {
        if (message.platformMessageId) {
          this.messageOwners.set(message.platformMessageId, accountId);
        } else if (message.id) {
          // Twitch sets ChatMessage.id from the IRC tag id (see adapter.ts:319),
          // so it's already the platform-native message id we need for delete.
          this.messageOwners.set(message.id, accountId);
        }
        for (const handler of this.messageHandlers) handler(message);
      }),
      adapter.onEvent((event) => {
        for (const handler of this.eventHandlers) handler(event);
      }),
    ];
    this.children.set(accountId, { adapter, detachers });
    await adapter.connect();
  }

  async removeAccount(accountId: string): Promise<void> {
    const entry = this.children.get(accountId);
    if (!entry) return;
    for (const detach of entry.detachers) detach();
    try { await entry.adapter.disconnect(); } catch { /* swallow — best-effort teardown */ }
    this.children.delete(accountId);
    for (const [msgId, owner] of this.messageOwners) {
      if (owner === accountId) this.messageOwners.delete(msgId);
    }
  }

  /** True if at least one child is currently connected (used for global status indicators). */
  hasConnectedChild(): boolean {
    return this.children.size > 0;
  }

  /** Returns the first child adapter — for legacy code paths that still
   *  expect a singleton (`wireTwitchModeration`, badge loaders, etc.). */
  getAccount(accountId: string): TwitchChatAdapter | null {
    return this.children.get(accountId)?.adapter ?? null;
  }

  // ── Moderation routing ─────────────────────────────────────────────────

  private async routeDelete(messageId: string): Promise<void> {
    const accountId = this.messageOwners.get(messageId);
    const target = (accountId ? this.children.get(accountId) : null)?.adapter
      ?? this.firstWithModeration();
    if (!target?.moderation) throw new Error('No connected Twitch adapter with moderation');
    await target.moderation.deleteMessage(messageId);
  }

  private async routeBan(userId: string, reason?: string): Promise<void> {
    const target = this.firstWithModeration();
    if (!target?.moderation) throw new Error('No connected Twitch adapter with moderation');
    await target.moderation.banUser(userId, reason);
  }

  private async routeUnban(userId: string): Promise<void> {
    const target = this.firstWithModeration();
    if (!target?.moderation) throw new Error('No connected Twitch adapter with moderation');
    await target.moderation.unbanUser(userId);
  }

  private async routeTimeout(userId: string, durationSeconds: number, reason?: string): Promise<void> {
    const target = this.firstWithModeration();
    if (!target?.moderation) throw new Error('No connected Twitch adapter with moderation');
    await target.moderation.timeoutUser(userId, durationSeconds, reason);
  }

  private firstWithModeration(): TwitchChatAdapter | null {
    for (const { adapter } of this.children.values()) {
      if (adapter.moderation) return adapter;
    }
    return null;
  }
}

/**
 * Captures all the per-account fields the multi-adapter needs to spin up a
 * child. Status callback and `accountId` are mandatory; everything else is
 * passed straight to the child adapter.
 */
export type TwitchAccountSpawn = TwitchAccountOptions & {
  onStatusChange?: (status: TwitchConnectionStatus) => void;
};
