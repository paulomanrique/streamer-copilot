import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { DEFAULT_APP_LANGUAGE, PROFILE_CONFIG_FILES } from '../../shared/constants.js';
import type { AppLanguage, ProfileSettings, ProfileSummary, ProfilesSnapshot } from '../../shared/types.js';

interface ProfileRecord {
  id: string;
  name: string;
  directory: string;
  lastUsedAt: string;
}

interface ProfileState {
  activeProfileId: string;
  profiles: ProfileRecord[];
  /** When true, the boot picker auto-selects `activeProfileId` instead of
   *  prompting. Reset to false when the user switches profiles mid-session
   *  (so the next boot asks again). Set to true when the user opts in via the
   *  picker's "don't ask again" checkbox. */
  autoSelectActiveProfile?: boolean;
}

const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  appLanguage: DEFAULT_APP_LANGUAGE,
};
const EMPTY_ARRAY = '[]\n';

export class ProfileStore {
  private readonly stateFilePath: string;

  constructor(private readonly userDataPath: string) {
    this.stateFilePath = path.join(userDataPath, 'profiles.json');
  }

  async list(): Promise<ProfilesSnapshot> {
    const state = await this.readState();
    const availableState = await this.withAvailableActiveProfile(state);
    return await this.toSnapshot(availableState);
  }

  async select(profileId: string): Promise<ProfilesSnapshot> {
    const state = await this.readState();
    const target = state.profiles.find((profile) => profile.id === profileId);

    if (!target) {
      throw new Error(`Profile not found: ${profileId}`);
    }
    await this.assertProfileDirectoryAvailable(target);

    const now = new Date().toISOString();
    target.lastUsedAt = now;
    state.activeProfileId = profileId;

    await this.writeState(state);

    return await this.toSnapshot(state);
  }

  async setAutoSelectActiveProfile(autoSelect: boolean): Promise<ProfilesSnapshot> {
    const state = await this.readState();
    state.autoSelectActiveProfile = autoSelect;
    await this.writeState(state);
    return await this.toSnapshot(state);
  }

  async create(name: string, directory: string, appLanguage: AppLanguage): Promise<ProfilesSnapshot> {
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
    await this.ensureProfileFiles(state, { createMissingDirectories: true });
    await this.writeProfileSettings(normalizedDirectory, { appLanguage });
    return await this.toSnapshot(state);
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
    return await this.toSnapshot(state);
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

    await this.ensureProfileFiles(state, { createMissingDirectories: false });
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
    return await this.toSnapshot(state);
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
    return await this.toSnapshot(state);
  }

  async getSettings(): Promise<ProfileSettings> {
    const activeProfile = await this.getActiveProfile();
    return await this.readProfileSettings(activeProfile.directory);
  }

  async saveSettings(settings: ProfileSettings): Promise<ProfileSettings> {
    const activeProfile = await this.getActiveProfile();
    const nextSettings = this.normalizeProfileSettings(settings);
    await this.writeProfileSettings(activeProfile.directory, nextSettings);
    return nextSettings;
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
      autoSelectActiveProfile: false,
    };
  }

  private normalizeState(state: ProfileState): ProfileState {
    const profiles = Array.isArray(state.profiles) ? state.profiles : [];
    const activeProfileId = profiles.some((profile) => profile.id === state.activeProfileId)
      ? state.activeProfileId
      : (profiles[0]?.id ?? '');

    return {
      activeProfileId,
      profiles,
      autoSelectActiveProfile: state.autoSelectActiveProfile === true,
    };
  }

  private async ensureProfileFiles(
    state: ProfileState,
    options: { createMissingDirectories: boolean },
  ): Promise<void> {
    for (const profile of state.profiles) {
      if (options.createMissingDirectories) {
        await fs.mkdir(profile.directory, { recursive: true });
      } else {
        const isAvailable = await this.profileDirectoryExists(profile.directory);
        if (!isAvailable) continue;
      }

      const files = [
        { fileName: PROFILE_CONFIG_FILES.settings, defaultContent: `${JSON.stringify(DEFAULT_PROFILE_SETTINGS, null, 2)}\n` },
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

  private async withAvailableActiveProfile(state: ProfileState): Promise<ProfileState> {
    if (!state.activeProfileId) return state;

    const activeProfile = state.profiles.find((profile) => profile.id === state.activeProfileId);
    if (!activeProfile) return { ...state, activeProfileId: '' };

    const isAvailable = await this.profileDirectoryExists(activeProfile.directory);
    return isAvailable ? state : { ...state, activeProfileId: '' };
  }

  private async toSnapshot(state: ProfileState): Promise<ProfilesSnapshot> {
    const profiles: ProfileSummary[] = await Promise.all(
      state.profiles.map(async (profile) => {
        const settings = await this.readProfileSettingsIfAvailable(profile.directory);
        return {
          ...profile,
          appLanguage: settings.appLanguage,
        };
      }),
    );

    return {
      activeProfileId: state.activeProfileId,
      profiles,
      autoSelectActiveProfile: state.autoSelectActiveProfile === true,
    };
  }

  private async getActiveProfile(): Promise<ProfileRecord> {
    const state = await this.readState();
    const activeProfile = state.profiles.find((profile) => profile.id === state.activeProfileId);
    if (!activeProfile) throw new Error('No active profile');
    await this.assertProfileDirectoryAvailable(activeProfile);
    return activeProfile;
  }

  private async readProfileSettingsIfAvailable(directory: string): Promise<ProfileSettings> {
    const isAvailable = await this.profileDirectoryExists(directory);
    if (!isAvailable) return { ...DEFAULT_PROFILE_SETTINGS };
    return await this.readProfileSettings(directory);
  }

  private async readProfileSettings(directory: string): Promise<ProfileSettings> {
    try {
      const content = await fs.readFile(path.join(directory, PROFILE_CONFIG_FILES.settings), 'utf-8');
      return this.normalizeProfileSettings(JSON.parse(content));
    } catch {
      return { ...DEFAULT_PROFILE_SETTINGS };
    }
  }

  private async writeProfileSettings(directory: string, settings: ProfileSettings): Promise<void> {
    await fs.mkdir(directory, { recursive: true });
    const nextSettings = this.normalizeProfileSettings(settings);
    await fs.writeFile(
      path.join(directory, PROFILE_CONFIG_FILES.settings),
      `${JSON.stringify(nextSettings, null, 2)}\n`,
      'utf-8',
    );
  }

  private normalizeProfileSettings(raw: unknown): ProfileSettings {
    const input = raw && typeof raw === 'object' ? raw as Partial<ProfileSettings> : {};
    return {
      appLanguage: this.normalizeAppLanguage(input.appLanguage),
    };
  }

  private normalizeAppLanguage(value: unknown): AppLanguage {
    return value === 'en-US' || value === 'pt-BR' ? value : DEFAULT_APP_LANGUAGE;
  }

  private async assertProfileDirectoryAvailable(profile: ProfileRecord): Promise<void> {
    const isAvailable = await this.profileDirectoryExists(profile.directory);
    if (!isAvailable) {
      throw new Error(`Profile directory is not available: ${profile.directory}`);
    }
  }

  private async profileDirectoryExists(directory: string): Promise<boolean> {
    try {
      const stat = await fs.stat(directory);
      return stat.isDirectory();
    } catch {
      return false;
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
