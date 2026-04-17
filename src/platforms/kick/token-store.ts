import { promises as fs } from 'node:fs';
import path from 'node:path';

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

      return {
        token: {
          accessToken: token.accessToken,
          tokenType: token.tokenType,
          expiresIn: token.expiresIn,
          refreshToken: typeof token.refreshToken === 'string' ? token.refreshToken : undefined,
          scope: typeof token.scope === 'string' ? token.scope : undefined,
          expiresAt: token.expiresAt,
        },
        channelSlug: parsed.channelSlug,
        broadcasterUserId: typeof parsed.broadcasterUserId === 'number' ? parsed.broadcasterUserId : null,
      };
    } catch {
      return null;
    }
  }

  async save(session: KickAuthSession): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(session, null, 2), 'utf8');
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch {
      // File may not exist.
    }
  }
}