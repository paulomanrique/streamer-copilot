import type { ChatMessage, PlatformId, StreamEvent, TikTokConnectionStatus } from '../../shared/types.js';
import type { PlatformCapabilities } from '../../shared/moderation.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';
import { TikTokChatAdapter, type TikTokAdapterOptions } from './adapter.js';

/**
 * Aggregates per-account TikTokChatAdapter instances behind a single
 * `PlatformChatAdapter` registration. Mirrors the Twitch multi-adapter
 * pattern: each account owns its own underlying connection; the wrapper
 * fans out messages/events to listeners.
 *
 * Why a wrapper instead of one adapter that joins multiple lives: the
 * `tiktok-live-connector` lib opens one WebSocket per host. Sharing a
 * single adapter across hosts is impossible — each host needs its own
 * client.
 */
export interface TikTokAccountOptions extends Omit<TikTokAdapterOptions, 'onStatusChange'> {
  accountId: string;
  /** Per-account status callback — the wrapper aggregates these. */
  onStatusChange?: (status: TikTokConnectionStatus) => void;
}

interface ChildEntry {
  adapter: TikTokChatAdapter;
  detachers: Array<() => void>;
}

export class TikTokMultiChatAdapter implements PlatformChatAdapter {
  readonly platform: PlatformId = 'tiktok';
  readonly capabilities: PlatformCapabilities = READ_ONLY_CAPABILITIES;

  private readonly messageHandlers = new Set<(message: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(event: StreamEvent) => void>();
  private readonly children = new Map<string, ChildEntry>();

  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onEvent(handler: (event: StreamEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /** Connect is a no-op — children connect on `addAccount`. */
  async connect(): Promise<void> {
    // Wrapper is registered with chatService once; child connects flow
    // through `addAccount` as accounts come online.
  }

  async disconnect(): Promise<void> {
    const entries = Array.from(this.children.entries());
    for (const [accountId] of entries) {
      await this.removeAccount(accountId);
    }
  }

  async sendMessage(_content: string): Promise<void> {
    // TikTok adapters are read-only — keep parity with the base adapter.
    throw new Error('TikTok does not support sending messages from this adapter (read-only)');
  }

  hasConnectedChild(): boolean {
    return this.children.size > 0;
  }

  /**
   * Spawns a TikTok child for one account. Re-entrant — calling again with
   * the same accountId tears down the previous child first.
   */
  async addAccount(options: TikTokAccountOptions): Promise<void> {
    const { accountId, ...adapterOptions } = options;
    if (this.children.has(accountId)) {
      await this.removeAccount(accountId);
    }
    const adapter = new TikTokChatAdapter(adapterOptions);
    const detachers: Array<() => void> = [
      adapter.onMessage((message) => {
        for (const handler of this.messageHandlers) handler(message);
      }),
      adapter.onEvent((event) => {
        for (const handler of this.eventHandlers) handler(event);
      }),
    ];
    this.children.set(accountId, { adapter, detachers });
    // The TikTok adapter throws when the user is offline; the caller is
    // expected to handle the watching/retry loop.
    await adapter.connect();
  }

  async removeAccount(accountId: string): Promise<void> {
    const entry = this.children.get(accountId);
    if (!entry) return;
    for (const detach of entry.detachers) detach();
    try { await entry.adapter.disconnect(); } catch { /* swallow — best-effort teardown */ }
    this.children.delete(accountId);
  }

  hasAccount(accountId: string): boolean {
    return this.children.has(accountId);
  }
}
