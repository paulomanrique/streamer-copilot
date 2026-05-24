import type {
  ChatMessage,
  MinSubscriberTier,
  PermissionLevel,
  PlatformId,
  SubscriberTierCatalog,
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
 * Resolução padrão a partir da forma comum do papel. Adapters podem
 * usar como default ou aplicar regras próprias antes de chamar.
 * Maior precedência primeiro: broadcaster > moderator > vip > subscriber > follower.
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
 * Extensão tier-aware do gate de permissão. Aplica-se quando o nível resolvido
 * é `'subscriber'` e o comando declarou um `minSubscriberTier` para a plataforma
 * de origem da mensagem. Para os demais níveis (mod/vip/broadcaster/everyone)
 * cai no comportamento de `isPermissionAllowed`.
 *
 * Comparação por ordem no catálogo (1 = mais baixo). Quando o tier requerido
 * não existe no catálogo, o gate fecha (deny) — proteção contra catálogo
 * stale ou typos. Quando o tier do usuário não está catalogado, também fecha
 * (deny) — o scraper alimenta o catálogo via `upsertScraped`, então em fluxo
 * normal o tier estaria presente.
 */
export function isCommandAllowedWithTier(
  allowedLevels: PermissionLevel[],
  minSubscriberTier: MinSubscriberTier | undefined,
  actualLevel: PermissionLevel,
  platform: PlatformId,
  subscriberTier: string | undefined,
  catalog: SubscriberTierCatalog,
): boolean {
  if (!isPermissionAllowed(allowedLevels, actualLevel)) return false;
  if (actualLevel !== 'subscriber') return true;
  const required = minSubscriberTier?.[platform];
  if (!required) return true;
  const list = catalog.byPlatform[platform] ?? [];
  const requiredEntry = list.find((e) => e.id === required);
  if (!requiredEntry) return false;
  const actualEntry = subscriberTier ? list.find((e) => e.id === subscriberTier) : undefined;
  if (!actualEntry) return false;
  return actualEntry.order >= requiredEntry.order;
}
