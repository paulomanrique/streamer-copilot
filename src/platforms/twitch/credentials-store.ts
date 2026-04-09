import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { TwitchCredentials } from '../../shared/types.js';

export class TwitchCredentialsStore {
  private readonly filePath: string;

  constructor(profileDirectory: string) {
    this.filePath = path.join(profileDirectory, 'twitch.json');
  }

  async load(): Promise<TwitchCredentials | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        'channel' in parsed &&
        'username' in parsed &&
        'oauthToken' in parsed &&
        typeof (parsed as Record<string, unknown>).channel === 'string' &&
        typeof (parsed as Record<string, unknown>).username === 'string' &&
        typeof (parsed as Record<string, unknown>).oauthToken === 'string'
      ) {
        return parsed as TwitchCredentials;
      }
      return null;
    } catch {
      return null;
    }
  }

  async save(credentials: TwitchCredentials): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(credentials, null, 2), 'utf8');
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch {
      // File may not exist
    }
  }
}
