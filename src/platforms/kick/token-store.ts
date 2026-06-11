import { promises as fs } from 'node:fs';
import path from 'node:path';

import { decryptMarked, encryptMarked, isPlaintextSecret } from '../secret-storage.js';

const TOKEN_FILE = 'kick-token.json';

export interface KickAuthToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken?: string;
  scope?: string;
  expiresAt: number;
}

export interface KickAuthSession {
  token: KickAuthToken;
  channelSlug: string;
  broadcasterUserId: number | null;
}

export class KickTokenStore {
  private readonly filePath: string;

  constructor(profileDirectory: string) {
    this.filePath = path.join(profileDirectory, TOKEN_FILE);
  }

  async load(): Promise<KickAuthSession | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<KickAuthSession>;
      if (!parsed || typeof parsed !== 'object' || !parsed.token || typeof parsed.channelSlug !== 'string') {
        return null;
      }

      const token = parsed.token as Partial<KickAuthToken>;
      if (
        typeof token.accessToken !== 'string' ||
        typeof token.tokenType !== 'string' ||
        typeof token.expiresIn !== 'number' ||
        typeof token.expiresAt !== 'number'
      ) {
        return null;
      }

      const session: KickAuthSession = {
        token: {
          accessToken: decryptMarked(token.accessToken),
          tokenType: token.tokenType,
          expiresIn: token.expiresIn,
          refreshToken: typeof token.refreshToken === 'string' ? decryptMarked(token.refreshToken) : undefined,
          scope: typeof token.scope === 'string' ? token.scope : undefined,
          expiresAt: token.expiresAt,
        },
        channelSlug: parsed.channelSlug,
        broadcasterUserId: typeof parsed.broadcasterUserId === 'number' ? parsed.broadcasterUserId : null,
      };

      // Migrate legacy plaintext tokens to encrypted-at-rest on first read.
      if (isPlaintextSecret(token.accessToken) || isPlaintextSecret(token.refreshToken)) {
        await this.save(session).catch(() => { /* best-effort migration */ });
      }
      return session;
    } catch {
      return null;
    }
  }

  async save(session: KickAuthSession): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const onDisk: KickAuthSession = {
      ...session,
      token: {
        ...session.token,
        accessToken: encryptMarked(session.token.accessToken),
        refreshToken: session.token.refreshToken ? encryptMarked(session.token.refreshToken) : session.token.refreshToken,
      },
    };
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(onDisk, null, 2), 'utf8');
    await fs.rename(tmp, this.filePath);
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch {
      // File may not exist.
    }
  }
}