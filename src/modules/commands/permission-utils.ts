import type { ChatMessage, PermissionLevel } from '../../shared/types.js';

export const PERMISSION_RANK: Record<PermissionLevel, number> = {
  everyone: 0,
  follower: 1,
  subscriber: 2,
  vip: 3,
  moderator: 4,
  broadcaster: 5,
};

export function resolvePermissionLevel(message: ChatMessage): PermissionLevel {
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

export function isPermissionAllowed(
  allowedLevels: PermissionLevel[],
  actualLevel: PermissionLevel,
): boolean {
  return allowedLevels.some((l) => PERMISSION_RANK[actualLevel] >= PERMISSION_RANK[l]);
}
