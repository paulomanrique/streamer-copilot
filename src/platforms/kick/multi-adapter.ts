import type { ChatMessage, KickConnectionStatus, PlatformId, StreamEvent } from '../../shared/types.js';
import type { ModerationApi, PlatformCapabilities } from '../../shared/moderation.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';
import { KickChatAdapter, type KickChatAdapterOptions } from './adapter.js';

/**
 * Aggregates per-account `KickChatAdapter` instances behind a single
 * `PlatformChatAdapter` registration. Each child opens its own popout
 * BrowserWindow against its own Kick channel, so we cannot share a single
 * adapter across channels — same constraint as Twitch (per-account identity)
 * and TikTok (per-host websocket).
 *
 * Moderation is per-channel on Kick: each child has its own OAuth token tied
 * to its channel. We track which child observed a given messageId so deletes
 * route back to the right channel.
 */
export interface KickAccountOptions extends KickChatAdapterOptions {
  accountId: string;
  /** Optional per-account status callback — wrapper aggregates these. */
  onStatusChange?: (status: KickConnectionStatus) => void;
}

interface ChildEntry {
  adapter: KickChatAdapter;
  detachers: Array<() => void>;
}

export class KickMultiChatAdapter implements PlatformChatAdapter {
  readonly platform: PlatformId = 'kick';

  private readonly messageHandlers = new Set<(message: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(event: StreamEvent) => void>();
  private readonly children = new Map<string, ChildEntry>();
  /** ChatMessage.id → accountId — lets moderation routing pick the right child. */
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
    // Wrapper is registered with chatService once; children come online via addAccount.
  }

  async disconnect(): Promise<void> {
    const entries = Array.from(this.children.entries());
    for (const [accountId] of entries) {
      await this.removeAccount(accountId);
    }
  }

  async sendMessage(content: string): Promise<void> {
    // No per-call account hint yet — try children in order. Most setups have a
    // single Kick identity, so this matches typical intent.
    for (const { adapter } of this.children.values()) {
      try {
        await adapter.sendMessage(content);
        return;
      } catch {
        // try next child
      }
    }
    throw new Error('No connected Kick adapter to send through');
  }

  async addAccount(options: KickAccountOptions): Promise<void> {
    const { accountId, onStatusChange: _onStatusChange, ...adapterOptions } = options;
    void _onStatusChange;
    if (this.children.has(accountId)) {
      await this.removeAccount(accountId);
    }
    const adapter = new KickChatAdapter(adapterOptions);
    const detachers: Array<() => void> = [
      adapter.onMessage((message) => {
        if (message.id) this.messageOwners.set(message.id, accountId);
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

  hasConnectedChild(): boolean {
    return this.children.size > 0;
  }

  hasAccount(accountId: string): boolean {
    return this.children.has(accountId);
  }

  /** Returns the child adapter — needed by app-context to call `setModeration`
   *  after wiring the per-channel KickModerationApi instance. */
  getAccount(accountId: string): KickChatAdapter | null {
    return this.children.get(accountId)?.adapter ?? null;
  }

  // ── Moderation routing ─────────────────────────────────────────────────

  private async routeDelete(messageId: string): Promise<void> {
    const accountId = this.messageOwners.get(messageId);
    const target = (accountId ? this.children.get(accountId) : null)?.adapter
      ?? this.firstWithModeration();
    if (!target?.moderation) throw new Error('No connected Kick adapter with moderation');
    await target.moderation.deleteMessage(messageId);
  }

  private async routeBan(userId: string, reason?: string): Promise<void> {
    const target = this.firstWithModeration();
    if (!target?.moderation) throw new Error('No connected Kick adapter with moderation');
    await target.moderation.banUser(userId, reason);
  }

  private async routeUnban(userId: string): Promise<void> {
    const target = this.firstWithModeration();
    if (!target?.moderation) throw new Error('No connected Kick adapter with moderation');
    await target.moderation.unbanUser(userId);
  }

  private async routeTimeout(userId: string, durationSeconds: number, reason?: string): Promise<void> {
    const target = this.firstWithModeration();
    if (!target?.moderation) throw new Error('No connected Kick adapter with moderation');
    await target.moderation.timeoutUser(userId, durationSeconds, reason);
  }

  private firstWithModeration(): KickChatAdapter | null {
    for (const { adapter } of this.children.values()) {
      if (adapter.moderation) return adapter;
    }
    return null;
  }
}
