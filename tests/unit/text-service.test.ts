import { describe, expect, it, vi } from 'vitest';

import type { TextCommand, TextSettings } from '../../src/shared/types.js';
import { TextService } from '../../src/modules/text/text-service.js';

interface RepositoryLike {
  list: () => TextCommand[];
  upsert: () => TextCommand[];
  delete: () => TextCommand[];
}

function createRepository(commands: TextCommand[]): RepositoryLike {
  return {
    list: () => commands,
    upsert: () => commands,
    delete: () => commands,
  };
}

const DEFAULT_SETTINGS: TextSettings = {
  defaultCooldownSeconds: 0,
  defaultUserCooldownSeconds: 0,
};

function buildService(
  commands: TextCommand[],
  options?: { onRespond?: ReturnType<typeof vi.fn>; now?: () => number; settings?: TextSettings },
) {
  return new TextService({
    repository: createRepository(commands) as never,
    getSettings: () => options?.settings ?? DEFAULT_SETTINGS,
    onRespond: options?.onRespond ?? vi.fn(),
    now: options?.now,
  });
}

describe('TextService', () => {
  it('responds with configured text when trigger matches', () => {
    const onRespond = vi.fn();
    const service = buildService(
      [
        {
          id: 'text-1',
          trigger: '!site',
          response: 'https://www.example.com',
          permissions: ['everyone'],
          cooldownSeconds: 0,
          userCooldownSeconds: null,
          commandEnabled: true,
          schedule: null,
          enabled: true,
        },
      ],
      { onRespond },
    );

    const payload = service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    });

    expect(payload).toEqual({ platform: 'twitch', content: 'https://www.example.com' });
    expect(onRespond).toHaveBeenCalledWith({ platform: 'twitch', content: 'https://www.example.com' });
  });

  it('blocks execution when permission is missing', () => {
    const onRespond = vi.fn();
    const service = buildService(
      [
        {
          id: 'text-1',
          trigger: '!site',
          response: 'https://www.example.com',
          permissions: ['moderator'],
          cooldownSeconds: 0,
          userCooldownSeconds: null,
          commandEnabled: true,
          schedule: null,
          enabled: true,
        },
      ],
      { onRespond },
    );

    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toBeNull();
    expect(onRespond).not.toHaveBeenCalled();
  });

  it('enforces global cooldown between users and allows again after window', () => {
    const timestamps = [1_000, 2_000, 7_000];
    let index = 0;
    const service = buildService(
      [
        {
          id: 'text-1',
          trigger: '!site',
          response: 'https://www.example.com',
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

    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });

    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-2',
      platform: 'twitch',
    })).toBeNull();

    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-2',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });
  });

  it('tracks per-user cooldowns independently', () => {
    const timestamps = [1_000, 8_000, 8_500, 14_000];
    let index = 0;
    const service = buildService(
      [
        {
          id: 'text-1',
          trigger: '!site',
          response: 'https://www.example.com',
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

    // u-1 triggers at 1s
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });

    // u-2 at 8s: global cooldown (5s) passed (8-1=7 > 5), u-2 has no user cooldown → succeeds
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-2',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });

    // u-2 at 8.5s: global cooldown just set at 8s → blocked (only 0.5s passed)
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-2',
      platform: 'twitch',
    })).toBeNull();

    // u-2 at 14s: global cooldown passed (14-8=6 > 5), user cooldown passed (14-8=6 > 5) → succeeds
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-2',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });
  });

  it('uses global default cooldown when command values are null', () => {
    const timestamps = [1_000, 2_000, 12_000];
    let index = 0;
    const settings: TextSettings = { defaultCooldownSeconds: 10, defaultUserCooldownSeconds: 0 };
    const service = buildService(
      [
        {
          id: 'text-1',
          trigger: '!site',
          response: 'https://www.example.com',
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
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });

    // Second call at 2s blocked by global 10s cooldown
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-2',
      platform: 'twitch',
    })).toBeNull();

    // Third call at 12s succeeds (past 10s cooldown)
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-2',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });
  });

  it('uses command-specific cooldown when set, ignoring global defaults', () => {
    const timestamps = [1_000, 2_000, 5_000];
    let index = 0;
    const settings: TextSettings = { defaultCooldownSeconds: 10, defaultUserCooldownSeconds: 10 };
    const service = buildService(
      [
        {
          id: 'text-1',
          trigger: '!site',
          response: 'https://www.example.com',
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
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });

    // Second call at 2s blocked by custom 3s cooldown
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toBeNull();

    // Third call at 5s succeeds (past custom 3s cooldown, despite global being 10s)
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });
  });

  it('differentiates global cooldown from per-user cooldown', () => {
    // global cooldown = 2s (blocks all users), per-user = 10s (blocks same user)
    const timestamps = [1_000, 4_000, 4_500, 12_000];
    let index = 0;
    const service = buildService(
      [
        {
          id: 'text-1',
          trigger: '!site',
          response: 'https://www.example.com',
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
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });

    // u-2 at 4s: global cooldown (2s) passed, u-2 has no user cooldown yet → succeeds
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-2',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });

    // u-1 at 4.5s: global cooldown just set at 4s → blocked (only 0.5s passed)
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toBeNull();

    // u-1 at 12s: global cooldown passed, per-user cooldown for u-1 (set at 1s, need 10s) → 12-1=11s > 10s → succeeds
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });
  });

  it('uses global default for per-user cooldown when only userCooldownSeconds is null', () => {
    const timestamps = [1_000, 8_000, 12_000];
    let index = 0;
    const settings: TextSettings = { defaultCooldownSeconds: 0, defaultUserCooldownSeconds: 10 };
    const service = buildService(
      [
        {
          id: 'text-1',
          trigger: '!site',
          response: 'https://www.example.com',
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
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });

    // Same user at 8s: global cd = 0 (pass), user cd = 10s default (8-1=7 < 10) → blocked
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toBeNull();

    // Same user at 12s: user cd = 10s (12-1=11 > 10) → succeeds
    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toEqual({ platform: 'twitch', content: 'https://www.example.com' });
  });
});
