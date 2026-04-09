import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { YouTubeSettings } from '../../shared/types.js';

const SETTINGS_FILE = 'youtube-settings.json';

const DEFAULT_SETTINGS: YouTubeSettings = {
  channels: [],
  autoConnect: true,
};

export class YouTubeSettingsStore {
  private readonly filePath: string;

  constructor(profileDirectory: string) {
    this.filePath = path.join(profileDirectory, SETTINGS_FILE);
  }

  async load(): Promise<YouTubeSettings> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(data) as YouTubeSettings;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async save(settings: YouTubeSettings): Promise<void> {
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
