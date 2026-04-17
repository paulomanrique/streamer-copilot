import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProfileStore } from '../../src/modules/settings/profile-store.js';
import { createProfileInputSchema } from '../../src/shared/schemas.js';

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

    const created = await store.create('Cloud profile', profileDirectory, 'pt-BR');
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
    const created = await store.create('Cloud profile', profileDirectory, 'pt-BR');

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

  it('writes pt-BR app language settings when creating a profile', async () => {
    const userDataPath = await createTempDir();
    const profileDirectory = path.join(userDataPath, 'pt-profile');
    const store = new ProfileStore(userDataPath);

    const created = await store.create('PT profile', profileDirectory, 'pt-BR');
    const settings = JSON.parse(await readFile(path.join(profileDirectory, 'settings.json'), 'utf-8')) as { appLanguage: string };

    expect(settings).toEqual({ appLanguage: 'pt-BR' });
    expect(created.profiles[0].appLanguage).toBe('pt-BR');
  });

  it('returns en-US app language when creating a profile with English', async () => {
    const userDataPath = await createTempDir();
    const profileDirectory = path.join(userDataPath, 'en-profile');
    const store = new ProfileStore(userDataPath);

    const created = await store.create('EN profile', profileDirectory, 'en-US');

    expect(created.profiles[0].appLanguage).toBe('en-US');
  });

  it('defaults old profiles without appLanguage to pt-BR on list', async () => {
    const userDataPath = await createTempDir();
    const profileDirectory = path.join(userDataPath, 'legacy-profile');
    const store = new ProfileStore(userDataPath);
    await store.create('Legacy profile', profileDirectory, 'en-US');
    await writeFile(path.join(profileDirectory, 'settings.json'), '{}\n', 'utf-8');

    const listed = await store.list();

    expect(listed.profiles[0].appLanguage).toBe('pt-BR');
  });

  it('saves app language settings only for the active profile', async () => {
    const userDataPath = await createTempDir();
    const firstDirectory = path.join(userDataPath, 'first-profile');
    const secondDirectory = path.join(userDataPath, 'second-profile');
    const store = new ProfileStore(userDataPath);
    const first = await store.create('First profile', firstDirectory, 'pt-BR');
    await store.create('Second profile', secondDirectory, 'pt-BR');
    await store.saveSettings({ appLanguage: 'en-US' });

    const firstSettings = JSON.parse(await readFile(path.join(firstDirectory, 'settings.json'), 'utf-8')) as { appLanguage: string };
    const secondSettings = JSON.parse(await readFile(path.join(secondDirectory, 'settings.json'), 'utf-8')) as { appLanguage: string };

    expect(firstSettings.appLanguage).toBe('pt-BR');
    expect(secondSettings.appLanguage).toBe('en-US');

    await store.select(first.profiles[0].id);
    expect(await store.getSettings()).toEqual({ appLanguage: 'pt-BR' });
  });

  it('returns the selected profile app language', async () => {
    const userDataPath = await createTempDir();
    const ptDirectory = path.join(userDataPath, 'pt-profile');
    const enDirectory = path.join(userDataPath, 'en-profile');
    const store = new ProfileStore(userDataPath);
    const pt = await store.create('PT profile', ptDirectory, 'pt-BR');
    const en = await store.create('EN profile', enDirectory, 'en-US');

    const selectedPt = await store.select(pt.profiles[0].id);
    const selectedEn = await store.select(en.profiles[1].id);

    expect(selectedPt.profiles.find((profile) => profile.id === selectedPt.activeProfileId)?.appLanguage).toBe('pt-BR');
    expect(selectedEn.profiles.find((profile) => profile.id === selectedEn.activeProfileId)?.appLanguage).toBe('en-US');
  });

  it('copies the source app language when cloning a profile', async () => {
    const userDataPath = await createTempDir();
    const sourceDirectory = path.join(userDataPath, 'source-profile');
    const cloneDirectory = path.join(userDataPath, 'clone-profile');
    const store = new ProfileStore(userDataPath);
    const created = await store.create('Source profile', sourceDirectory, 'en-US');

    const cloned = await store.clone(created.profiles[0].id, 'Cloned profile', cloneDirectory);
    const active = cloned.profiles.find((profile) => profile.id === cloned.activeProfileId);

    expect(active?.appLanguage).toBe('en-US');
  });

  it('validates app language schema values', () => {
    expect(createProfileInputSchema.parse({ name: 'PT', directory: '/tmp/pt', appLanguage: 'pt-BR' }).appLanguage).toBe('pt-BR');
    expect(createProfileInputSchema.parse({ name: 'EN', directory: '/tmp/en', appLanguage: 'en-US' }).appLanguage).toBe('en-US');
    expect(() => createProfileInputSchema.parse({ name: 'Bad', directory: '/tmp/bad', appLanguage: 'es-ES' })).toThrow();
  });
});
