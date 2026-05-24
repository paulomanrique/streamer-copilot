import { describe, expect, it } from 'vitest';

import {
  PERMISSION_RANK,
  isCommandAllowedWithTier,
  isPermissionAllowed,
  resolveFromRole,
  resolvePermissionLevel,
} from '../../src/modules/commands/permission-utils.js';
import type { ChatMessage, SubscriberTierCatalog } from '../../src/shared/types.js';

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

describe('isCommandAllowedWithTier', () => {
  const catalog: SubscriberTierCatalog = {
    byPlatform: {
      twitch: [
        { id: '1', label: 'Tier 1', order: 1, source: 'builtin' },
        { id: '2', label: 'Tier 2', order: 2, source: 'builtin' },
        { id: '3', label: 'Tier 3', order: 3, source: 'builtin' },
      ],
      youtube: [
        { id: 'Member', label: 'Member', order: 1, source: 'scraped' },
        { id: 'Apoiador', label: 'Apoiador', order: 2, source: 'scraped' },
        { id: 'Super fã', label: 'Super fã', order: 3, source: 'scraped' },
      ],
    },
  };

  it('passa quando não há minSubscriberTier configurado', () => {
    expect(isCommandAllowedWithTier(['subscriber'], undefined, 'subscriber', 'twitch', '1', catalog)).toBe(true);
  });

  it('passa quando a plataforma do remetente não está no mapa', () => {
    expect(isCommandAllowedWithTier(['subscriber'], { twitch: '2' }, 'subscriber', 'youtube', 'Member', catalog)).toBe(true);
  });

  it('passa quando o tier do usuário >= tier requerido', () => {
    expect(isCommandAllowedWithTier(['subscriber'], { twitch: '2' }, 'subscriber', 'twitch', '3', catalog)).toBe(true);
    expect(isCommandAllowedWithTier(['subscriber'], { youtube: 'Apoiador' }, 'subscriber', 'youtube', 'Super fã', catalog)).toBe(true);
  });

  it('bloqueia quando o tier do usuário < tier requerido', () => {
    expect(isCommandAllowedWithTier(['subscriber'], { twitch: '2' }, 'subscriber', 'twitch', '1', catalog)).toBe(false);
    expect(isCommandAllowedWithTier(['subscriber'], { youtube: 'Apoiador' }, 'subscriber', 'youtube', 'Member', catalog)).toBe(false);
  });

  it('bloqueia quando o tier do usuário não está catalogado', () => {
    expect(isCommandAllowedWithTier(['subscriber'], { twitch: '1' }, 'subscriber', 'twitch', undefined, catalog)).toBe(false);
    expect(isCommandAllowedWithTier(['subscriber'], { twitch: '1' }, 'subscriber', 'twitch', '99', catalog)).toBe(false);
  });

  it('bloqueia quando o tier requerido não existe no catálogo (proteção contra config stale)', () => {
    expect(isCommandAllowedWithTier(['subscriber'], { youtube: 'NívelInexistente' }, 'subscriber', 'youtube', 'Member', catalog)).toBe(false);
  });

  it('bloqueia quando a plataforma não tem catálogo', () => {
    expect(isCommandAllowedWithTier(['subscriber'], { kick: '1' }, 'subscriber', 'kick', '1', catalog)).toBe(false);
  });

  it('moderator passa direto ignorando minSubscriberTier', () => {
    expect(isCommandAllowedWithTier(['subscriber'], { twitch: '3' }, 'moderator', 'twitch', undefined, catalog)).toBe(true);
  });

  it('broadcaster passa direto ignorando minSubscriberTier', () => {
    expect(isCommandAllowedWithTier(['subscriber'], { twitch: '3' }, 'broadcaster', 'twitch', undefined, catalog)).toBe(true);
  });

  it('respeita o gate base de allowedLevels antes do tier check', () => {
    expect(isCommandAllowedWithTier(['moderator'], { twitch: '1' }, 'subscriber', 'twitch', '3', catalog)).toBe(false);
  });
});
