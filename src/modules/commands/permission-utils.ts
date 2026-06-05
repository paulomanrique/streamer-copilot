import type {
  ChatMessage,
  PermissionEntry,
  PermissionLevel,
  PermissionRoleId,
  UserList,
} from '../../shared/types.js';
import type { PlatformRole } from '../../shared/platform.js';

export const PERMISSION_RANK: Record<PermissionLevel, number> = {
  everyone: 0,
  follower: 1,
  subscriber: 2,
  vip: 3,
  moderator: 4,
  broadcaster: 5,
};

export function resolvePermissionLevel(message: ChatMessage): PermissionLevel {
  if (message.unifiedLevel) return message.unifiedLevel;
  if (message.role) return resolveFromRole(message.role);

  const badges = message.badges ?? [];
  let best: PermissionLevel = 'everyone';
  for (const badge of badges) {
    const b = badge.toLowerCase();
    let level: PermissionLevel | null = null;
    if (b === 'broadcaster') level = 'broadcaster';
    else if (b.startsWith('moderator')) level = 'moderator';
    else if (b.startsWith('vip')) level = 'vip';
    else if (b.startsWith('subscriber') || b === 'member') level = 'subscriber';
    else if (b === 'follower') level = 'follower';
    if (level && PERMISSION_RANK[level] > PERMISSION_RANK[best]) best = level;
  }
  return best;
}

/**
 * Default resolution from the common role shape. Adapters can use it as a
 * baseline or apply their own rules before calling.
 * Highest precedence first: broadcaster > moderator > vip > subscriber > follower.
 */
export function resolveFromRole(role: PlatformRole): PermissionLevel {
  if (role.broadcaster) return 'broadcaster';
  if (role.moderator) return 'moderator';
  if (role.vip) return 'vip';
  if (role.subscriber) return 'subscriber';
  if (role.follower) return 'follower';
  return 'everyone';
}

export function isPermissionAllowed(
  allowedLevels: PermissionLevel[],
  actualLevel: PermissionLevel,
): boolean {
  return allowedLevels.some((l) => PERMISSION_RANK[actualLevel] >= PERMISSION_RANK[l]);
}

/**
 * Evaluates a list of `PermissionEntry` against a message.
 *
 * OR semantics: the user passes if ANY entry matches. Per-entry rules:
 *   - `platform-role`: message's platform must match. For hierarchical
 *     roles (everyone, follower, subscriber, vip, moderator, broadcaster)
 *     the user's effective level must be >= the required one
 *     (`PERMISSION_RANK`). For `tier:<id>` roles, the user's
 *     `subscriberTier` must equal the id exactly (no hierarchy — picking
 *     Tier 2 does not implicitly grant Tier 3; the streamer adds every
 *     tier they want to allow).
 *   - `list`: the (platform, userId) pair from the message must appear in
 *     the referenced list's members. A missing list is silently ignored
 *     (the gate doesn't fail closed on a stale id — other entries may
 *     still let the user through).
 *
 * A message without `userId` never matches a list entry (no stable
 * identity). Role-based entries still work without it.
 */
export function isCommandAllowed(
  entries: PermissionEntry[],
  message: ChatMessage,
  userLists: UserList[],
): boolean {
  if (entries.length === 0) return false;
  const actualLevel = resolvePermissionLevel(message);
  for (const entry of entries) {
    if (entry.kind === 'platform-role') {
      if (entry.platform !== message.platform) continue;
      if (matchPlatformRole(entry.role, actualLevel, message.role?.subscriberTier)) return true;
    } else if (entry.kind === 'list') {
      const list = userLists.find((l) => l.id === entry.listId);
      if (!list) continue;
      if (!message.userId) continue;
      const hit = list.members.some(
        (m) => m.platform === message.platform && m.userId === message.userId,
      );
      if (hit) return true;
    }
  }
  return false;
}

function matchPlatformRole(
  role: PermissionRoleId,
  actualLevel: PermissionLevel,
  subscriberTier: string | undefined,
): boolean {
  if (typeof role === 'string' && role.startsWith('tier:')) {
    // Tier match is exact — no hierarchy. Only that exact tier passes.
    if (actualLevel !== 'subscriber' && actualLevel !== 'vip' && actualLevel !== 'moderator' && actualLevel !== 'broadcaster') {
      // Non-members can't pass a tier gate.
      return false;
    }
    if (!subscriberTier) return false;
    return subscriberTier === role.slice('tier:'.length);
  }
  // Classic hierarchical roles.
  const required = role as PermissionLevel;
  return PERMISSION_RANK[actualLevel] >= PERMISSION_RANK[required];
}
