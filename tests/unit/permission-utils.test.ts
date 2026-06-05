import { describe, expect, it } from 'vitest';

import {
  PERMISSION_RANK,
  isCommandAllowed,
  isPermissionAllowed,
  resolveFromRole,
  resolvePermissionLevel,
} from '../../src/modules/commands/permission-utils.js';
import { migratePermissions } from '../../src/modules/commands/permissions-migration.js';
import type { ChatMessage, PermissionEntry, UserList } from '../../src/shared/types.js';

function makeMessage(extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-1',
    platform: 'twitch',
    author: 'user',
    content: 'hi',
    badges: [],
    timestampLabel: '00:00',
    ...extra,
  };
}

describe('resolveFromRole', () => {
  it('returns broadcaster when role.broadcaster is true', () => {
    expect(resolveFromRole({ broadcaster: true, moderator: true })).toBe('broadcaster');
  });

  it('moderator beats vip + subscriber + follower', () => {
    expect(resolveFromRole({ moderator: true, vip: true, subscriber: true, follower: true })).toBe('moderator');
  });

  it('vip beats subscriber + follower', () => {
    expect(resolveFromRole({ vip: true, subscriber: true, follower: true })).toBe('vip');
  });

  it('subscriber beats follower', () => {
    expect(resolveFromRole({ subscriber: true, follower: true })).toBe('subscriber');
  });

  it('follower over everyone', () => {
    expect(resolveFromRole({ follower: true })).toBe('follower');
  });

  it('empty role → everyone', () => {
    expect(resolveFromRole({})).toBe('everyone');
  });

  it('extras are ignored', () => {
    expect(resolveFromRole({ extras: { subTier: 3 } })).toBe('everyone');
  });
});

describe('resolvePermissionLevel transition', () => {
  it('prefers message.unifiedLevel when present', () => {
    const message = makeMessage({ unifiedLevel: 'moderator', badges: [] });
    expect(resolvePermissionLevel(message)).toBe('moderator');
  });

  it('falls back to role when unifiedLevel missing', () => {
    const message = makeMessage({ role: { vip: true }, badges: [] });
    expect(resolvePermissionLevel(message)).toBe('vip');
  });

  it('falls back to badges when role + unifiedLevel missing', () => {
    const message = makeMessage({ badges: ['moderator/1'] });
    expect(resolvePermissionLevel(message)).toBe('moderator');
  });

  it('badges path still treats member as subscriber', () => {
    const message = makeMessage({ badges: ['member'] });
    expect(resolvePermissionLevel(message)).toBe('subscriber');
  });
});

describe('PERMISSION_RANK ordering', () => {
  it('matches the broadcaster > moderator > vip > subscriber > follower > everyone hierarchy', () => {
    expect(PERMISSION_RANK.broadcaster).toBeGreaterThan(PERMISSION_RANK.moderator);
    expect(PERMISSION_RANK.moderator).toBeGreaterThan(PERMISSION_RANK.vip);
    expect(PERMISSION_RANK.vip).toBeGreaterThan(PERMISSION_RANK.subscriber);
    expect(PERMISSION_RANK.subscriber).toBeGreaterThan(PERMISSION_RANK.follower);
    expect(PERMISSION_RANK.follower).toBeGreaterThan(PERMISSION_RANK.everyone);
  });

  it('isPermissionAllowed lets moderator pass an everyone gate', () => {
    expect(isPermissionAllowed(['everyone'], 'moderator')).toBe(true);
  });

  it('isPermissionAllowed blocks subscriber for moderator gate', () => {
    expect(isPermissionAllowed(['moderator'], 'subscriber')).toBe(false);
  });
});

