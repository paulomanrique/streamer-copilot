import type { PermissionEntry, PermissionRoleId, PlatformId } from '../../shared/types.js';

/**
 * Platforms that receive the legacy `PermissionLevel[]` expansion when a
 * command is loaded into the new shape for the first time. Hardcoded on
 * purpose — the goal is to produce entries equivalent to the pre-rework
 * behavior (any user of that level, on any platform, used to pass). Adding
 * a new platform later doesn't require touching this list: users on that
 * platform just default to `everyone` if the legacy config was generic.
 */
const LEGACY_EXPANSION_PLATFORMS: PlatformId[] = ['twitch', 'youtube', 'youtube-api', 'kick', 'tiktok'];

const LEGACY_LEVELS = new Set<PermissionRoleId>([
  'everyone',
  'follower',
  'subscriber',
  'vip',
  'moderator',
  'broadcaster',
]);

/**
 * Accepts the raw `permissions` value from the JSON store and returns a
 * valid `PermissionEntry[]`.
 *
 * Cases:
 *   - Array of strings (legacy shape, e.g. `['everyone', 'moderator']`):
 *     expand each level to a `platform-role` entry across every known
 *     platform. Preserves the "any platform" semantics of the old model.
 *   - Array of objects shaped `{ kind: 'platform-role' | 'list', ... }`
 *     (new shape): pass through, dropping malformed entries.
 *   - Anything else: returns `[]` (caller decides what to do).
 */
export function migratePermissions(raw: unknown): PermissionEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: PermissionEntry[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && LEGACY_LEVELS.has(item as PermissionRoleId)) {
      for (const platform of LEGACY_EXPANSION_PLATFORMS) {
        out.push({ kind: 'platform-role', platform, role: item as PermissionRoleId });
      }
      continue;
    }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      if (obj.kind === 'platform-role' && typeof obj.platform === 'string' && typeof obj.role === 'string') {
        out.push({ kind: 'platform-role', platform: obj.platform, role: obj.role as PermissionRoleId });
      } else if (obj.kind === 'list' && typeof obj.listId === 'string') {
        out.push({ kind: 'list', listId: obj.listId });
      }
    }
  }
  return out;
}
