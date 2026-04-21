import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TikTokSettings } from '../../shared/types.js';

const SETTINGS_FILE = 'tiktok-settings.json';

const DEFAULT_SETTINGS: TikTokSettings = {
  username: '',
  autoConnect: false,
};

export class TikTokSettingsStore {
  private readonly filePath: string;

  constructor(profileDirectory: string) {
    this.filePath = path.join(profileDirectory, SETTINGS_FILE);
  }

  async load(): Promise<TikTokSettings> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<TikTokSettings>;
      return {
        username: typeof parsed.username === 'string' ? parsed.username : DEFAULT_SETTINGS.username,
        autoConnect: typeof parsed.autoConnect === 'boolean' ? parsed.autoConnect : DEFAULT_SETTINGS.autoConnect,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async save(settings: TikTokSettings): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch {
      // Ignore
    }
  }
}
