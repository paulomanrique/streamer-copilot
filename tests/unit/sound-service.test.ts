import { describe, expect, it, vi } from 'vitest';

import type { SoundCommand } from '../../src/shared/types.js';
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

describe('SoundService', () => {
  it('allows higher-ranked roles to satisfy the allowed level', () => {
    const onPlay = vi.fn();
    const service = new SoundService({
      repository: createRepository([
        {
          id: 'sound-1',
          trigger: '!airhorn',
          filePath: '/tmp/airhorn.wav',
          permissions: ['subscriber'],
          cooldownSeconds: 0,
          enabled: true,
        },
      ]) as never,
      onPlay,
    });

    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'moderator', userId: 'u-1' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
    expect(onPlay).toHaveBeenCalledWith({ filePath: '/tmp/airhorn.wav' });
  });

  it('always allows broadcaster override', () => {
    const service = new SoundService({
      repository: createRepository([
        {
          id: 'sound-1',
          trigger: '!airhorn',
          filePath: '/tmp/airhorn.wav',
          permissions: ['moderator'],
          cooldownSeconds: 0,
          enabled: true,
        },
      ]) as never,
      onPlay: vi.fn(),
    });

    expect(service.handleChatMessage('!airhorn', { permissionLevel: 'broadcaster', userId: 'owner' })).toEqual({
      filePath: '/tmp/airhorn.wav',
    });
  });

  it('enforces global cooldowns between different users', () => {
    const timestamps = [1_000, 2_000, 7_000];
    let index = 0;
    const service = new SoundService({
      repository: createRepository([
        {
          id: 'sound-1',
          trigger: '!airhorn',
          filePath: '/tmp/airhorn.wav',
          permissions: ['everyone'],
          cooldownSeconds: 5,
          enabled: true,
        },
      ]) as never,
      onPlay: vi.fn(),
      now: () => {
        const timestamp = timestamps[Math.min(index, timestamps.length - 1)];
        index += 1;
        return timestamp;
      },
    });

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
    const service = new SoundService({
      repository: createRepository([
        {
          id: 'sound-1',
          trigger: '!airhorn',
          filePath: '/tmp/airhorn.wav',
          permissions: ['everyone'],
          cooldownSeconds: 5,
          enabled: true,
        },
      ]) as never,
      onPlay: vi.fn(),
      now: () => {
        const timestamp = timestamps[Math.min(index, timestamps.length - 1)];
        index += 1;
        return timestamp;
      },
    });

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
});
