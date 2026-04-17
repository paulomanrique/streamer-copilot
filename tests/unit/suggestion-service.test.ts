import { describe, expect, it, vi } from 'vitest';

import type { ChatMessage, PermissionLevel, SuggestionEntry, SuggestionList, SuggestionSnapshot } from '../../src/shared/types.js';
import { SuggestionService } from '../../src/modules/suggestions/suggestion-service.js';

function makeList(overrides: Partial<SuggestionList> = {}): SuggestionList {
  return {
    id: 'list-1',
    title: 'Game Suggestions',
    trigger: '!jogo',
    mode: 'session',
    allowDuplicates: false,
    permissions: ['everyone'],
    cooldownSeconds: 0,
    userCooldownSeconds: 0,
    enabled: true,
    entryCount: 0,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    platform: 'twitch',
    author: 'viewer1',
    content: '!jogo Pacman',
    badges: [],
    timestampLabel: '12:00',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<SuggestionEntry> = {}): SuggestionEntry {
  return {
    id: 'entry-1',
    listId: 'list-1',
    platform: 'twitch',
    userKey: 'twitch:viewer1',
    displayName: 'viewer1',
    content: 'Pacman',
    createdAt: '2026-01-01 00:00:00',
    ...overrides,
  };
}

interface MockRepository {
  listLists: () => SuggestionList[];
  upsertList: () => SuggestionList[];
  deleteList: () => SuggestionList[];
  listEntries: () => SuggestionEntry[];
  addEntry: ReturnType<typeof vi.fn>;
  hasUserEntry: ReturnType<typeof vi.fn>;
  clearEntries: ReturnType<typeof vi.fn>;
  clearSessionEntries: ReturnType<typeof vi.fn>;
}

function createMockRepo(lists: SuggestionList[] = [makeList()], entries: SuggestionEntry[] = []): MockRepository {
  return {
    listLists: () => lists,
    upsertList: () => lists,
    deleteList: () => lists,
    listEntries: () => entries,
    addEntry: vi.fn(() => makeEntry()),
    hasUserEntry: vi.fn(() => false),
    clearEntries: vi.fn(),
    clearSessionEntries: vi.fn(),
  };
}

function createService(
  repo: MockRepository,
  onState?: (payload: SuggestionSnapshot) => void,
  now?: () => number,
) {
  return new SuggestionService({
    repository: repo as never,
    onState: onState ?? vi.fn(),
    now,
  });
}

describe('SuggestionService', () => {
  describe('command matching', () => {
    it('matches trigger and extracts content after space', () => {
      const repo = createMockRepo();
      const onState = vi.fn();
      const service = createService(repo, onState);

      service.handle(makeMessage({ content: '!jogo Pacman' }), 'everyone');

      expect(repo.addEntry).toHaveBeenCalledWith({
        listId: 'list-1',
        platform: 'twitch',
        userKey: 'twitch:viewer1',
        displayName: 'viewer1',
        content: 'Pacman',
      });
      expect(onState).toHaveBeenCalled();
    });

    it('ignores messages without a space after trigger', () => {
      const repo = createMockRepo();
      const service = createService(repo);

      service.handle(makeMessage({ content: '!jogoPacman' }), 'everyone');
      expect(repo.addEntry).not.toHaveBeenCalled();
    });

    it('ignores empty content after trigger', () => {
      const repo = createMockRepo();
      const service = createService(repo);

      service.handle(makeMessage({ content: '!jogo   ' }), 'everyone');
      expect(repo.addEntry).not.toHaveBeenCalled();
    });

    it('ignores disabled lists', () => {
      const repo = createMockRepo([makeList({ enabled: false })]);
      const service = createService(repo);

      service.handle(makeMessage(), 'everyone');
      expect(repo.addEntry).not.toHaveBeenCalled();
    });

    it('ignores non-matching triggers', () => {
      const repo = createMockRepo();
      const service = createService(repo);

      service.handle(makeMessage({ content: '!musica Bohemian Rhapsody' }), 'everyone');
      expect(repo.addEntry).not.toHaveBeenCalled();
    });

    it('trims content whitespace', () => {
      const repo = createMockRepo();
      const service = createService(repo);

      service.handle(makeMessage({ content: '!jogo   Pac Man  ' }), 'everyone');
      expect(repo.addEntry).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Pac Man' }),
      );
    });
  });

  describe('permissions', () => {
    it('rejects users below required permission level', () => {
      const repo = createMockRepo([makeList({ permissions: ['subscriber'] })]);
      const service = createService(repo);

      service.handle(makeMessage(), 'follower');
      expect(repo.addEntry).not.toHaveBeenCalled();
    });

    it('allows higher permission levels', () => {
      const repo = createMockRepo([makeList({ permissions: ['subscriber'] })]);
      const service = createService(repo);

      service.handle(makeMessage(), 'moderator');
      expect(repo.addEntry).toHaveBeenCalled();
    });

    it('always allows broadcaster', () => {
      const repo = createMockRepo([makeList({ permissions: ['moderator'] })]);
      const service = createService(repo);

      service.handle(makeMessage(), 'broadcaster');
      expect(repo.addEntry).toHaveBeenCalled();
    });
  });

  describe('dedup (allowDuplicates)', () => {
    it('rejects duplicate entry from same user when allowDuplicates=false', () => {
      const repo = createMockRepo([makeList({ allowDuplicates: false })]);
      repo.hasUserEntry.mockReturnValue(true);
      const service = createService(repo);

      service.handle(makeMessage(), 'everyone');
      expect(repo.addEntry).not.toHaveBeenCalled();
    });

    it('allows duplicate entry from same user when allowDuplicates=true', () => {
      const repo = createMockRepo([makeList({ allowDuplicates: true })]);
      repo.hasUserEntry.mockReturnValue(true);
      const service = createService(repo);

      service.handle(makeMessage(), 'everyone');
      expect(repo.addEntry).toHaveBeenCalled();
    });
  });

  describe('cooldowns', () => {
    it('enforces global cooldown', () => {
      const timestamps = [1_000, 2_000, 6_000];
      let index = 0;
      const repo = createMockRepo([makeList({ cooldownSeconds: 5 })]);
      const service = createService(repo, vi.fn(), () => {
        const t = timestamps[Math.min(index, timestamps.length - 1)];
        index++;
        return t;
      });

      service.handle(makeMessage({ id: 'msg-1', author: 'u1' }), 'everyone');
      expect(repo.addEntry).toHaveBeenCalledTimes(1);

      service.handle(makeMessage({ id: 'msg-2', author: 'u2' }), 'everyone');
      expect(repo.addEntry).toHaveBeenCalledTimes(1); // still 1 — blocked by global cooldown

      service.handle(makeMessage({ id: 'msg-3', author: 'u2' }), 'everyone');
      expect(repo.addEntry).toHaveBeenCalledTimes(2); // now passes
    });

    it('enforces per-user cooldown', () => {
      const timestamps = [1_000, 2_000, 6_000];
      let index = 0;
      const repo = createMockRepo([makeList({ userCooldownSeconds: 5, allowDuplicates: true })]);
      const service = createService(repo, vi.fn(), () => {
        const t = timestamps[Math.min(index, timestamps.length - 1)];
        index++;
        return t;
      });

      service.handle(makeMessage({ id: 'msg-1', author: 'viewer1' }), 'everyone');
      expect(repo.addEntry).toHaveBeenCalledTimes(1);

      service.handle(makeMessage({ id: 'msg-2', author: 'viewer1' }), 'everyone');
      expect(repo.addEntry).toHaveBeenCalledTimes(1); // blocked by user cooldown

      service.handle(makeMessage({ id: 'msg-3', author: 'viewer1' }), 'everyone');
      expect(repo.addEntry).toHaveBeenCalledTimes(2); // now passes
    });
  });

  describe('clearSessionEntries', () => {
    it('delegates to repository clearSessionEntries', () => {
      const repo = createMockRepo();
      const service = createService(repo);

      service.clearSessionEntries();
      expect(repo.clearSessionEntries).toHaveBeenCalled();
    });
  });

  describe('CRUD delegation', () => {
    it('listLists delegates to repository', () => {
      const lists = [makeList()];
      const repo = createMockRepo(lists);
      const service = createService(repo);

      expect(service.listLists()).toEqual(lists);
    });

    it('clearEntries delegates and returns empty list', () => {
      const repo = createMockRepo();
      const service = createService(repo);

      const result = service.clearEntries('list-1');
      expect(repo.clearEntries).toHaveBeenCalledWith('list-1');
      expect(result).toEqual([]);
    });
  });
});
