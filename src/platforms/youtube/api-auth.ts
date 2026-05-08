import http from 'node:http';
import path from 'node:path';

import { safeStorage, shell } from 'electron';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

import { JsonStore } from '../../db/json-store.js';

export const YOUTUBE_OAUTH_REDIRECT_PORT = 33020;
export const YOUTUBE_OAUTH_REDIRECT_URI = `http://127.0.0.1:${YOUTUBE_OAUTH_REDIRECT_PORT}`;
const YOUTUBE_OAUTH_TIMEOUT_MS = 180_000;
const TOKENS_FILE = 'youtube-tokens.json';

/**
 * Scopes required for the API driver:
 *  - `youtube.force-ssl` covers reading + sending live chat messages, and
 *    the moderation surface (liveChatMessages.delete, liveChatBans).
 *  - `youtube.readonly` is included for `channels.list?mine=true` so we can
 *    resolve the channel id of the OAuth grant after consent.
 */
export const YOUTUBE_API_SCOPES = [
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.readonly',
];

interface TokenRecord {
  encryptedRefreshToken: string;
  channelId: string;
  channelTitle?: string;
  scope?: string;
  savedAt: number;
}

type TokenFile = Record<string, TokenRecord>;

export interface YouTubeOAuthResult {
  channelConfigId: string;
  channelId: string;
  channelTitle?: string;
  scope?: string;
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption is not available on this machine');
  }
  return safeStorage.encryptString(plain).toString('base64');
}

export function decryptSecret(encrypted: string): string {
  if (!encrypted) return '';
  if (!safeStorage.isEncryptionAvailable()) return '';
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
}

class TokenStore {
  constructor(private readonly getDirectory: () => string) {}

  private store(): JsonStore<TokenFile> {
    return new JsonStore<TokenFile>(path.join(this.getDirectory(), TOKENS_FILE), {});
  }

  getAll(): TokenFile {
    return this.store().read();
  }

  get(channelConfigId: string): TokenRecord | null {
    const all = this.getAll();
    return all[channelConfigId] ?? null;
  }

  set(channelConfigId: string, record: TokenRecord): void {
    const all = this.getAll();
    all[channelConfigId] = record;
    this.store().write(all);
  }

  remove(channelConfigId: string): void {
    const all = this.getAll();
    if (channelConfigId in all) {
      delete all[channelConfigId];
      this.store().write(all);
    }
  }
}

interface CachedClient {
  client: OAuth2Client;
  refreshTokenSig: string; // change detector — bump cache when the saved token rotates
}

export interface YouTubeApiAuthOptions {
  /** Returns the active profile directory (token file lives here, alongside settings). */
  getProfileDirectory: () => string;
  /** Resolves the user's OAuth client credentials. Returns null if not configured. */
  getCredentials: () => { clientId: string; clientSecret: string } | null;
  /** Logging hook for the OAuth flow. */
  log?: (msg: string) => void;
}

export class YouTubeApiAuth {
  private readonly tokenStore: TokenStore;
  private readonly clientCache = new Map<string, CachedClient>();

  constructor(private readonly options: YouTubeApiAuthOptions) {
    this.tokenStore = new TokenStore(options.getProfileDirectory);
  }

  hasCredentials(): boolean {
    const c = this.options.getCredentials();
    return !!c && !!c.clientId && !!c.clientSecret;
  }

  hasRefreshToken(channelConfigId: string): boolean {
    return !!this.tokenStore.get(channelConfigId)?.encryptedRefreshToken;
  }

  removeRefreshToken(channelConfigId: string): void {
    this.tokenStore.remove(channelConfigId);
    this.clientCache.delete(channelConfigId);
  }

