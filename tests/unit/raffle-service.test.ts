import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIGRATIONS } from '../../src/db/migrations.js';
import { RaffleRepository } from '../../src/modules/raffles/raffle-repository.js';
import { RaffleService } from '../../src/modules/raffles/raffle-service.js';
import type { ChatMessage } from '../../src/shared/types.js';
import { createTestDatabase } from './test-sqlite.js';

function createDatabase() {
  const db = createTestDatabase();
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) db.exec(migration.sql);
  return db;
}

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    platform: 'twitch',
    author: 'viewer-one',
    content: '!join',
    badges: [],
    timestampLabel: '10:30',
    ...overrides,
  };
}

describe('RaffleService', () => {
  let db: ReturnType<typeof createDatabase>;
  let repository: RaffleRepository;

  beforeEach(() => {
    db = createDatabase();
    repository = new RaffleRepository(db as never);
  });

  it('registers one entry per platform:user pair', () => {
    const service = new RaffleService({
      repository,
      getOverlayInfo: (raffleId) => ({ raffleId, overlayUrl: 'http://overlay', stateUrl: 'http://overlay/state' }),
      onState: vi.fn(),
      onEntry: vi.fn(),
      onResult: vi.fn(),
      onAnnounceWinner: vi.fn(async () => {}),
      now: () => new Date('2026-04-09T10:00:00.000Z').getTime(),
      random: () => 0,
    });

    service.create({
      title: 'Friday giveaway',
      entryCommand: '!join',
      mode: 'single-winner',
      entryDeadlineAt: null,
      acceptedPlatforms: ['twitch', 'youtube'],
      staffTriggerCommand: '!roll',
      winnerAnnouncementTemplate: 'Congrats {winner}',
      enabled: true,
    });
    const raffle = service.list()[0];
    service.control({ raffleId: raffle.id, action: 'open_entries' });

    service.handle(createMessage(), 'everyone');
    service.handle(createMessage({ id: 'msg-2' }), 'everyone');
    service.handle(createMessage({ id: 'msg-3', platform: 'youtube-v' }), 'everyone');

    const snapshot = service.getSnapshot(raffle.id);
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries.map((entry) => entry.userKey).sort()).toEqual(['twitch:viewer-one', 'youtube:viewer-one']);
  });

  it('ignores entries after the deadline has passed', () => {
    const service = new RaffleService({
      repository,
      getOverlayInfo: (raffleId) => ({ raffleId, overlayUrl: 'http://overlay', stateUrl: 'http://overlay/state' }),
      onState: vi.fn(),
      onEntry: vi.fn(),
      onResult: vi.fn(),
      onAnnounceWinner: vi.fn(async () => {}),
      now: () => new Date('2026-04-09T10:05:00.000Z').getTime(),
      random: () => 0,
    });

    service.create({
      title: 'Deadline raffle',
      entryCommand: '!join',
      mode: 'single-winner',
      entryDeadlineAt: '2026-04-09T10:00:00.000Z',
      acceptedPlatforms: ['twitch'],
      staffTriggerCommand: '!roll',
      winnerAnnouncementTemplate: 'Congrats {winner}',
      enabled: true,
    });
    const raffle = service.list()[0];
    service.control({ raffleId: raffle.id, action: 'open_entries' });

    service.handle(createMessage(), 'everyone');

    const snapshot = service.getSnapshot(raffle.id);
    expect(snapshot.entries).toHaveLength(0);
    expect(snapshot.raffle.status).toBe('collecting');
  });

  it('accepts staff trigger only for moderators and broadcasters', () => {
    const service = new RaffleService({
      repository,
      getOverlayInfo: (raffleId) => ({ raffleId, overlayUrl: 'http://overlay', stateUrl: 'http://overlay/state' }),
      onState: vi.fn(),
      onEntry: vi.fn(),
      onResult: vi.fn(),
      onAnnounceWinner: vi.fn(async () => {}),
      now: () => new Date('2026-04-09T10:00:00.000Z').getTime(),
      random: () => 0,
    });

    service.create({
      title: 'Staff only',
      entryCommand: '!join',
      mode: 'single-winner',
      entryDeadlineAt: null,
      acceptedPlatforms: ['twitch'],
      staffTriggerCommand: '!roll',
      winnerAnnouncementTemplate: 'Congrats {winner}',
      enabled: true,
    });
    const raffle = service.list()[0];
    service.control({ raffleId: raffle.id, action: 'open_entries' });
    service.handle(createMessage({ id: 'entry-1', author: 'alice' }), 'everyone');

    service.handle(createMessage({ id: 'staff-1', author: 'viewer', content: '!roll' }), 'everyone');
    expect(service.getSnapshot(raffle.id).raffle.status).toBe('collecting');

    service.handle(createMessage({ id: 'staff-2', author: 'mod', content: '!roll', badges: ['moderator'] }), 'moderator');
    expect(service.getSnapshot(raffle.id).raffle.status).toBe('ready_to_spin');
  });

  it('completes a single-winner raffle and announces the winner', async () => {
    vi.useFakeTimers();
    const onAnnounceWinner = vi.fn(async () => {});
    const service = new RaffleService({
      repository,
      getOverlayInfo: (raffleId) => ({ raffleId, overlayUrl: 'http://overlay', stateUrl: 'http://overlay/state' }),
      onState: vi.fn(),
      onEntry: vi.fn(),
      onResult: vi.fn(),
      onAnnounceWinner,
      now: () => new Date('2026-04-09T10:00:00.000Z').getTime(),
      random: () => 0.75,
    });

    service.create({
      title: 'Single raffle',
      entryCommand: '!join',
      mode: 'single-winner',
      entryDeadlineAt: null,
      acceptedPlatforms: ['twitch'],
      staffTriggerCommand: '!roll',
      winnerAnnouncementTemplate: 'Congrats {winner}',
      enabled: true,
    });
    const raffle = service.list()[0];
    service.control({ raffleId: raffle.id, action: 'open_entries' });
    service.handle(createMessage({ author: 'alice' }), 'everyone');
    service.handle(createMessage({ id: 'msg-2', author: 'bob' }), 'everyone');
    service.control({ raffleId: raffle.id, action: 'close_entries' });

    service.control({ raffleId: raffle.id, action: 'spin' });
    expect(service.getSnapshot(raffle.id).raffle.status).toBe('spinning');

    await vi.advanceTimersByTimeAsync(6_300);
    const snapshot = service.getSnapshot(raffle.id);
    expect(snapshot.raffle.status).toBe('completed');
    expect(snapshot.entries.find((entry) => entry.isWinner)?.displayName).toBeTruthy();
    expect(onAnnounceWinner).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('runs survivor rounds until top 2 and then finalizes', async () => {
    vi.useFakeTimers();
    const service = new RaffleService({
      repository,
      getOverlayInfo: (raffleId) => ({ raffleId, overlayUrl: 'http://overlay', stateUrl: 'http://overlay/state' }),
      onState: vi.fn(),
      onEntry: vi.fn(),
      onResult: vi.fn(),
      onAnnounceWinner: vi.fn(async () => {}),
      now: () => new Date('2026-04-09T10:00:00.000Z').getTime(),
      random: () => 0,
    });

    service.create({
      title: 'Survivor',
      entryCommand: '!join',
      mode: 'survivor-final',
      entryDeadlineAt: null,
      acceptedPlatforms: ['twitch'],
      staffTriggerCommand: '!roll',
      winnerAnnouncementTemplate: 'Congrats {winner}',
      enabled: true,
    });
    const raffle = service.list()[0];
    service.control({ raffleId: raffle.id, action: 'open_entries' });
    for (const [index, name] of ['alice', 'bob', 'carol', 'dave'].entries()) {
      service.handle(createMessage({ id: `m-${index}`, author: name }), 'everyone');
    }
    service.control({ raffleId: raffle.id, action: 'close_entries' });

    service.control({ raffleId: raffle.id, action: 'spin' });
    await vi.advanceTimersByTimeAsync(6_300);
    let snapshot = service.getSnapshot(raffle.id);
    expect(snapshot.raffle.status).toBe('ready_to_spin');

    service.control({ raffleId: raffle.id, action: 'spin' });
    await vi.advanceTimersByTimeAsync(6_300);
    snapshot = service.getSnapshot(raffle.id);
    expect(snapshot.raffle.status).toBe('paused_top2');
    expect(snapshot.raffle.top2EntryIds).toHaveLength(2);

    service.control({ raffleId: raffle.id, action: 'finalize' });
    await vi.advanceTimersByTimeAsync(6_300);
    snapshot = service.getSnapshot(raffle.id);
    expect(snapshot.raffle.status).toBe('completed');
    expect(snapshot.entries.filter((entry) => entry.isWinner)).toHaveLength(1);
    vi.useRealTimers();
  });

  it('rejects invalid control transitions', () => {
    const service = new RaffleService({
      repository,
      getOverlayInfo: (raffleId) => ({ raffleId, overlayUrl: 'http://overlay', stateUrl: 'http://overlay/state' }),
      onState: vi.fn(),
      onEntry: vi.fn(),
      onResult: vi.fn(),
      onAnnounceWinner: vi.fn(async () => {}),
      now: () => new Date('2026-04-09T10:00:00.000Z').getTime(),
      random: () => 0,
    });

    service.create({
      title: 'Guard rails',
      entryCommand: '!join',
      mode: 'single-winner',
      entryDeadlineAt: null,
      acceptedPlatforms: ['twitch'],
      staffTriggerCommand: '!roll',
      winnerAnnouncementTemplate: 'Congrats {winner}',
      enabled: true,
    });
    const raffle = service.list()[0];

    expect(() => service.control({ raffleId: raffle.id, action: 'spin' })).toThrow('Spin can only run when the raffle is ready');
  });
});
