import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { TwitchCredentials } from '../../shared/types.js';
import { decryptMarked, encryptMarked, isPlaintextSecret } from '../secret-storage.js';

export class TwitchCredentialsStore {
  private readonly filePath: string;

  constructor(profileDirectory: string) {
    this.filePath = path.join(profileDirectory, 'twitch.json');
  }

  async load(): Promise<TwitchCredentials | null> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8')) as unknown;
    } catch {
      return null;
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as Record<string, unknown>).channel !== 'string' ||
      typeof (parsed as Record<string, unknown>).username !== 'string' ||
      typeof (parsed as Record<string, unknown>).oauthToken !== 'string'
    ) {
      return null;
    }

    const stored = parsed as TwitchCredentials;
    const credentials: TwitchCredentials = {
      ...stored,
      oauthToken: decryptMarked(stored.oauthToken),
    };

    // Migrate a legacy plaintext token to encrypted-at-rest on first read.
    if (isPlaintextSecret(stored.oauthToken)) {
      await this.save(credentials).catch(() => { /* best-effort migration */ });
    }
    return credentials;
  }

  async save(credentials: TwitchCredentials): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const onDisk: TwitchCredentials = {
      ...credentials,
      oauthToken: encryptMarked(credentials.oauthToken),
    };
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(onDisk, null, 2), 'utf8');
    await fs.rename(tmp, this.filePath);
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch {
      // File may not exist
    }
  }
}