  /**
   * Returns an OAuth2Client primed with the saved refresh token. The googleapis
   * library auto-refreshes the access token when it expires, so callers can pass
   * the returned client straight through to `google.youtube('v3').*` calls.
   */
  getOAuth2Client(channelConfigId: string): OAuth2Client {
    const credentials = this.options.getCredentials();
    if (!credentials) throw new Error('YouTube API credentials not configured');
    const tokenRecord = this.tokenStore.get(channelConfigId);
    if (!tokenRecord?.encryptedRefreshToken) {
      throw new Error(`No refresh token stored for channel ${channelConfigId}`);
    }
    const refreshToken = decryptSecret(tokenRecord.encryptedRefreshToken);
    if (!refreshToken) throw new Error('Failed to decrypt YouTube refresh token');

    const sig = `${credentials.clientId}|${tokenRecord.encryptedRefreshToken}`;
    const cached = this.clientCache.get(channelConfigId);
    if (cached && cached.refreshTokenSig === sig) return cached.client;

    const client = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      YOUTUBE_OAUTH_REDIRECT_URI,
    );
    client.setCredentials({ refresh_token: refreshToken });
    this.clientCache.set(channelConfigId, { client, refreshTokenSig: sig });
    return client;
  }

  /**
   * Runs the OAuth 2.0 authorization-code flow via a loopback HTTP server.
   * Saves the resulting refresh token (encrypted) under `channelConfigId`
   * and returns the resolved YouTube channel id.
   */
  async startOAuthFlow(channelConfigId: string): Promise<YouTubeOAuthResult> {
    const credentials = this.options.getCredentials();
    if (!credentials) throw new Error('YouTube API credentials not configured');

    const oauth2 = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      YOUTUBE_OAUTH_REDIRECT_URI,
    );
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // force refresh_token issuance even if user already approved
      scope: YOUTUBE_API_SCOPES,
      state,
    });

    const code = await this.waitForCode(authUrl, state);
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error('Google did not return a refresh token. Revoke prior consent and try again.');
    }
    oauth2.setCredentials(tokens);

    const youtube = google.youtube({ version: 'v3', auth: oauth2 });
    const channelInfo = await youtube.channels.list({ part: ['id', 'snippet'], mine: true });
    const channel = channelInfo.data.items?.[0];
    if (!channel?.id) {
      throw new Error('OAuth succeeded but no channel was returned for the granting account');
    }

    const record: TokenRecord = {
      encryptedRefreshToken: encryptSecret(tokens.refresh_token),
      channelId: channel.id,
      channelTitle: channel.snippet?.title ?? undefined,
      scope: tokens.scope ?? undefined,
      savedAt: Date.now(),
    };
    this.tokenStore.set(channelConfigId, record);
    this.clientCache.delete(channelConfigId); // force re-init on next get

    return {
      channelConfigId,
      channelId: channel.id,
      channelTitle: record.channelTitle,
      scope: record.scope,
    };
  }

  private waitForCode(authUrl: string, expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let finished = false;
      // eslint-disable-next-line prefer-const
      let server: http.Server;

      const timeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        server.close();
        reject(new Error('YouTube OAuth timed out'));
      }, YOUTUBE_OAUTH_TIMEOUT_MS);

      const cleanup = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        server.close();
      };

      server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', YOUTUBE_OAUTH_REDIRECT_URI);
        const error = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');

        if (error) {
          this.respond(res, 400, `Google authorization failed: ${escapeHtml(error)}`);
          cleanup();
          reject(new Error(`Google authorization failed: ${error}`));
          return;
        }
        if (!code) {
          this.respond(res, 400, 'Google did not return an authorization code.');
          cleanup();
          reject(new Error('Google did not return an authorization code'));
          return;
        }
        if (state !== expectedState) {
          this.respond(res, 400, 'OAuth state mismatch.');
          cleanup();
          reject(new Error('YouTube OAuth state mismatch'));
          return;
        }

        this.respond(res, 200, 'YouTube connected. You can close this tab.');
        cleanup();
        resolve(code);
      });

      server.on('error', (cause) => {
        cleanup();
        reject(cause);
      });

      server.listen(YOUTUBE_OAUTH_REDIRECT_PORT, '127.0.0.1', () => {
        this.options.log?.(`[YT-API] OAuth listening on ${YOUTUBE_OAUTH_REDIRECT_URI}`);
        void shell.openExternal(authUrl);
      });
    });
  }

  private respond(res: http.ServerResponse, status: number, body: string): void {
    res.writeHead(status, { 'Content-Type': 'text/html' });
    res.end(
      `<!DOCTYPE html><html><body style="background:#0b1220;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><div>${body}</div></body></html>`,
    );
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