describe('isCommandAllowed', () => {
  const NO_LISTS: UserList[] = [];

  it('lista vazia nunca passa', () => {
    expect(isCommandAllowed([], makeMessage(), NO_LISTS)).toBe(false);
  });

  it('platform-role só casa quando a plataforma da mensagem bate', () => {
    const entries: PermissionEntry[] = [
      { kind: 'platform-role', platform: 'youtube', role: 'everyone' },
    ];
    expect(isCommandAllowed(entries, makeMessage({ platform: 'twitch' }), NO_LISTS)).toBe(false);
    expect(isCommandAllowed(entries, makeMessage({ platform: 'youtube' }), NO_LISTS)).toBe(true);
  });

  it('roles hierárquicos: vip libera mod/broadcaster (hierarquia)', () => {
    const entries: PermissionEntry[] = [
      { kind: 'platform-role', platform: 'twitch', role: 'vip' },
    ];
    expect(isCommandAllowed(entries, makeMessage({ role: { vip: true } }), NO_LISTS)).toBe(true);
    expect(isCommandAllowed(entries, makeMessage({ role: { moderator: true } }), NO_LISTS)).toBe(true);
    expect(isCommandAllowed(entries, makeMessage({ role: { broadcaster: true } }), NO_LISTS)).toBe(true);
    expect(isCommandAllowed(entries, makeMessage({ role: { subscriber: true } }), NO_LISTS)).toBe(false);
  });

  it('tier:N é match exato — Tier 2 não libera Tier 3', () => {
    const entries: PermissionEntry[] = [
      { kind: 'platform-role', platform: 'twitch', role: 'tier:2' },
    ];
    expect(isCommandAllowed(entries, makeMessage({ role: { subscriber: true, subscriberTier: '2' } }), NO_LISTS)).toBe(true);
    expect(isCommandAllowed(entries, makeMessage({ role: { subscriber: true, subscriberTier: '3' } }), NO_LISTS)).toBe(false);
    expect(isCommandAllowed(entries, makeMessage({ role: { subscriber: true, subscriberTier: '1' } }), NO_LISTS)).toBe(false);
  });

  it('tier:N nega usuários sem tier', () => {
    const entries: PermissionEntry[] = [
      { kind: 'platform-role', platform: 'twitch', role: 'tier:2' },
    ];
    expect(isCommandAllowed(entries, makeMessage({ role: { subscriber: true } }), NO_LISTS)).toBe(false);
  });

  it('múltiplas entries são OR — qualquer match libera', () => {
    const entries: PermissionEntry[] = [
      { kind: 'platform-role', platform: 'twitch', role: 'tier:2' },
      { kind: 'platform-role', platform: 'twitch', role: 'tier:3' },
    ];
    expect(isCommandAllowed(entries, makeMessage({ role: { subscriber: true, subscriberTier: '2' } }), NO_LISTS)).toBe(true);
    expect(isCommandAllowed(entries, makeMessage({ role: { subscriber: true, subscriberTier: '3' } }), NO_LISTS)).toBe(true);
    expect(isCommandAllowed(entries, makeMessage({ role: { subscriber: true, subscriberTier: '1' } }), NO_LISTS)).toBe(false);
  });

  it('entry de lista libera quando (platform, userId) está nos membros', () => {
    const list: UserList = {
      id: 'l1',
      name: 'VIPs',
      members: [
        { platform: 'twitch', userId: '12345', displayName: 'joe', addedAt: '2026-01-01T00:00:00Z' },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const entries: PermissionEntry[] = [{ kind: 'list', listId: 'l1' }];
    expect(isCommandAllowed(entries, makeMessage({ platform: 'twitch', userId: '12345' }), [list])).toBe(true);
    expect(isCommandAllowed(entries, makeMessage({ platform: 'twitch', userId: '99999' }), [list])).toBe(false);
    // Cross-platform: mesmo userId mas plataforma diferente não casa.
    expect(isCommandAllowed(entries, makeMessage({ platform: 'youtube', userId: '12345' }), [list])).toBe(false);
  });

  it('lista referenciada que não existe simplesmente não casa (não trava outras entries)', () => {
    const entries: PermissionEntry[] = [
      { kind: 'list', listId: 'lista-deletada' },
      { kind: 'platform-role', platform: 'twitch', role: 'everyone' },
    ];
    expect(isCommandAllowed(entries, makeMessage({ platform: 'twitch' }), NO_LISTS)).toBe(true);
  });

  it('mensagem sem userId nunca casa entries de lista', () => {
    const list: UserList = {
      id: 'l1', name: 'X', members: [
        { platform: 'twitch', userId: '12345', displayName: 'joe', addedAt: '2026-01-01T00:00:00Z' },
      ], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    const entries: PermissionEntry[] = [{ kind: 'list', listId: 'l1' }];
    expect(isCommandAllowed(entries, makeMessage({ platform: 'twitch', userId: undefined }), [list])).toBe(false);
  });
});

describe('migratePermissions', () => {
  it('expande PermissionLevel[] legado para entries em todas as plataformas conhecidas', () => {
    const migrated = migratePermissions(['everyone']);
    expect(migrated).toEqual(expect.arrayContaining([
      { kind: 'platform-role', platform: 'twitch', role: 'everyone' },
      { kind: 'platform-role', platform: 'youtube', role: 'everyone' },
      { kind: 'platform-role', platform: 'youtube-api', role: 'everyone' },
      { kind: 'platform-role', platform: 'kick', role: 'everyone' },
      { kind: 'platform-role', platform: 'tiktok', role: 'everyone' },
    ]));
  });

  it('expande múltiplos níveis', () => {
    const migrated = migratePermissions(['moderator', 'broadcaster']);
    const platforms = new Set(migrated.map((e) => (e.kind === 'platform-role' ? e.platform : '')));
    expect(platforms.size).toBe(5);
    expect(migrated.filter((e) => e.kind === 'platform-role' && e.role === 'moderator').length).toBe(5);
    expect(migrated.filter((e) => e.kind === 'platform-role' && e.role === 'broadcaster').length).toBe(5);
  });

  it('passa entries no formato novo sem alteração', () => {
    const input: PermissionEntry[] = [
      { kind: 'platform-role', platform: 'twitch', role: 'tier:2' },
      { kind: 'list', listId: 'abc' },
    ];
    expect(migratePermissions(input)).toEqual(input);
  });

  it('descarta input não-array', () => {
    expect(migratePermissions(null)).toEqual([]);
    expect(migratePermissions('everyone')).toEqual([]);
  });

  it('descarta entradas malformadas mas mantém as válidas', () => {
    const input = [
      'everyone',
      { kind: 'platform-role', platform: 'twitch', role: 'moderator' },
      { kind: 'list' }, // sem listId
      42,
    ];
    const out = migratePermissions(input);
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((e) => e.kind === 'platform-role' && e.platform === 'twitch' && e.role === 'moderator')).toBe(true);
    expect(out.some((e) => e.kind === 'list')).toBe(false);
  });
});
