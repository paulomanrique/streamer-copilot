import { describe, expect, it, vi } from 'vitest';

import type { ScheduledMessage } from '../../src/shared/types.js';
import { SchedulerService } from '../../src/modules/scheduled/scheduler-service.js';

interface RepositoryLike {
  list: () => ScheduledMessage[];
  upsert: () => ScheduledMessage[];
  delete: () => ScheduledMessage[];
  markSent: (id: string, sentAt: string) => void;
}

function createMessage(overrides: Partial<ScheduledMessage> = {}): ScheduledMessage {
  return {
    id: 'scheduled-1',
    message: 'Follow the channel',
    intervalSeconds: 60,
    randomWindowSeconds: 0,
    targetPlatforms: ['twitch'],
    enabled: true,
    lastSentAt: null,
    ...overrides,
  };
}

function createRepository(messages: ScheduledMessage[]): RepositoryLike {
  return {
    list: () => messages,
    upsert: () => messages,
    delete: () => messages,
    markSent: (id, sentAt) => {
      const target = messages.find((message) => message.id === id);
      if (target) target.lastSentAt = sentAt;
    },
  };
}

describe('SchedulerService', () => {
  it('fires exactly when the interval threshold is reached', () => {
    const messages = [createMessage({ intervalSeconds: 30, lastSentAt: '2026-04-08T07:00:00.000Z' })];
    const repository = createRepository(messages);
    const onDueMessage = vi.fn();
    const onStatus = vi.fn();
    const service = new SchedulerService({
      repository: repository as never,
      onDueMessage,
      onStatus,
      now: () => new Date('2026-04-08T07:00:30.000Z').getTime(),
    });

    (service as { tick: () => void }).tick();

    expect(onDueMessage).toHaveBeenCalledTimes(1);
    expect(messages[0].lastSentAt).toBe('2026-04-08T07:00:30.000Z');
  });

  it('keeps nextFireAt within the configured jitter bounds', () => {
    const messages = [
      createMessage({
        intervalSeconds: 60,
        randomWindowSeconds: 15,
        lastSentAt: '2026-04-08T07:00:00.000Z',
      }),
    ];
    const repository = createRepository(messages);
    const onStatus = vi.fn();
    const service = new SchedulerService({
      repository: repository as never,
      onStatus,
      now: () => new Date('2026-04-08T07:00:10.000Z').getTime(),
    });

    (service as { emitStatus: () => void }).emitStatus();

    const [statusItems] = onStatus.mock.calls.at(-1) as [{ id: string; nextFireAt: string | null; enabled: boolean }[]];
    const nextFireAt = new Date(statusItems[0].nextFireAt ?? '').getTime();
    const minTime = new Date('2026-04-08T07:01:00.000Z').getTime();
    const maxTime = new Date('2026-04-08T07:01:15.000Z').getTime();

    expect(nextFireAt).toBeGreaterThanOrEqual(minTime);
    expect(nextFireAt).toBeLessThanOrEqual(maxTime);
  });

  it('skips disabled messages during tick evaluation', () => {
    const messages = [
      createMessage({
        enabled: false,
        intervalSeconds: 30,
        lastSentAt: '2026-04-08T07:00:00.000Z',
      }),
    ];
    const repository = createRepository(messages);
    const onDueMessage = vi.fn();
    const service = new SchedulerService({
      repository: repository as never,
      onStatus: vi.fn(),
      onDueMessage,
      now: () => new Date('2026-04-08T07:01:00.000Z').getTime(),
    });

    (service as { tick: () => void }).tick();

    expect(onDueMessage).not.toHaveBeenCalled();
    expect(messages[0].lastSentAt).toBe('2026-04-08T07:00:00.000Z');
  });

  it('updates lastSentAt when a due message is emitted', () => {
    const messages = [createMessage({ intervalSeconds: 10, lastSentAt: '2026-04-08T07:00:00.000Z' })];
    const repository = createRepository(messages);
    const onDueMessage = vi.fn();
    const service = new SchedulerService({
      repository: repository as never,
      onStatus: vi.fn(),
      onDueMessage,
      now: () => new Date('2026-04-08T07:00:10.000Z').getTime(),
    });

    (service as { tick: () => void }).tick();

    expect(messages[0].lastSentAt).toBe('2026-04-08T07:00:10.000Z');
    expect(onDueMessage).toHaveBeenCalledWith({
      ...messages[0],
      lastSentAt: '2026-04-08T07:00:10.000Z',
    });
  });
});
