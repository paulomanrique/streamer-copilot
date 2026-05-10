import http from 'node:http';

import { safeStorage, shell } from 'electron';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

export const YOUTUBE_OAUTH_REDIRECT_PORT = 33020;
export const YOUTUBE_OAUTH_REDIRECT_URI = `http://127.0.0.1:${YOUTUBE_OAUTH_REDIRECT_PORT}`;
const YOUTUBE_OAUTH_TIMEOUT_MS = 180_000;

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

export interface YouTubeOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface YouTubeOAuthResult {
  /** Plaintext refresh token. Callers must encrypt with safeStorage before persisting. */
  refreshToken: string;
  /** Resolved YouTube channel id (UC...) for the OAuth grant. */
  channelId: string;
  /** Channel display title. */
  channelTitle?: string;
  /** Granted scopes joined with spaces, exactly as Google returned them. */
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

/**
 * Builds an OAuth2Client primed with refresh-token credentials. The googleapis
 * library auto-refreshes the access token when it expires, so callers can pass
 * the returned client straight through to `google.youtube('v3').*` calls.
 */
export function buildYouTubeOAuth2Client(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): OAuth2Client {
  const client = new google.auth.OAuth2(input.clientId, input.clientSecret, YOUTUBE_OAUTH_REDIRECT_URI);
  client.setCredentials({ refresh_token: input.refreshToken });
  return client;
}

/**
 * Runs the OAuth 2.0 authorization-code flow via a loopback HTTP server.
 *
 * Returns the freshly-issued refresh token (plaintext) and the channel
 * resolved by `channels.list?mine=true`. Persistence and encryption are
 * the caller's responsibility — this module is stateless on disk.
 */
export async function startYouTubeOAuthFlow(
  credentials: YouTubeOAuthCredentials,
  options: { log?: (msg: string) => void } = {},
): Promise<YouTubeOAuthResult> {
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

  const code = await waitForCode(authUrl, state, options.log);
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

  return {
    refreshToken: tokens.refresh_token,
    channelId: channel.id,
    channelTitle: channel.snippet?.title ?? undefined,
    scope: tokens.scope ?? undefined,
  };
}

function waitForCode(authUrl: string, expectedState: string, log?: (msg: string) => void): Promise<string> {
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
        respond(res, 400, `Google authorization failed: ${escapeHtml(error)}`);
        cleanup();
        reject(new Error(`Google authorization failed: ${error}`));
        return;
      }
      if (!code) {
        respond(res, 400, 'Google did not return an authorization code.');
        cleanup();
        reject(new Error('Google did not return an authorization code'));
        return;
      }
      if (state !== expectedState) {
        respond(res, 400, 'OAuth state mismatch.');
        cleanup();
        reject(new Error('YouTube OAuth state mismatch'));
        return;
      }

      respond(res, 200, 'YouTube connected. You can close this tab.');
      cleanup();
      resolve(code);
    });

    server.on('error', (cause) => {
      cleanup();
      reject(cause);
    });

    server.listen(YOUTUBE_OAUTH_REDIRECT_PORT, '127.0.0.1', () => {
      log?.(`[YT-API] OAuth listening on ${YOUTUBE_OAUTH_REDIRECT_URI}`);
      void shell.openExternal(authUrl);
    });
  });
}

function respond(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html' });
  res.end(
    `<!DOCTYPE html><html><body style="background:#0b1220;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><div>${body}</div></body></html>`,
  );
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
