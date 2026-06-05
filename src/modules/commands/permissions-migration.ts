import type { PermissionEntry, PermissionRoleId, PlatformId } from '../../shared/types.js';

/**
 * Plataformas que recebem a expansão de PermissionLevel[] legado quando um
 * comando é carregado pela primeira vez no novo formato. Mantida hardcoded
 * por ser uma lista de migração — o objetivo é gerar entries equivalentes
 * ao comportamento pré-rework (qualquer usuário daquele nível, em qualquer
 * plataforma, passava). Adicionar uma plataforma nova ao app não precisa
 * mexer aqui: usuários daquela plataforma simplesmente terão `everyone` por
 * default se a configuração antiga for genérica.
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
 * Aceita o `permissions` cru do JSON e devolve um `PermissionEntry[]` válido.
 *
 * Casos:
 *   - Array de strings (formato legado, ex: `['everyone', 'moderator']`):
 *     expande cada nível para uma entry `platform-role` em cada plataforma
 *     conhecida. Preserva o comportamento "qualquer plataforma".
 *   - Array de objetos com a forma `{ kind: 'platform-role' | 'list', ... }`
 *     (formato novo): passa adiante, filtrando entries malformadas.
 *   - Qualquer outra coisa: retorna `[]` (chamador decide o que fazer).
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
