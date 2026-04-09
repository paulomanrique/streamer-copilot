import { describe, expect, it, vi } from 'vitest';

import type { TextCommand } from '../../src/shared/types.js';
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

describe('TextService', () => {
  it('responds with configured text when trigger matches', () => {
    const onRespond = vi.fn();
    const service = new TextService({
      repository: createRepository([
        {
          id: 'text-1',
          trigger: '!site',
          response: 'https://www.example.com',
          permissions: ['everyone'],
          cooldownSeconds: 0,
          enabled: true,
        },
      ]) as never,
      onRespond,
    });

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
    const service = new TextService({
      repository: createRepository([
        {
          id: 'text-1',
          trigger: '!site',
          response: 'https://www.example.com',
          permissions: ['moderator'],
          cooldownSeconds: 0,
          enabled: true,
        },
      ]) as never,
      onRespond,
    });

    expect(service.handleChatMessage('!site', {
      permissionLevel: 'everyone',
      userId: 'u-1',
      platform: 'twitch',
    })).toBeNull();
    expect(onRespond).not.toHaveBeenCalled();
  });

  it('enforces cooldown between users and allows again after window', () => {
    const timestamps = [1_000, 2_000, 7_000];
    let index = 0;
    const service = new TextService({
      repository: createRepository([
        {
          id: 'text-1',
          trigger: '!site',
          response: 'https://www.example.com',
          permissions: ['everyone'],
          cooldownSeconds: 5,
          enabled: true,
        },
      ]) as never,
      onRespond: vi.fn(),
      now: () => {
        const timestamp = timestamps[Math.min(index, timestamps.length - 1)];
        index += 1;
        return timestamp;
      },
    });

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
});
