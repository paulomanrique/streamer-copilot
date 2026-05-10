import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PollRepository } from '../../src/modules/polls/poll-repository.js';
import { PollService, formatPollResult } from '../../src/modules/polls/poll-service.js';
import type { ChatMessage, Poll, PollSnapshot } from '../../src/shared/types.js';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    platform: 'twitch',
    author: 'viewer-one',
    content: '1',
    badges: [],
    timestampLabel: '10:30',
    ...overrides,
  };
}

function makeService(now: () => number) {
  const dir = mkdtempSync(join(tmpdir(), 'polls-'));
  const repository = new PollRepository(() => dir);
  const onState = vi.fn();
  const onVote = vi.fn();
  const onAnnounceResult = vi.fn(async () => {});
  const service = new PollService({
    repository,
    getOverlayInfo: () => ({ overlayUrl: 'http://overlay', stateUrl: 'http://overlay/state' }),
    onState,
    onVote,
    onAnnounceResult,
    now,
  });
  return { service, repository, onState, onVote, onAnnounceResult };
}

function seedPoll(service: PollService, durationSeconds = 60): Poll {
  service.upsert({
    title: 'Best topping?',
    options: [{ label: 'Cheese' }, { label: 'Pepperoni' }, { label: 'Mushroom' }],
    durationSeconds,
    acceptedPlatforms: ['twitch'],
    resultAnnouncementTemplate: 'Result: {winner}',
  });
  return service.list()[0];
}

describe('PollService', () => {
  let now: number;
  beforeEach(() => {
    now = new Date('2026-05-08T10:00:00.000Z').getTime();
  });

  it('records a vote when the message matches an option index', async () => {
    const { service, onVote } = makeService(() => now);
    const poll = seedPoll(service);
    await service.control({ pollId: poll.id, action: 'start' });

    service.handle(createMessage({ content: '2' }), 'everyone');

    expect(onVote).toHaveBeenCalledTimes(1);
    const snapshot = service.getSnapshot(poll.id);
    expect(snapshot.totalVotes).toBe(1);
    expect(snapshot.tally[1].votes).toBe(1);
  });

  it('rejects a second vote from the same user (first-vote-wins)', async () => {
    const { service, onVote } = makeService(() => now);
    const poll = seedPoll(service);
    await service.control({ pollId: poll.id, action: 'start' });

    service.handle(createMessage({ content: '1' }), 'everyone');
    service.handle(createMessage({ content: '2' }), 'everyone');

    expect(onVote).toHaveBeenCalledTimes(1);
    const snapshot = service.getSnapshot(poll.id);
    expect(snapshot.totalVotes).toBe(1);
    expect(snapshot.tally[0].votes).toBe(1);
  });

  it('ignores votes from non-accepted platforms', async () => {
    const { service, onVote } = makeService(() => now);
    const poll = seedPoll(service);
    await service.control({ pollId: poll.id, action: 'start' });

    service.handle(createMessage({ platform: 'youtube', content: '1' }), 'everyone');

    expect(onVote).not.toHaveBeenCalled();
  });

  it('ignores non-integer messages', async () => {
    const { service, onVote } = makeService(() => now);
    const poll = seedPoll(service);
    await service.control({ pollId: poll.id, action: 'start' });

    service.handle(createMessage({ content: 'hello' }), 'everyone');
    service.handle(createMessage({ author: 'b', content: '1.5' }), 'everyone');
    service.handle(createMessage({ author: 'c', content: '0' }), 'everyone');
    service.handle(createMessage({ author: 'd', content: '99' }), 'everyone');

    expect(onVote).not.toHaveBeenCalled();
  });

  it('closes and announces when the deadline elapses', async () => {
    const tick = { value: now };
    const { service, onAnnounceResult } = makeService(() => tick.value);
    const poll = seedPoll(service, 30);
    await service.control({ pollId: poll.id, action: 'start' });

    service.handle(createMessage({ content: '1' }), 'everyone');
    service.handle(createMessage({ author: 'b', content: '2' }), 'everyone');
    service.handle(createMessage({ author: 'c', content: '2' }), 'everyone');

    tick.value += 31_000;
    service.syncDeadlines();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onAnnounceResult).toHaveBeenCalledTimes(1);
    const snapshot = service.getSnapshot(poll.id);
    expect(snapshot.poll.status).toBe('closed');
    expect(snapshot.winner?.label).toBe('Pepperoni');
  });

  it('returns null winner on a tie', async () => {
    const tick = { value: now };
    const { service } = makeService(() => tick.value);
    const poll = seedPoll(service, 10);
    await service.control({ pollId: poll.id, action: 'start' });

    service.handle(createMessage({ content: '1' }), 'everyone');
    service.handle(createMessage({ author: 'b', content: '2' }), 'everyone');

    tick.value += 11_000;
    service.syncDeadlines();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const snapshot = service.getSnapshot(poll.id);
    expect(snapshot.poll.status).toBe('closed');
    expect(snapshot.winner).toBeNull();
  });

  it('refuses to start a second poll while one is active', async () => {
    const { service } = makeService(() => now);
    const a = seedPoll(service);
    service.upsert({
      title: 'Other',
      options: [{ label: 'X' }, { label: 'Y' }],
      durationSeconds: 60,
      acceptedPlatforms: ['twitch'],
      resultAnnouncementTemplate: '',
    });
    const polls = service.list();
    const b = polls.find((p) => p.id !== a.id)!;

    await service.control({ pollId: a.id, action: 'start' });
    await expect(service.control({ pollId: b.id, action: 'start' })).rejects.toThrow(/active/);
  });

  it('formatPollResult substitutes all variables', () => {
    const poll = {
      id: 'p',
      title: 'Pizza?',
      options: [],
      durationSeconds: 30,
      acceptedPlatforms: [],
      resultAnnouncementTemplate: '',
      status: 'closed' as const,
      startedAt: null,
      closesAt: null,
      closedAt: null,
      createdAt: '',
      updatedAt: '',
    };
    const snapshot: PollSnapshot = {
      poll,
      totalVotes: 5,
      tally: [
        { optionId: 'a', index: 1, label: 'Cheese', votes: 2, percent: 40 },
        { optionId: 'b', index: 2, label: 'Pepperoni', votes: 3, percent: 60 },
      ],
      winner: { optionId: 'b', index: 2, label: 'Pepperoni', votes: 3, percent: 60 },
    };
    const out = formatPollResult(
      'Q: {title} | W: {winner} ({winner_percent}% / {winner_votes}) | T: {total_votes} | {results}',
      poll,
      snapshot,
    );
    expect(out).toBe('Q: Pizza? | W: Pepperoni (60% / 3) | T: 5 | 1) Cheese: 2 (40%) | 2) Pepperoni: 3 (60%)');
  });
});
