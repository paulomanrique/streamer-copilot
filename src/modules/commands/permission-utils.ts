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
 * Avalia uma lista de `PermissionEntry` contra uma mensagem.
 *
 * Semântica OR: o usuário passa se QUALQUER entry casar. As semânticas
 * individuais:
 *   - `platform-role`: a plataforma da mensagem precisa bater. Para roles
 *     hierárquicos (everyone, follower, subscriber, vip, moderator, broadcaster)
 *     o nível efetivo do usuário precisa ser >= ao requerido (PERMISSION_RANK).
 *     Para roles do tipo `tier:<id>`, o `subscriberTier` do usuário precisa
 *     ser exatamente igual ao id (sem hierarquia — selecionar Tier 2 não
 *     libera Tier 3 automaticamente; o streamer adiciona cada tier que quer
 *     permitir).
 *   - `list`: o par (platform, userId) da mensagem precisa estar entre os
 *     membros da lista referenciada. Lista inexistente = ignorada (não trava
 *     o gate inteiro — outras entries ainda podem liberar).
 *
 * `userId` ausente na mensagem nunca casa entries de lista (sem identidade
 * estável). Roles que não exigem identidade continuam funcionando.
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
    // Tier exato — sem hierarquia. Só passa quem está exatamente nesse tier.
    if (actualLevel !== 'subscriber' && actualLevel !== 'vip' && actualLevel !== 'moderator' && actualLevel !== 'broadcaster') {
      // Não-membros não passam tier gate.
      return false;
    }
    if (!subscriberTier) return false;
    return subscriberTier === role.slice('tier:'.length);
  }
  // Roles hierárquicos clássicos.
  const required = role as PermissionLevel;
  return PERMISSION_RANK[actualLevel] >= PERMISSION_RANK[required];
}
