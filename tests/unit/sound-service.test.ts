import { describe, expect, it, vi } from 'vitest';

import type { SoundCommand, SoundSettings } from '../../src/shared/types.js';
import { SoundService } from '../../src/modules/sounds/sound-service.js';

interface RepositoryLike {
  list: () => SoundCommand[];
  upsert: () => SoundCommand[];
  delete: () => SoundCommand[];
}

function createRepository(commands: SoundCommand[]): RepositoryLike {
  return {
    list: () => commands,
    upsert: () => commands,
    delete: () => commands,
  };
}

const DEFAULT_SETTINGS: SoundSettings = {
  defaultCooldownSeconds: 0,
  defaultUserCooldownSeconds: 0,
};

function buildService(
  commands: SoundCommand[],
  options?: { onPlay?: ReturnType<typeof vi.fn>; now?: () => number; settings?: SoundSettings },
) {
  return new SoundService({
    repository: createRepository(commands) as never,
    getSettings: () => options?.settings ?? DEFAULT_SETTINGS,
    onPlay: options?.onPlay ?? vi.fn(),
    now: options?.now,
  });
}

describe('SoundService', () => {
  it('allows higher-ranked roles to satisfy the allowed level', () => {
    const onPlay = vi.fn();
    const service = buildService(
      [
        {
          id: 'sound-1',
          trigger: '!airhorn',
          filePath: '/tmp/airhorn.wav',
          permissions: ['subscriber'],
          cooldownSeconds: 0,
          userCooldownSeconds: null,
          commandEnabled: true,
          schedule: null,
          enabled: true,
        },
      ],
      { onPlay },
    );

    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'moderator', userId: 'u-1' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
    expect(onPlay).toHaveBeenCalledWith({ filePath: '/tmp/airhorn.wav' });
  });

  it('always allows broadcaster override', () => {
    const service = buildService([
      {
        id: 'sound-1',
        trigger: '!airhorn',
        filePath: '/tmp/airhorn.wav',
        permissions: ['moderator'],
        cooldownSeconds: 0,
        userCooldownSeconds: null,
        commandEnabled: true,
        schedule: null,
        enabled: true,
      },
    ]);

    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'broadcaster', userId: 'owner' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
  });

  it('enforces global cooldowns between different users', () => {
    const timestamps = [1_000, 2_000, 7_000];
    let index = 0;
    const service = buildService(
      [
        {
          id: 'sound-1',
          trigger: '!airhorn',
          filePath: '/tmp/airhorn.wav',
          permissions: ['everyone'],
          cooldownSeconds: 5,
          userCooldownSeconds: null,
          commandEnabled: true,
          schedule: null,
          enabled: true,
        },
      ],
      {
        now: () => {
          const timestamp = timestamps[Math.min(index, timestamps.length - 1)];
          index += 1;
          return timestamp;
        },
      },
    );

    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-1' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-2' })).toBeNull();
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-2' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
  });

  it('tracks per-user cooldowns independently', () => {
    const timestamps = [1_000, 8_000, 8_500, 14_000];
    let index = 0;
    const service = buildService(
      [
        {
          id: 'sound-1',
          trigger: '!airhorn',
          filePath: '/tmp/airhorn.wav',
          permissions: ['everyone'],
          cooldownSeconds: 5,
          userCooldownSeconds: 5,
          commandEnabled: true,
          schedule: null,
          enabled: true,
        },
      ],
      {
        now: () => {
          const timestamp = timestamps[Math.min(index, timestamps.length - 1)];
          index += 1;
          return timestamp;
        },
      },
    );

    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-1' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-2' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-2' })).toBeNull();
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-2' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
  });

  it('uses global default cooldown when command values are null', () => {
    const timestamps = [1_000, 2_000, 12_000];
    let index = 0;
    const settings: SoundSettings = { defaultCooldownSeconds: 10, defaultUserCooldownSeconds: 0 };
    const service = buildService(
      [
        {
          id: 'sound-1',
          trigger: '!airhorn',
          filePath: '/tmp/airhorn.wav',
          permissions: ['everyone'],
          cooldownSeconds: null,
          userCooldownSeconds: null,
          commandEnabled: true,
          schedule: null,
          enabled: true,
        },
      ],
      {
        settings,
        now: () => {
          const timestamp = timestamps[Math.min(index, timestamps.length - 1)];
          index += 1;
          return timestamp;
        },
      },
    );

    // First call succeeds
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-1' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
    // Second call at 2s blocked by global 10s cooldown
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-2' })).toBeNull();
    // Third call at 12s succeeds (past 10s cooldown)
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-2' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
  });

  it('uses command-specific cooldown when set, ignoring global defaults', () => {
    const timestamps = [1_000, 2_000, 5_000];
    let index = 0;
    const settings: SoundSettings = { defaultCooldownSeconds: 10, defaultUserCooldownSeconds: 10 };
    const service = buildService(
      [
        {
          id: 'sound-1',
          trigger: '!airhorn',
          filePath: '/tmp/airhorn.wav',
          permissions: ['everyone'],
          cooldownSeconds: 3,
          userCooldownSeconds: 3,
          commandEnabled: true,
          schedule: null,
          enabled: true,
        },
      ],
      {
        settings,
        now: () => {
          const timestamp = timestamps[Math.min(index, timestamps.length - 1)];
          index += 1;
          return timestamp;
        },
      },
    );

    // First call succeeds
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-1' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
    // Second call at 2s blocked by custom 3s cooldown
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-1' })).toBeNull();
    // Third call at 5s succeeds (past custom 3s cooldown, despite global being 10s)
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-1' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
  });

  it('differentiates global cooldown from per-user cooldown', () => {
    // global cooldown = 2s (blocks all users), per-user = 10s (blocks same user)
    const timestamps = [1_000, 4_000, 4_500, 12_000];
    let index = 0;
    const service = buildService(
      [
        {
          id: 'sound-1',
          trigger: '!airhorn',
          filePath: '/tmp/airhorn.wav',
          permissions: ['everyone'],
          cooldownSeconds: 2,
          userCooldownSeconds: 10,
          commandEnabled: true,
          schedule: null,
          enabled: true,
        },
      ],
      {
        now: () => {
          const timestamp = timestamps[Math.min(index, timestamps.length - 1)];
          index += 1;
          return timestamp;
        },
      },
    );

    // u-1 triggers at 1s
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-1' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
    // u-2 at 4s: global cooldown (2s) passed, and u-2 has no user cooldown yet → succeeds
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-2' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
    // u-1 at 4.5s: global cooldown just set at 4s → blocked (only 0.5s passed)
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-1' })).toBeNull();
    // u-1 at 12s: global cooldown passed, per-user cooldown for u-1 (set at 1s, need 10s) → 12-1=11s > 10s → succeeds
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-1' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
  });

  it('uses global default for per-user cooldown when only userCooldownSeconds is null', () => {
    const timestamps = [1_000, 8_000, 12_000];
    let index = 0;
    const settings: SoundSettings = { defaultCooldownSeconds: 0, defaultUserCooldownSeconds: 10 };
    const service = buildService(
      [
        {
          id: 'sound-1',
          trigger: '!airhorn',
          filePath: '/tmp/airhorn.wav',
          permissions: ['everyone'],
          cooldownSeconds: 0,
          userCooldownSeconds: null,
          commandEnabled: true,
          schedule: null,
          enabled: true,
        },
      ],
      {
        settings,
        now: () => {
          const timestamp = timestamps[Math.min(index, timestamps.length - 1)];
          index += 1;
          return timestamp;
        },
      },
    );

    // First call succeeds (no cooldowns active)
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-1' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
    // Same user at 8s: global cd = 0 (pass), user cd = 10s default (8-1=7 < 10) → blocked
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-1' })).toBeNull();
    // Same user at 12s: user cd = 10s (12-1=11 > 10) → succeeds
    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'everyone', userId: 'u-1' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
  });
});
