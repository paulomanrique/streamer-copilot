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

/** Visual identity of a platform — colors, icons, classes consumed by every
 *  renderer component that needs to depict it (chat badges, viewer cards,
 *  live-link buttons, status bar). One source of truth: see AGENTS.md
 *  "Platform-agnostic UI" rules.
 *
 *  Why the class strings are full literals (not template-built): Tailwind's
 *  JIT scans source for class-like patterns. Building strings like
 *  `bg-${color}-500/20` makes Tailwind miss them and the styles silently
 *  disappear. Listing the full literals here keeps every class shippable. */
export interface PlatformVisuals {
  /** SVG `d` for a 24×24 viewBox glyph. */
  icon: string;
  /** Chat row + chat badge styling (ChatFeed). */
  badge: {
    bg: string;
    text: string;
    rowBorder: string;
  };
  /** Solid Tailwind accent class (no opacity). Used by the status bar dot
   *  when connected, and anywhere else a 1-class solid swatch is needed. */
  accentBg: string;
  /** Activity-log banner border color (EventBanner full-banner variant).
   *  rgba string because the banner border opacity is computed inline. */
  bannerBorderColor: string;
  /** Viewer card on the dashboard (ObsStatsPanel). */
  card: {
    classes: string;
    metaClass: string;
  };
  /** Live-link button in the header drawer (AppHeader). */
  liveLink: {
    color: string;
    border: string;
    btnBg: string;
  };
}

/** Per-platform behavior the chat row consults — kept in the provider so
 *  adding a new platform is a single file change. */
export interface PlatformBehavior {
  /** What this platform calls its "supporter" tier badge. The chat row reads
   *  this to decide which IRC/api badge id earns the gold star — YouTube
   *  drivers use 'member', Twitch/Kick/TikTok use 'subscriber'. */
  subscriberBadge: 'member' | 'subscriber';
  /** Whether author names render with a leading `@` (YouTube handles do,
   *  Twitch nicknames don't). */
  authorAtPrefix: boolean;
  /** Builds the public profile URL for a given handle/username. Used by the
   *  chat row to link author names to their platform profile. Returns `''`
   *  when no canonical URL is known. */
  profileUrl(handle: string): string;
  /** Whether incoming chat messages already carry rendered badge image URLs
   *  on `message.badgeUrls` (Twitch via tmi.js). When false the chat row
   *  shows a synthesized avatar slot instead, and renders a textual `MOD`
   *  label for moderators since no badge image is available. */
  hasNativeBadgeUrls: boolean;
}

export interface PlatformProvider extends PlatformVisuals, PlatformBehavior {
  id: string;
  displayName: string;
  /** Tailwind border accent (eg "border-l-purple-500") used on the account card. */
  accentClass: string;
  supportsMultipleAccounts: boolean;
  /** When true the provider is registered for visual purposes only (status bar,
   *  filter chips, chat badges) but is not addable through the wizard — used
   *  for "slot" platforms like the YouTube scraper's vertical slot. */
  hideFromWizard?: boolean;
  /**
   * The wizard renders this component after the user picks the provider.
   * It collects whatever credentials/inputs the provider needs (OAuth token,
   * username, channel, etc.) and stores them in `draft` via `updateDraft`.
   * Wizard-only providers may omit it together with `hideFromWizard: true`.
   */
  AuthStep?: ComponentType<AuthStepProps>;
  /** Renders the inline card for an existing connected account (status, controls). */
  AccountCard?: ComponentType<{ account: PlatformAccount; onDelete: () => void; onConnect: () => void; onDisconnect: () => void }>;
  /** Returns null if valid, otherwise an error message. */
  validate?(channel: string, providerData: Record<string, unknown>): string | null;
  /** Default label suggestion when user hasn't typed one. */
  defaultLabel?(channel: string): string;
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

/** Every registered provider — for status bars, filter chips, badge lookups,
 *  anything that should know about all platforms. Stable insertion order. */
export function listPlatformProviders(): PlatformProvider[] {
  return [...providers.values()];
}

/** Providers users can pick in the "Add network" wizard — alphabetically
 *  sorted, excludes `hideFromWizard` entries. */
export function listWizardPlatformProviders(): PlatformProvider[] {
  return listPlatformProviders()
    .filter((p) => !p.hideFromWizard && p.AuthStep)
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
    );
}

export function getPlatformProvider(providerId: string): PlatformProvider | null {
  return providers.get(providerId) ?? null;
}

/** Generic fallback for unknown platform ids — gray, no icon. Mis-styling an
 *  unknown platform as e.g. Twitch's purple tends to look intentional and
 *  hide the bug. Gray makes the gap obvious. */
const FALLBACK_PROVIDER: PlatformProvider = {
  id: 'unknown',
  displayName: 'Unknown',
  accentClass: 'border-l-gray-600',
  supportsMultipleAccounts: false,
  hideFromWizard: true,
  icon: '',
  badge: {
    bg: 'bg-gray-500/20',
    text: 'text-gray-300',
    rowBorder: 'border-gray-500/20',
  },
  accentBg: 'bg-gray-500',
  bannerBorderColor: 'rgba(107,114,128,0.2)',
  card: {
    classes: 'bg-gray-500/10 border-gray-500/20 text-gray-300',
    metaClass: 'text-gray-400',
  },
  liveLink: {
    color: 'text-gray-400',
    border: 'border-gray-500/30',
    btnBg: 'bg-gray-600/30 hover:bg-gray-600/50 text-gray-300',
  },
  subscriberBadge: 'subscriber',
  authorAtPrefix: false,
  profileUrl: () => '',
  hasNativeBadgeUrls: false,
};

/** Returns the provider matching `id`, or a gray fallback when the id is
 *  unknown. Callers that need visuals/behavior never need to null-check. */
export function getPlatformProviderOrFallback(providerId: string): PlatformProvider {
  return providers.get(providerId) ?? FALLBACK_PROVIDER;
}

/** Contextual display name. Every id uses its registry `displayName`
 *  verbatim — concurrent streams from the same provider are disambiguated
 *  via the per-message `streamLabel` field, not by their platform id. */
export function getPlatformDisplayName(id: string, _connectedPlatforms: readonly string[]): string {
  return getPlatformProviderOrFallback(id).displayName;
}
