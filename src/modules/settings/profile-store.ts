import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { PROFILE_CONFIG_FILES } from '../../shared/constants.js';
import type { ProfilesSnapshot } from '../../shared/types.js';

interface ProfileRecord {
  id: string;
  name: string;
  directory: string;
  lastUsedAt: string;
}

interface ProfileState {
  activeProfileId: string;
  profiles: ProfileRecord[];
}

const EMPTY_OBJECT = '{}\n';
const EMPTY_ARRAY = '[]\n';

export class ProfileStore {
  private readonly stateFilePath: string;

  constructor(private readonly userDataPath: string) {
    this.stateFilePath = path.join(userDataPath, 'profiles.json');
  }

  async list(): Promise<ProfilesSnapshot> {
    const state = await this.readState();
    await this.ensureProfileFiles(state);
    return state;
  }

  async select(profileId: string): Promise<ProfilesSnapshot> {
    const state = await this.readState();
    const target = state.profiles.find((profile) => profile.id === profileId);

    if (!target) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const now = new Date().toISOString();
    target.lastUsedAt = now;
    state.activeProfileId = profileId;

    await this.writeState(state);
    await this.ensureProfileFiles(state);

    return state;
  }

  async create(name: string, directory: string): Promise<ProfilesSnapshot> {
    const state = await this.readState();
    const normalizedName = name.trim();
    const normalizedDirectory = path.resolve(directory);

    if (!normalizedName) throw new Error('Profile name is required');
    this.assertUniqueName(state, normalizedName);
    this.assertUniqueDirectory(state, normalizedDirectory);

    const profileId = randomUUID();
    state.profiles.push({
      id: profileId,
      name: normalizedName,
      directory: normalizedDirectory,
      lastUsedAt: new Date().toISOString(),
    });
    state.activeProfileId = profileId;

    await this.writeState(state);
    await this.ensureProfileFiles(state);
    return state;
  }

  async rename(profileId: string, name: string): Promise<ProfilesSnapshot> {
    const state = await this.readState();
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Profile name is required');

    const target = state.profiles.find((profile) => profile.id === profileId);
    if (!target) throw new Error(`Profile not found: ${profileId}`);

    this.assertUniqueName(state, normalizedName, profileId);
    target.name = normalizedName;

    await this.writeState(state);
    return state;
  }

  async clone(profileId: string, name: string, directory: string): Promise<ProfilesSnapshot> {
    const state = await this.readState();
    const source = state.profiles.find((profile) => profile.id === profileId);
    if (!source) throw new Error(`Profile not found: ${profileId}`);

    const normalizedName = name.trim();
    const normalizedDirectory = path.resolve(directory);
    if (!normalizedName) throw new Error('Profile name is required');
    this.assertUniqueName(state, normalizedName);
    this.assertUniqueDirectory(state, normalizedDirectory);

    await this.ensureProfileFiles(state);
    await fs.mkdir(normalizedDirectory, { recursive: true });

    const files = Object.values(PROFILE_CONFIG_FILES);
    for (const fileName of files) {
      const sourcePath = path.join(source.directory, fileName);
      const destinationPath = path.join(normalizedDirectory, fileName);
      await fs.copyFile(sourcePath, destinationPath);
    }

    const cloneId = randomUUID();
    state.profiles.push({
      id: cloneId,
      name: normalizedName,
      directory: normalizedDirectory,
      lastUsedAt: new Date().toISOString(),
    });
    state.activeProfileId = cloneId;

    await this.writeState(state);
    return state;
  }

  async delete(profileId: string): Promise<ProfilesSnapshot> {
    const state = await this.readState();
    if (state.profiles.length <= 1) {
      throw new Error('At least one profile must remain');
    }

    const targetIndex = state.profiles.findIndex((profile) => profile.id === profileId);
    if (targetIndex < 0) throw new Error(`Profile not found: ${profileId}`);

    state.profiles.splice(targetIndex, 1);
    if (!state.profiles.some((profile) => profile.id === state.activeProfileId)) {
      state.activeProfileId = state.profiles[0].id;
      state.profiles[0].lastUsedAt = new Date().toISOString();
    }

    await this.writeState(state);
    return state;
  }

  private async readState(): Promise<ProfileState> {
    await fs.mkdir(this.userDataPath, { recursive: true });

    try {
      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      const parsed = JSON.parse(content) as ProfileState;

      if (!Array.isArray(parsed?.profiles)) {
        throw new Error('Invalid profile state');
      }

      return this.normalizeState(parsed);
    } catch (err) {
      const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT';
      const initial = this.createInitialState();
      if (isNotFound) {
        await this.writeState(initial);
      }
      return initial;
    }
  }

  private async writeState(state: ProfileState): Promise<void> {
    await fs.writeFile(this.stateFilePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  }

  private createInitialState(): ProfileState {
    return {
      activeProfileId: '',
      profiles: [],
    };
  }

  private normalizeState(state: ProfileState): ProfileState {
    const profiles = Array.isArray(state.profiles) ? state.profiles : [];
    const activeProfileId = profiles.some((profile) => profile.id === state.activeProfileId)
      ? state.activeProfileId
      : (profiles[0]?.id ?? '');

    return { activeProfileId, profiles };
  }

  private async ensureProfileFiles(state: ProfileState): Promise<void> {
    for (const profile of state.profiles) {
      await fs.mkdir(profile.directory, { recursive: true });

      const files = [
        { fileName: PROFILE_CONFIG_FILES.settings, defaultContent: EMPTY_OBJECT },
        { fileName: PROFILE_CONFIG_FILES.soundCommands, defaultContent: EMPTY_ARRAY },
        { fileName: PROFILE_CONFIG_FILES.textCommands, defaultContent: EMPTY_ARRAY },
        { fileName: PROFILE_CONFIG_FILES.voiceCommands, defaultContent: EMPTY_ARRAY },
        { fileName: PROFILE_CONFIG_FILES.scheduled, defaultContent: EMPTY_ARRAY },
      ];

      for (const file of files) {
        const filePath = path.join(profile.directory, file.fileName);

        try {
          await fs.access(filePath);
        } catch {
          await fs.writeFile(filePath, file.defaultContent, 'utf-8');
        }
      }
    }
  }

  private assertUniqueName(state: ProfileState, name: string, ignoreProfileId?: string): void {
    const collides = state.profiles.some(
      (profile) => profile.name.toLowerCase() === name.toLowerCase() && profile.id !== ignoreProfileId,
    );
    if (collides) throw new Error(`A profile named "${name}" already exists`);
  }

  private assertUniqueDirectory(state: ProfileState, directory: string, ignoreProfileId?: string): void {
    const collides = state.profiles.some(
      (profile) => path.resolve(profile.directory) === directory && profile.id !== ignoreProfileId,
    );
    if (collides) throw new Error('A profile already uses this directory');
  }
}
