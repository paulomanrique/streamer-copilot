import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { YouTubeChannelConfig, YouTubeSettings } from '../../shared/types.js';

const SETTINGS_FILE = 'youtube-settings.json';

const DEFAULT_SETTINGS: YouTubeSettings = {
  channels: [],
  autoConnect: true,
};

/**
 * Strips fields that an older scrape+API hybrid build left behind on disk —
 * `driver`, `apiAuth` per channel, and the global `apiCredentials`. Those
 * concepts have moved to the per-account `youtube-api` provider, so loading
 * them here would just shadow the new model.
 */
function migrateLegacy(raw: Record<string, unknown>): YouTubeSettings {
  const channelsRaw = Array.isArray(raw.channels) ? (raw.channels as Record<string, unknown>[]) : [];
  const channels: YouTubeChannelConfig[] = channelsRaw
    .filter((c) => typeof c.id === 'string' && typeof c.handle === 'string')
    .map((c) => ({
      id: c.id as string,
      handle: c.handle as string,
      name: typeof c.name === 'string' ? c.name : undefined,
      enabled: c.enabled === true,
    }));
  return {
    channels,
    autoConnect: raw.autoConnect !== false,
    chatChannelPageId: typeof raw.chatChannelPageId === 'string' ? raw.chatChannelPageId : undefined,
    chatChannelName: typeof raw.chatChannelName === 'string' ? raw.chatChannelName : undefined,
  };
}

export class YouTubeSettingsStore {
  private readonly filePath: string;

  constructor(profileDirectory: string) {
    this.filePath = path.join(profileDirectory, SETTINGS_FILE);
  }

  async load(): Promise<YouTubeSettings> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const raw = JSON.parse(data) as Record<string, unknown>;
      return migrateLegacy(raw);
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
