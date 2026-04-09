import { afterEach, describe, expect, it } from 'vitest';

import { MIGRATIONS } from '../../src/db/migrations.js';
import { RaffleRepository } from '../../src/modules/raffles/raffle-repository.js';
import { createTestDatabase } from './test-sqlite.js';

function createDatabase() {
  const db = createTestDatabase();
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) db.exec(migration.sql);
  return db;
}

describe('RaffleRepository', () => {
  let db: ReturnType<typeof createDatabase> | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('enforces unique entries per raffle and user key', () => {
    db = createDatabase();
    const repository = new RaffleRepository(db as never);
    repository.create({
      title: 'Repo raffle',
      entryCommand: '!join',
      mode: 'single-winner',
      entryDeadlineAt: null,
      acceptedPlatforms: ['twitch'],
      staffTriggerCommand: '!roll',
      winnerAnnouncementTemplate: 'Congrats {winner}',
      enabled: true,
    });
    const raffle = repository.list()[0];

    const first = repository.registerEntry({
      raffleId: raffle.id,
      platform: 'twitch',
      userKey: 'twitch:alice',
      displayName: 'alice',
      sourceMessageId: 'm-1',
      enteredAt: '2026-04-09T10:00:00.000Z',
    });
    const second = repository.registerEntry({
      raffleId: raffle.id,
      platform: 'twitch',
      userKey: 'twitch:alice',
      displayName: 'alice',
      sourceMessageId: 'm-2',
      enteredAt: '2026-04-09T10:01:00.000Z',
    });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(repository.listEntries(raffle.id)).toHaveLength(1);
  });

  it('returns the active raffle and stores round history', () => {
    db = createDatabase();
    const repository = new RaffleRepository(db as never);
    repository.create({
      title: 'History raffle',
      entryCommand: '!join',
      mode: 'survivor-final',
      entryDeadlineAt: null,
      acceptedPlatforms: ['twitch'],
      staffTriggerCommand: '!roll',
      winnerAnnouncementTemplate: 'Congrats {winner}',
      enabled: true,
    });
    const raffle = repository.list()[0];
    repository.transitionStatus(raffle.id, 'collecting');
    repository.registerEntry({
      raffleId: raffle.id,
      platform: 'twitch',
      userKey: 'twitch:alice',
      displayName: 'alice',
      sourceMessageId: 'm-1',
      enteredAt: '2026-04-09T10:00:00.000Z',
    });
    repository.recordRound({
      raffleId: raffle.id,
      roundNumber: 1,
      actionType: 'spin',
      selectedEntryId: repository.listEntries(raffle.id)[0].id,
      selectedEntryName: 'alice',
      resultType: 'eliminated',
      participantCountBefore: 4,
      participantCountAfter: 3,
      animationSeedJson: '{"durationMs":6200}',
    });

    expect(repository.getActive()?.id).toBe(raffle.id);
    expect(repository.listRounds(raffle.id)).toHaveLength(1);
  });

  it('reset keeps entries and clears execution flags', () => {
    db = createDatabase();
    const repository = new RaffleRepository(db as never);
    repository.create({
      title: 'Reset raffle',
      entryCommand: '!join',
      mode: 'single-winner',
      entryDeadlineAt: null,
      acceptedPlatforms: ['twitch'],
      staffTriggerCommand: '!roll',
      winnerAnnouncementTemplate: 'Congrats {winner}',
      enabled: true,
    });
    const raffle = repository.list()[0];
    repository.registerEntry({
      raffleId: raffle.id,
      platform: 'twitch',
      userKey: 'twitch:alice',
      displayName: 'alice',
      sourceMessageId: 'm-1',
      enteredAt: '2026-04-09T10:00:00.000Z',
    });
    const entry = repository.listEntries(raffle.id)[0];
    repository.markWinner(raffle.id, entry.id);
    repository.recordRound({
      raffleId: raffle.id,
      roundNumber: 1,
      actionType: 'spin',
      selectedEntryId: entry.id,
      selectedEntryName: entry.displayName,
      resultType: 'winner',
      participantCountBefore: 1,
      participantCountAfter: 0,
      animationSeedJson: null,
    });

    repository.reset(raffle.id);

    const nextRaffle = repository.getById(raffle.id);
    const nextEntries = repository.listEntries(raffle.id);
    expect(nextRaffle?.status).toBe('draft');
    expect(nextEntries).toHaveLength(1);
    expect(nextEntries[0].isWinner).toBe(false);
    expect(nextEntries[0].isEliminated).toBe(false);
    expect(repository.listRounds(raffle.id)).toHaveLength(0);
  });
});
