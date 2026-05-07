import { describe, expect, it } from 'vitest';

import {
  PERMISSION_RANK,
  isPermissionAllowed,
  resolveFromRole,
  resolvePermissionLevel,
} from '../../src/modules/commands/permission-utils.js';
import type { ChatMessage } from '../../src/shared/types.js';

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
