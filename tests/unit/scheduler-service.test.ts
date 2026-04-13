import { describe, expect, it, vi } from 'vitest';

import { SchedulerService, type ScheduledTask } from '../../src/modules/scheduled/scheduler-service.js';

interface RepositoryLike {
  list: () => ScheduledTask[];
  markSent: (id: string, sentAt: string) => void;
}

function createMessage(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: 'scheduled-1',
    intervalSeconds: 60,
    randomWindowSeconds: 0,
    targetPlatforms: ['twitch'],
    enabled: true,
    lastSentAt: null,
    ...overrides,
  };
}

function createRepository(messages: ScheduledTask[]): RepositoryLike {
  return {
    list: () => messages,
    markSent: (id, sentAt) => {
      const target = messages.find((message) => message.id === id);
      if (target) target.lastSentAt = sentAt;
    },
  };
}

describe('SchedulerService', () => {
  it('fires exactly when the interval threshold is reached', async () => {
    const messages = [createMessage({ intervalSeconds: 30, lastSentAt: '2026-04-08T07:00:00.000Z' })];
    const repository = createRepository(messages);
    const onDueMessage = vi.fn();
    const onStatus = vi.fn();
    const service = new SchedulerService({
      source: repository,
      onDueTask: onDueMessage,
      onStatus,
      now: () => new Date('2026-04-08T07:00:30.000Z').getTime(),
    });

    await (service as { tick: () => Promise<void> }).tick();

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
      source: repository,
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

  it('skips disabled messages during tick evaluation', async () => {
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
      source: repository,
      onStatus: vi.fn(),
      onDueTask: onDueMessage,
      now: () => new Date('2026-04-08T07:01:00.000Z').getTime(),
    });

    await (service as { tick: () => Promise<void> }).tick();

    expect(onDueMessage).not.toHaveBeenCalled();
    expect(messages[0].lastSentAt).toBe('2026-04-08T07:00:00.000Z');
  });

  it('updates lastSentAt when a due message is emitted', async () => {
    const messages = [createMessage({ intervalSeconds: 10, lastSentAt: '2026-04-08T07:00:00.000Z' })];
    const repository = createRepository(messages);
    const onDueMessage = vi.fn();
    const service = new SchedulerService({
      source: repository,
      onStatus: vi.fn(),
      onDueTask: onDueMessage,
      now: () => new Date('2026-04-08T07:00:10.000Z').getTime(),
    });

    await (service as { tick: () => Promise<void> }).tick();

    expect(messages[0].lastSentAt).toBe('2026-04-08T07:00:10.000Z');
    expect(onDueMessage).toHaveBeenCalledWith({
      ...messages[0],
      lastSentAt: '2026-04-08T07:00:10.000Z',
    });
  });

  it('fires immediately for a newly enabled message without lastSentAt', async () => {
    const messages = [createMessage({ lastSentAt: null, intervalSeconds: 300, randomWindowSeconds: 60 })];
    const repository = createRepository(messages);
    const onDueMessage = vi.fn();
    const service = new SchedulerService({
      source: repository,
      onStatus: vi.fn(),
      onDueTask: onDueMessage,
      now: () => new Date('2026-04-08T07:00:00.000Z').getTime(),
    });

    await (service as { tick: () => Promise<void> }).tick();

    expect(onDueMessage).toHaveBeenCalledTimes(1);
    expect(messages[0].lastSentAt).toBe('2026-04-08T07:00:00.000Z');
  });

  it('includes last result details in scheduled status', async () => {
    const messages = [createMessage({ intervalSeconds: 10, lastSentAt: '2026-04-08T07:00:00.000Z' })];
    const repository = createRepository(messages);
    const onStatus = vi.fn();
    const service = new SchedulerService({
      source: repository,
      onStatus,
      onDueTask: async () => ({
        runAt: '2026-04-08T07:00:10.000Z',
        result: 'skipped',
        detail: 'No connected targets',
      }),
      resolveEffectiveTargets: () => ['twitch'],
      now: () => new Date('2026-04-08T07:00:10.000Z').getTime(),
    });

    await (service as { tick: () => Promise<void> }).tick();

    const [statusItems] = onStatus.mock.calls.at(-1) as [{
      id: string;
      nextFireAt: string | null;
      enabled: boolean;
      lastRunAt: string | null;
      lastResult: string | null;
      lastResultDetail: string | null;
      effectiveTargets: string[];
    }[]];
    expect(statusItems[0].lastRunAt).toBe('2026-04-08T07:00:10.000Z');
    expect(statusItems[0].lastResult).toBe('skipped');
    expect(statusItems[0].lastResultDetail).toBe('No connected targets');
    expect(statusItems[0].effectiveTargets).toEqual(['twitch']);
  });
});
