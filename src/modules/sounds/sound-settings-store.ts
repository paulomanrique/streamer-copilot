import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { SoundSettings } from '../../shared/types.js';

const SETTINGS_FILE = 'sound-settings.json';

const DEFAULT_SETTINGS: SoundSettings = {
  defaultCooldownSeconds: 0,
  defaultUserCooldownSeconds: 0,
};

export class SoundSettingsStore {
  private readonly filePath: string;

  constructor(profileDirectory: string) {
    this.filePath = path.join(profileDirectory, SETTINGS_FILE);
  }

  async load(): Promise<SoundSettings> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<SoundSettings>;
      return {
        defaultCooldownSeconds:
          typeof parsed.defaultCooldownSeconds === 'number'
            ? parsed.defaultCooldownSeconds
            : DEFAULT_SETTINGS.defaultCooldownSeconds,
        defaultUserCooldownSeconds:
          typeof parsed.defaultUserCooldownSeconds === 'number'
            ? parsed.defaultUserCooldownSeconds
            : DEFAULT_SETTINGS.defaultUserCooldownSeconds,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async save(input: SoundSettings): Promise<SoundSettings> {
    const next: SoundSettings = {
      defaultCooldownSeconds: input.defaultCooldownSeconds,
      defaultUserCooldownSeconds: input.defaultUserCooldownSeconds,
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }
}
