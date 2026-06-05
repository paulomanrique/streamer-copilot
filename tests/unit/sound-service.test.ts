import { describe, expect, it, vi } from 'vitest';

import type { ChatMessage, PermissionEntry, SoundCommand, SoundSettings } from '../../src/shared/types.js';
import type { PermissionLevel } from '../../src/shared/types.js';
import type { PlatformRole } from '../../src/shared/platform.js';
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
    getUserLists: () => [],
    onPlay: options?.onPlay ?? vi.fn(),
    now: options?.now,
  });
}

const TWITCH_EVERYONE: PermissionEntry[] = [{ kind: 'platform-role', platform: 'twitch', role: 'everyone' }];
const TWITCH_SUBSCRIBER: PermissionEntry[] = [{ kind: 'platform-role', platform: 'twitch', role: 'subscriber' }];
const TWITCH_MODERATOR: PermissionEntry[] = [{ kind: 'platform-role', platform: 'twitch', role: 'moderator' }];

function makeMsg(level: PermissionLevel, userId: string, content: string): ChatMessage {
  const role: PlatformRole = {};
  if (level === 'broadcaster') role.broadcaster = true;
  if (level === 'moderator') role.moderator = true;
  if (level === 'vip') role.vip = true;
  if (level === 'subscriber') role.subscriber = true;
  if (level === 'follower') role.follower = true;
  return {
    id: 'm-1',
    platform: 'twitch',
    author: userId,
    content,
    badges: [],
    timestampLabel: '00:00',
    role,
    userId,
  };
}

describe('SoundService', () => {
  it('allows higher-ranked roles to satisfy the allowed level', () => {
    const onPlay = vi.fn();
    const service = buildService(
      [
        {
          id: 'sound-1', name: 'airhorn', trigger: '!airhorn', filePath: '/tmp/airhorn.wav',
          permissions: TWITCH_SUBSCRIBER,
          cooldownSeconds: 0, userCooldownSeconds: null,
          commandEnabled: true, schedule: null, enabled: true,
        },
      ],
      { onPlay },
    );

    expect(service.handleMessage(makeMsg('moderator', 'u-1', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
    expect(onPlay).toHaveBeenCalledWith({ filePath: '/tmp/airhorn.wav' });
  });

  it('always allows broadcaster override', () => {
    const service = buildService([
      {
        id: 'sound-1', name: 'airhorn', trigger: '!airhorn', filePath: '/tmp/airhorn.wav',
        permissions: TWITCH_MODERATOR,
        cooldownSeconds: 0, userCooldownSeconds: null,
        commandEnabled: true, schedule: null, enabled: true,
      },
    ]);

    expect(service.handleMessage(makeMsg('broadcaster', 'owner', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
  });

  it('enforces global cooldowns between different users', () => {
    const timestamps = [1_000, 2_000, 7_000];
    let index = 0;
    const service = buildService(
      [
        {
          id: 'sound-1', name: 'airhorn', trigger: '!airhorn', filePath: '/tmp/airhorn.wav',
          permissions: TWITCH_EVERYONE,
          cooldownSeconds: 5, userCooldownSeconds: null,
          commandEnabled: true, schedule: null, enabled: true,
        },
      ],
      { now: () => timestamps[Math.min(index++, timestamps.length - 1)] },
    );

    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
    expect(service.handleMessage(makeMsg('everyone', 'u-2', '!airhorn'))).toBeNull();
    expect(service.handleMessage(makeMsg('everyone', 'u-2', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
  });

  it('tracks per-user cooldowns independently', () => {
    const timestamps = [1_000, 8_000, 8_500, 14_000];
    let index = 0;
    const service = buildService(
      [
        {
          id: 'sound-1', name: 'airhorn', trigger: '!airhorn', filePath: '/tmp/airhorn.wav',
          permissions: TWITCH_EVERYONE,
          cooldownSeconds: 5, userCooldownSeconds: 5,
          commandEnabled: true, schedule: null, enabled: true,
        },
      ],
      { now: () => timestamps[Math.min(index++, timestamps.length - 1)] },
    );

    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
    expect(service.handleMessage(makeMsg('everyone', 'u-2', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
    expect(service.handleMessage(makeMsg('everyone', 'u-2', '!airhorn'))).toBeNull();
    expect(service.handleMessage(makeMsg('everyone', 'u-2', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
  });

  it('uses global default cooldown when command values are null', () => {
    const timestamps = [1_000, 2_000, 12_000];
    let index = 0;
    const settings: SoundSettings = { defaultCooldownSeconds: 10, defaultUserCooldownSeconds: 0 };
    const service = buildService(
      [
        {
          id: 'sound-1', name: 'airhorn', trigger: '!airhorn', filePath: '/tmp/airhorn.wav',
          permissions: TWITCH_EVERYONE,
          cooldownSeconds: null, userCooldownSeconds: null,
          commandEnabled: true, schedule: null, enabled: true,
        },
      ],
      { settings, now: () => timestamps[Math.min(index++, timestamps.length - 1)] },
    );

    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
    expect(service.handleMessage(makeMsg('everyone', 'u-2', '!airhorn'))).toBeNull();
    expect(service.handleMessage(makeMsg('everyone', 'u-2', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
  });

  it('uses command-specific cooldown when set, ignoring global defaults', () => {
    const timestamps = [1_000, 2_000, 5_000];
    let index = 0;
    const settings: SoundSettings = { defaultCooldownSeconds: 10, defaultUserCooldownSeconds: 10 };
    const service = buildService(
      [
        {
          id: 'sound-1', name: 'airhorn', trigger: '!airhorn', filePath: '/tmp/airhorn.wav',
          permissions: TWITCH_EVERYONE,
          cooldownSeconds: 3, userCooldownSeconds: 3,
          commandEnabled: true, schedule: null, enabled: true,
        },
      ],
      { settings, now: () => timestamps[Math.min(index++, timestamps.length - 1)] },
    );

    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!airhorn'))).toBeNull();
    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
  });

  it('differentiates global cooldown from per-user cooldown', () => {
    const timestamps = [1_000, 4_000, 4_500, 12_000];
    let index = 0;
    const service = buildService(
      [
        {
          id: 'sound-1', name: 'airhorn', trigger: '!airhorn', filePath: '/tmp/airhorn.wav',
          permissions: TWITCH_EVERYONE,
          cooldownSeconds: 2, userCooldownSeconds: 10,
          commandEnabled: true, schedule: null, enabled: true,
        },
      ],
      { now: () => timestamps[Math.min(index++, timestamps.length - 1)] },
    );

    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
    expect(service.handleMessage(makeMsg('everyone', 'u-2', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!airhorn'))).toBeNull();
    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
  });

  it('uses global default for per-user cooldown when only userCooldownSeconds is null', () => {
    const timestamps = [1_000, 8_000, 12_000];
    let index = 0;
    const settings: SoundSettings = { defaultCooldownSeconds: 0, defaultUserCooldownSeconds: 10 };
    const service = buildService(
      [
        {
          id: 'sound-1', name: 'airhorn', trigger: '!airhorn', filePath: '/tmp/airhorn.wav',
          permissions: TWITCH_EVERYONE,
          cooldownSeconds: 0, userCooldownSeconds: null,
          commandEnabled: true, schedule: null, enabled: true,
        },
      ],
      { settings, now: () => timestamps[Math.min(index++, timestamps.length - 1)] },
    );

    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!airhorn'))).toBeNull();
    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!airhorn'))).toEqual({ filePath: '/tmp/airhorn.wav' });
  });
});
