import type { ComponentType } from 'react';

import type { PlatformAccount } from '../../shared/types.js';

export interface AuthStepProps {
  /** Current draft of providerData being built up by the wizard. */
  draft: Record<string, unknown>;
  /** Update one or more fields of the providerData draft. */
  updateDraft: (patch: Record<string, unknown>) => void;
  /** Update the current channel value (handle / username / slug — provider-specific). */
  setChannel: (channel: string) => void;
  /** Current channel value. */
  channel: string;
  /** Optional override for the account label. The wizard's `defaultLabel`
   *  fallback runs only when the AuthStep doesn't provide one, so OAuth flows
   *  that already know the channel title (e.g. YouTube API) can pass it
   *  through here instead of synthesizing one from the channel id. */
  setLabel?: (label: string) => void;
  /** Surfaces an error to the wizard footer. */
  setError: (message: string | null) => void;
}

export interface PlatformProvider {
  id: string;
  displayName: string;
  /** Tailwind border accent (eg "border-l-purple-500") used on the account card. */
  accentClass: string;
  supportsMultipleAccounts: boolean;
  /**
   * The wizard renders this component after the user picks the provider.
   * It collects whatever credentials/inputs the provider needs (OAuth token,
   * username, channel, etc.) and stores them in `draft` via `updateDraft`.
   */
  AuthStep: ComponentType<AuthStepProps>;
  /** Renders the inline card for an existing connected account (status, controls). */
  AccountCard?: ComponentType<{ account: PlatformAccount; onDelete: () => void; onConnect: () => void; onDisconnect: () => void }>;
  /** Returns null if valid, otherwise an error message. */
  validate(channel: string, providerData: Record<string, unknown>): string | null;
  /** Default label suggestion when user hasn't typed one. */
  defaultLabel(channel: string): string;
  /**
   * Optional re-login flow for an existing account. Re-runs OAuth or opens the
   * login popup, and (if the provider stores credentials in providerData)
   * patches the account so subsequent connect calls use the fresh token.
   * Resolves when the login window closes / OAuth completes. The optional
   * `message` is shown to the user instead of the generic success label.
   */
  login?(account: PlatformAccount): Promise<{ message?: string } | void>;
}

const providers = new Map<string, PlatformProvider>();

export function registerPlatformProvider(provider: PlatformProvider): void {
  providers.set(provider.id, provider);
}

export function listPlatformProviders(): PlatformProvider[] {
  // Sort alphabetically by displayName so the wizard dropdown is predictable
  // regardless of registration order.
  return [...providers.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  );
}

export function getPlatformProvider(providerId: string): PlatformProvider | null {
  return providers.get(providerId) ?? null;
}
