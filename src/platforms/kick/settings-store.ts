import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { KickSettings } from '../../shared/types.js';

const SETTINGS_FILE = 'kick-settings.json';

const DEFAULT_SETTINGS: KickSettings = {
  channelInput: '',
  clientId: '',
  clientSecret: '',
  autoConnect: false,
};

export class KickSettingsStore {
  private readonly filePath: string;

  constructor(profileDirectory: string) {
    this.filePath = path.join(profileDirectory, SETTINGS_FILE);
  }

  async load(): Promise<KickSettings> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<KickSettings>;
      return {
        channelInput: typeof parsed.channelInput === 'string' ? parsed.channelInput : DEFAULT_SETTINGS.channelInput,
        clientId: typeof parsed.clientId === 'string' ? parsed.clientId : DEFAULT_SETTINGS.clientId,
        clientSecret: typeof parsed.clientSecret === 'string' ? parsed.clientSecret : DEFAULT_SETTINGS.clientSecret,
        autoConnect: typeof parsed.autoConnect === 'boolean' ? parsed.autoConnect : DEFAULT_SETTINGS.autoConnect,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async save(settings: KickSettings): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  async clear(): Promise<void> {
    await fs.rm(this.filePath, { force: true });
  }
}
