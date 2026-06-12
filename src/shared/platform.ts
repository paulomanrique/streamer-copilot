/**
 * Common shape of the message author's role on any platform.
 *
 * Each adapter fills in the booleans that apply to its platform and uses
 * `extras` for rich details (sub tier, gift rank, membership years).
 * The core never reads from `extras` — only platform-specific UIs do.
 *
 * This keeps the contract plug-and-play: a third-party adapter implements
 * this shape without editing shared types.
 */
export interface PlatformRole {
  readonly broadcaster?: boolean;
  readonly moderator?: boolean;
  readonly vip?: boolean;
  readonly subscriber?: boolean;
  readonly follower?: boolean;
  /** Membership tier identifier (e.g. '1'/'2'/'3' on Twitch, the level name on
   *  YouTube). Opaque to the core — only the permission resolver compares it
   *  against an ordered catalog. */
  readonly subscriberTier?: string;
  readonly extras?: Record<string, unknown>;
}

/**
 * Rich event metadata (superchat amount, gift count, etc.).
 * `kind` is a free-form string — adapters can coin new kinds without
 * editing this file.
 */
export interface ChatMessageMetadata {
  readonly kind: string;
  readonly [field: string]: unknown;
}
