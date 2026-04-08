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

  private async readState(): Promise<ProfileState> {
    await fs.mkdir(this.userDataPath, { recursive: true });

    try {
      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      const parsed = JSON.parse(content) as ProfileState;

      if (!parsed?.activeProfileId || !Array.isArray(parsed?.profiles) || parsed.profiles.length === 0) {
        throw new Error('Invalid profile state');
      }

      return parsed;
    } catch {
      const initial = this.createInitialState();
      await this.writeState(initial);
      return initial;
    }
  }

  private async writeState(state: ProfileState): Promise<void> {
    await fs.writeFile(this.stateFilePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  }

  private createInitialState(): ProfileState {
    const profileId = randomUUID();

    return {
      activeProfileId: profileId,
      profiles: [
        {
          id: profileId,
          name: 'Principal',
          directory: path.join(this.userDataPath, 'profiles', 'principal'),
          lastUsedAt: new Date().toISOString(),
        },
      ],
    };
  }

  private async ensureProfileFiles(state: ProfileState): Promise<void> {
    for (const profile of state.profiles) {
      await fs.mkdir(profile.directory, { recursive: true });

      const files = [
        { fileName: PROFILE_CONFIG_FILES.settings, defaultContent: EMPTY_OBJECT },
        { fileName: PROFILE_CONFIG_FILES.soundCommands, defaultContent: EMPTY_ARRAY },
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
}
