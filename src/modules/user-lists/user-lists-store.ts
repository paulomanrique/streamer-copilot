import { randomUUID } from 'node:crypto';

import type { PlatformId, UserList, UserListMember } from '../../shared/types.js';
import { JsonSettingsStore } from '../base/settings-store.js';

const SETTINGS_FILE = 'user-lists.json';

interface FileShape {
  lists: UserList[];
}

function isMember(value: unknown): value is UserListMember {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.platform === 'string' &&
    typeof v.userId === 'string' &&
    typeof v.displayName === 'string' &&
    typeof v.addedAt === 'string'
  );
}

function isList(value: unknown): value is UserList {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.members) &&
    typeof v.createdAt === 'string' &&
    typeof v.updatedAt === 'string'
  );
}

/**
 * Per-profile user lists — collections of (platform, userId) pairs that the
 * streamer builds via right-click in chat (or the management page) and
 * references in commands as permission entries.
 *
 * Identity is (platform, userId): a Twitch/YouTube username can change but
 * the native userId stays stable. `displayName` is a cached label for the UI,
 * not part of the match.
 */
export class UserListsStore extends JsonSettingsStore<FileShape> {
  constructor(profileDirectory: string) {
    super(profileDirectory, SETTINGS_FILE);
  }

  protected defaults(): FileShape {
    return { lists: [] };
  }

  protected parse(raw: Record<string, unknown>): FileShape {
    const rawLists = Array.isArray(raw.lists) ? raw.lists : [];
    const lists = rawLists.filter(isList).map((l) => ({
      ...l,
      members: l.members.filter(isMember),
    }));
    return { lists };
  }

  async listAll(): Promise<UserList[]> {
    const data = await this.load();
    return data.lists;
  }

  async create(name: string): Promise<UserList> {
    const now = new Date().toISOString();
    const list: UserList = {
      id: randomUUID(),
      name: name.trim(),
      members: [],
      createdAt: now,
      updatedAt: now,
    };
    const data = await this.load();
    const next: FileShape = { lists: [...data.lists, list] };
    await this.save(next);
    return list;
  }

  async rename(id: string, name: string): Promise<UserList[]> {
    const data = await this.load();
    const next = data.lists.map((l) => (
      l.id === id ? { ...l, name: name.trim(), updatedAt: new Date().toISOString() } : l
    ));
    await this.save({ lists: next });
    return next;
  }

  async delete(id: string): Promise<UserList[]> {
    const data = await this.load();
    const next = data.lists.filter((l) => l.id !== id);
    await this.save({ lists: next });
    return next;
  }

  /** Adds a member to the list. No-op when already present. Returns `true` if
   *  something actually changed. */
  async addMember(
    listId: string,
    member: { platform: PlatformId; userId: string; displayName: string },
  ): Promise<boolean> {
    const data = await this.load();
    const list = data.lists.find((l) => l.id === listId);
    if (!list) return false;
    if (list.members.some((m) => m.platform === member.platform && m.userId === member.userId)) {
      // Already present — refresh displayName only if it changed.
      const existing = list.members.find((m) => m.platform === member.platform && m.userId === member.userId);
      if (existing && existing.displayName !== member.displayName) {
        const updated: UserList = {
          ...list,
          members: list.members.map((m) => (
            m.platform === member.platform && m.userId === member.userId
              ? { ...m, displayName: member.displayName }
              : m
          )),
          updatedAt: new Date().toISOString(),
        };
        await this.save({ lists: data.lists.map((l) => (l.id === listId ? updated : l)) });
        return true;
      }
      return false;
    }
    const updated: UserList = {
      ...list,
      members: [...list.members, { ...member, addedAt: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    };
    await this.save({ lists: data.lists.map((l) => (l.id === listId ? updated : l)) });
    return true;
  }

  async removeMember(listId: string, platform: PlatformId, userId: string): Promise<UserList[]> {
    const data = await this.load();
    const next = data.lists.map((l) => (
      l.id === listId
        ? {
            ...l,
            members: l.members.filter((m) => !(m.platform === platform && m.userId === userId)),
            updatedAt: new Date().toISOString(),
          }
        : l
    ));
    await this.save({ lists: next });
    return next;
  }
}
