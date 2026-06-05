import { describe, expect, it, vi } from 'vitest';

import type { ChatMessage, PermissionEntry, PermissionLevel, VoiceCommand } from '../../src/shared/types.js';
import type { PlatformRole } from '../../src/shared/platform.js';
import { VoiceService } from '../../src/modules/voice/voice-service.js';

interface RepositoryLike {
  list: () => VoiceCommand[];
  upsert: () => VoiceCommand[];
  delete: () => VoiceCommand[];
}

function createRepository(commands: VoiceCommand[]): RepositoryLike {
  return {
    list: () => commands,
    upsert: () => commands,
    delete: () => commands,
  };
}

const TWITCH_EVERYONE: PermissionEntry[] = [{ kind: 'platform-role', platform: 'twitch', role: 'everyone' }];
const TWITCH_MODERATOR: PermissionEntry[] = [{ kind: 'platform-role', platform: 'twitch', role: 'moderator' }];

function makeMsg(level: PermissionLevel, author: string, content: string): ChatMessage {
  const role: PlatformRole = {};
  if (level === 'broadcaster') role.broadcaster = true;
  if (level === 'moderator') role.moderator = true;
  if (level === 'vip') role.vip = true;
  if (level === 'subscriber') role.subscriber = true;
  if (level === 'follower') role.follower = true;
  return {
    id: 'm-1',
    platform: 'twitch',
    author,
    content,
    badges: [],
    timestampLabel: '00:00',
    role,
    userId: author,
  };
}

describe('VoiceService', () => {
  it('uses explicit template text when present', () => {
    const onSpeak = vi.fn();
    const service = new VoiceService({
      repository: createRepository([
        {
          id: 'voice-1', trigger: '!say', template: 'Fixed template', language: 'en-US',
          permissions: TWITCH_EVERYONE,
          cooldownSeconds: 0, userCooldownSeconds: 0, announceUsername: false, characterLimit: 500,
          enabled: true,
        },
      ]) as never,
      getUserLists: () => [],
      onSpeak,
    });

    const payload = service.handleMessage(makeMsg('everyone', 'u-1', '!say ignored tail'));

    expect(payload).toEqual({ text: 'Fixed template', lang: 'en-US' });
    expect(onSpeak).toHaveBeenCalledWith({ text: 'Fixed template', lang: 'en-US' });
  });

  it('extracts text after the trigger when no template is stored', () => {
    const service = new VoiceService({
      repository: createRepository([
        {
          id: 'voice-1', trigger: '!say', template: null, language: 'pt-BR',
          permissions: TWITCH_EVERYONE,
          cooldownSeconds: 0, userCooldownSeconds: 0, announceUsername: false, characterLimit: 500,
          enabled: true,
        },
      ]) as never,
      getUserLists: () => [],
      onSpeak: vi.fn(),
    });

    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!say hello chat'))).toEqual({
      text: 'hello chat',
      lang: 'pt-BR',
    });
  });

  it('blocks execution when permission is missing', () => {
    const onSpeak = vi.fn();
    const service = new VoiceService({
      repository: createRepository([
        {
          id: 'voice-1', trigger: '!say', template: null, language: 'en-US',
          permissions: TWITCH_MODERATOR,
          cooldownSeconds: 0, userCooldownSeconds: 0, announceUsername: false, characterLimit: 500,
          enabled: true,
        },
      ]) as never,
      getUserLists: () => [],
      onSpeak,
    });

    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!say hello'))).toBeNull();
    expect(onSpeak).not.toHaveBeenCalled();
  });

  it('respects command cooldown windows', () => {
    const onSpeak = vi.fn();
    const timestamps = [1_000, 2_000, 7_500];
    let callIndex = 0;
    const now = vi.fn(() => timestamps[Math.min(callIndex++, timestamps.length - 1)]);
    const service = new VoiceService({
      repository: createRepository([
        {
          id: 'voice-1', trigger: '!say', template: null, language: 'en-US',
          permissions: TWITCH_EVERYONE,
          cooldownSeconds: 5, userCooldownSeconds: 0, announceUsername: false, characterLimit: 500,
          enabled: true,
        },
      ]) as never,
      getUserLists: () => [],
      onSpeak,
      now,
    });

    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!say first'))).toEqual({ text: 'first', lang: 'en-US' });
    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!say second'))).toBeNull();
    expect(service.handleMessage(makeMsg('everyone', 'u-1', '!say third'))).toEqual({ text: 'third', lang: 'en-US' });
    expect(onSpeak).toHaveBeenCalledTimes(2);
  });
});
