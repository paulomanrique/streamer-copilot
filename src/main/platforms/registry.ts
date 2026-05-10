import type { PlatformAccount, PlatformAccountConnectionStatus } from '../../shared/types.js';

/**
 * Main-process counterpart to the renderer's `src/renderer/platforms/registry.ts`.
 *
 * Each platform registers a runtime here with the four IPC-driven operations
 * the accounts API exposes (connect / disconnect / get status / purge), plus a
 * status-change subscription so the UI gets notified when something changes
 * outside an explicit IPC call (auto-reconnect, runtime errors, etc.).
 *
 * The accounts:* IPC handlers in app-context dispatch through this registry;
 * adding a new platform means writing a new provider entry, never editing the
 * core handlers.
 */
export interface MainPlatformProvider {
  readonly providerId: string;

  /** Current connection state of `account`. May read provider-specific state. */
  getStatus(account: PlatformAccount): Promise<PlatformAccountConnectionStatus> | PlatformAccountConnectionStatus;

  /** Connect this account. Must throw on failure. Idempotent: re-connecting a
   *  connected account is allowed (typically re-applies credentials). */
  connect(account: PlatformAccount): Promise<void>;

  /** Disconnect this account. Idempotent: safe to call when already disconnected.
   *  For platforms where disconnect is a flag flip rather than a hard
   *  teardown (e.g. YouTube channel monitoring), this method updates the
   *  flag and lets the underlying machinery converge. */
  disconnect(account: PlatformAccount): Promise<void>;

  /** Wipe persisted credentials/settings tied to this account. Called on
   *  delete so the next launch's backfill does not recreate the account. */
  purgeStores(account: PlatformAccount): Promise<void>;

  /** Subscribe to internal status changes for this provider. The listener is
   *  invoked whenever any account of this provider may have transitioned;
   *  callers re-query getStatus per account. Returns an unsubscribe fn. */
  onStatusChange(listener: () => void): () => void;
}

export class MainPlatformRegistry {
  private readonly providers = new Map<string, MainPlatformProvider>();

  register(provider: MainPlatformProvider): void {
    this.providers.set(provider.providerId, provider);
  }

  get(providerId: string): MainPlatformProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  list(): MainPlatformProvider[] {
    return [...this.providers.values()];
  }
}
