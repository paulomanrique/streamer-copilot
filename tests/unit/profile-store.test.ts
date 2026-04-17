import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProfileStore } from '../../src/modules/settings/profile-store.js';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'streamer-copilot-profile-store-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('ProfileStore', () => {
  it('does not keep a missing cloud-backed profile active on list', async () => {
    const userDataPath = await createTempDir();
    const profileDirectory = path.join(userDataPath, 'dropbox-profile');
    const store = new ProfileStore(userDataPath);

    const created = await store.create('Cloud profile', profileDirectory);
    expect(created.activeProfileId).toBeTruthy();

    await rm(profileDirectory, { recursive: true, force: true });

    const listed = await store.list();

    expect(listed.activeProfileId).toBe('');
    await expect(readFile(path.join(userDataPath, 'profiles.json'), 'utf-8')).resolves.toContain(created.profiles[0].id);
  });

  it('refuses to select a profile while its directory is unavailable', async () => {
    const userDataPath = await createTempDir();
    const profileDirectory = path.join(userDataPath, 'dropbox-profile');
    const store = new ProfileStore(userDataPath);
    const created = await store.create('Cloud profile', profileDirectory);

    await rm(profileDirectory, { recursive: true, force: true });

    await expect(store.select(created.profiles[0].id)).rejects.toThrow('Profile directory is not available');
  });

  it('does not recreate a missing profile directory during list', async () => {
    const userDataPath = await createTempDir();
    const profileDirectory = path.join(userDataPath, 'missing-profile');
    const profileId = 'profile-1';
    await writeFile(
      path.join(userDataPath, 'profiles.json'),
      `${JSON.stringify({
        activeProfileId: profileId,
        profiles: [{ id: profileId, name: 'Missing', directory: profileDirectory, lastUsedAt: new Date().toISOString() }],
      }, null, 2)}\n`,
      'utf-8',
    );

    const store = new ProfileStore(userDataPath);
    const listed = await store.list();

    expect(listed.activeProfileId).toBe('');
    await expect(readFile(path.join(profileDirectory, 'settings.json'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
