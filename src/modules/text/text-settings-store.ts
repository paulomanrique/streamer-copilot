import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { TextSettings } from '../../shared/types.js';

const SETTINGS_FILE = 'text-settings.json';

const DEFAULT_SETTINGS: TextSettings = {
  defaultCooldownSeconds: 0,
  defaultUserCooldownSeconds: 0,
};

export class TextSettingsStore {
  private readonly filePath: string;

  constructor(profileDirectory: string) {
    this.filePath = path.join(profileDirectory, SETTINGS_FILE);
  }

  async load(): Promise<TextSettings> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<TextSettings>;
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

  async save(input: TextSettings): Promise<TextSettings> {
    const next: TextSettings = {
      defaultCooldownSeconds: input.defaultCooldownSeconds,
      defaultUserCooldownSeconds: input.defaultUserCooldownSeconds,
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }
}
