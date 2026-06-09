import { describe, expect, it, vi } from 'vitest';

import type { ChatMessage, PermissionEntry, SuggestionEntry, SuggestionList, SuggestionSnapshot } from '../../src/shared/types.js';
import { SuggestionService } from '../../src/modules/suggestions/suggestion-service.js';

const TWITCH_EVERYONE: PermissionEntry[] = [{ kind: 'platform-role', platform: 'twitch', role: 'everyone' }];
const TWITCH_SUBSCRIBER: PermissionEntry[] = [{ kind: 'platform-role', platform: 'twitch', role: 'subscriber' }];
const TWITCH_MODERATOR: PermissionEntry[] = [{ kind: 'platform-role', platform: 'twitch', role: 'moderator' }];

function makeList(overrides: Partial<SuggestionList> = {}): SuggestionList {
  return {
    id: 'list-1',
    title: 'Game Suggestions',
    trigger: '!jogo',
    feedbackTemplate: '',
    feedbackSoundPath: null,
    feedbackTargetPlatforms: [],
    mode: 'session',
    allowDuplicates: false,
    permissions: TWITCH_EVERYONE,
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
  onFeedback?: ReturnType<typeof vi.fn>,
) {
  return new SuggestionService({
    repository: repo as never,
    getUserLists: () => [],
    onState: onState ?? vi.fn(),
    onFeedback: onFeedback ?? vi.fn(),
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

    it('sends configured feedback after saving a suggestion', () => {
      const repo = createMockRepo([makeList({ feedbackTemplate: 'Thanks for the suggestion, {username}' })]);
      const onFeedback = vi.fn();
      const service = createService(repo, vi.fn(), undefined, onFeedback);

      service.handle(makeMessage({ author: 'viewer1' }), 'everyone');

      expect(onFeedback).toHaveBeenCalledWith({
        platform: 'twitch',
        content: 'Thanks for the suggestion, viewer1',
      });
    });
  });

  describe('permissions', () => {
    it('rejects users below required permission level', () => {
      const repo = createMockRepo([makeList({ permissions: TWITCH_SUBSCRIBER })]);
      const service = createService(repo);

      service.handle(makeMessage({ unifiedLevel: 'follower' }), 'follower');
      expect(repo.addEntry).not.toHaveBeenCalled();
    });

    it('allows higher permission levels', () => {
      const repo = createMockRepo([makeList({ permissions: TWITCH_SUBSCRIBER })]);
      const service = createService(repo);

      service.handle(makeMessage({ unifiedLevel: 'moderator' }), 'moderator');
      expect(repo.addEntry).toHaveBeenCalled();
    });

    it('always allows broadcaster', () => {
      const repo = createMockRepo([makeList({ permissions: TWITCH_MODERATOR })]);
      const service = createService(repo);

      service.handle(makeMessage({ unifiedLevel: 'broadcaster' }), 'broadcaster');
      expect(repo.addEntry).toHaveBeenCalled();
    });
  });

  describe('dedup (delegated to the repository)', () => {
    // Dedup lives inside repository.addEntry (it returns null for a rejected
    // duplicate); the service's contract is to stay silent in that case.
    it('does not emit state, feedback or cooldowns when the repository rejects the entry', () => {
      const repo = createMockRepo([makeList({ allowDuplicates: false })]);
      repo.addEntry.mockReturnValue(null);
      const onState = vi.fn();
      const onFeedback = vi.fn();
      const service = createService(repo, onState, undefined, onFeedback);

      service.handle(makeMessage(), 'everyone');
      expect(repo.addEntry).toHaveBeenCalled();
      expect(onState).not.toHaveBeenCalled();
      expect(onFeedback).not.toHaveBeenCalled();
    });

    it('emits state when the repository accepts the entry', () => {
      const repo = createMockRepo([makeList({ allowDuplicates: true })]);
      const onState = vi.fn();
      const service = createService(repo, onState);

      service.handle(makeMessage(), 'everyone');
      expect(repo.addEntry).toHaveBeenCalled();
      expect(onState).toHaveBeenCalled();
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
