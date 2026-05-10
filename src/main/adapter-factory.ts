import type { PlatformChatAdapter } from '../platforms/base.js';
import type { PlatformAccount } from '../shared/types.js';

export type AdapterFactory = (account: PlatformAccount) => PlatformChatAdapter | Promise<PlatformChatAdapter>;

const factories = new Map<string, AdapterFactory>();

export function registerAdapterFactory(providerId: string, factory: AdapterFactory): void {
  factories.set(providerId, factory);
}

export function getAdapterFactory(providerId: string): AdapterFactory | null {
  return factories.get(providerId) ?? null;
}

export async function createAdapterFor(account: PlatformAccount): Promise<PlatformChatAdapter> {
  const factory = factories.get(account.providerId);
  if (!factory) throw new Error(`No adapter factory registered for provider "${account.providerId}"`);
  return Promise.resolve(factory(account));
}

export function listRegisteredProviders(): string[] {
  return [...factories.keys()];
}
