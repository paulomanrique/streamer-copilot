import type { ChatMessage, PlatformId, PlatformLinkStatus, StreamEvent } from '../../shared/types.js';
import type { PlatformCapabilities } from '../../shared/moderation.js';
import { READ_ONLY_CAPABILITIES, type PlatformChatAdapter } from '../base.js';
import { XChatAdapter, type XAdapterOptions } from './adapter.js';

/**
 * Aggregates per-account XChatAdapter instances behind a single
 * `PlatformChatAdapter` registration. Mirrors the TikTok multi-adapter: each
 * account owns its own broadcast connection; the wrapper fans messages/events
 * out to listeners. Read-only.
 */
export interface XAccountOptions extends Omit<XAdapterOptions, 'onStatusChange'> {
  accountId: string;
  onStatusChange?: (status: PlatformLinkStatus) => void;
}

interface ChildEntry {
  adapter: XChatAdapter;
  detachers: Array<() => void>;
}

export class XMultiChatAdapter implements PlatformChatAdapter {
  readonly platform: PlatformId = 'x';
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

  /** No-op — children connect on `addAccount`. */
  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {
    for (const [accountId] of Array.from(this.children.entries())) {
      await this.removeAccount(accountId);
    }
  }

  async sendMessage(_content: string): Promise<void> {
    throw new Error('X broadcast chat is read-only — sending is not supported');
  }

  hasConnectedChild(): boolean {
    return this.children.size > 0;
  }

  hasAccount(accountId: string): boolean {
    return this.children.has(accountId);
  }

  /** Spawns an X child for one account. Re-entrant — re-adding tears down first. */
  async addAccount(options: XAccountOptions): Promise<void> {
    const { accountId, ...adapterOptions } = options;
    if (this.children.has(accountId)) {
      await this.removeAccount(accountId);
    }
    const adapter = new XChatAdapter(adapterOptions);
    const detachers: Array<() => void> = [
      adapter.onMessage((message) => {
        for (const handler of this.messageHandlers) handler(message);
      }),
      adapter.onEvent((event) => {
        for (const handler of this.eventHandlers) handler(event);
      }),
    ];
    this.children.set(accountId, { adapter, detachers });
    // Throws when no live broadcast can be resolved; the caller handles retry.
    await adapter.connect();
  }

  async removeAccount(accountId: string): Promise<void> {
    const entry = this.children.get(accountId);
    if (!entry) return;
    for (const detach of entry.detachers) detach();
    try { await entry.adapter.disconnect(); } catch { /* best-effort teardown */ }
    this.children.delete(accountId);
  }
}
