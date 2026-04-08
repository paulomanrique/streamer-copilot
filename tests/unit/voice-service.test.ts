import { describe, expect, it, vi } from 'vitest';

import type { VoiceCommand } from '../../src/shared/types.js';
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

describe('VoiceService', () => {
  it('uses explicit template text when present', () => {
    const onSpeak = vi.fn();
    const service = new VoiceService({
      repository: createRepository([
        {
          id: 'voice-1',
          trigger: '!say',
          template: 'Fixed template',
          language: 'en-US',
          permissions: ['everyone'],
          cooldownSeconds: 0,
          enabled: true,
        },
      ]) as never,
      onSpeak,
    });

    const payload = service.handleChatMessage('!say ignored tail', { permissionLevel: 'everyone' });

    expect(payload).toEqual({ text: 'Fixed template', lang: 'en-US' });
    expect(onSpeak).toHaveBeenCalledWith({ text: 'Fixed template', lang: 'en-US' });
  });

  it('extracts text after the trigger when no template is stored', () => {
    const service = new VoiceService({
      repository: createRepository([
        {
          id: 'voice-1',
          trigger: '!say',
          template: null,
          language: 'pt-BR',
          permissions: ['everyone'],
          cooldownSeconds: 0,
          enabled: true,
        },
      ]) as never,
      onSpeak: vi.fn(),
    });

    expect(service.handleChatMessage('!say hello chat', { permissionLevel: 'everyone' })).toEqual({
      text: 'hello chat',
      lang: 'pt-BR',
    });
  });

  it('blocks execution when permission is missing', () => {
    const onSpeak = vi.fn();
    const service = new VoiceService({
      repository: createRepository([
        {
          id: 'voice-1',
          trigger: '!say',
          template: null,
          language: 'en-US',
          permissions: ['moderator'],
          cooldownSeconds: 0,
          enabled: true,
        },
      ]) as never,
      onSpeak,
    });

    expect(service.handleChatMessage('!say hello', { permissionLevel: 'everyone' })).toBeNull();
    expect(onSpeak).not.toHaveBeenCalled();
  });

  it('respects command cooldown windows', () => {
    const onSpeak = vi.fn();
    const timestamps = [1_000, 2_000, 7_500];
    let callIndex = 0;
    const now = vi.fn(() => {
      const timestamp = timestamps[Math.min(callIndex, timestamps.length - 1)];
      callIndex += 1;
      return timestamp;
    });
    const service = new VoiceService({
      repository: createRepository([
        {
          id: 'voice-1',
          trigger: '!say',
          template: null,
          language: 'en-US',
          permissions: ['everyone'],
          cooldownSeconds: 5,
          enabled: true,
        },
      ]) as never,
      onSpeak,
      now,
    });

    expect(service.handleChatMessage('!say first', { permissionLevel: 'everyone' })).toEqual({
      text: 'first',
      lang: 'en-US',
    });
    expect(service.handleChatMessage('!say second', { permissionLevel: 'everyone' })).toBeNull();
    expect(service.handleChatMessage('!say third', { permissionLevel: 'everyone' })).toEqual({
      text: 'third',
      lang: 'en-US',
    });
    expect(onSpeak).toHaveBeenCalledTimes(2);
  });
});
