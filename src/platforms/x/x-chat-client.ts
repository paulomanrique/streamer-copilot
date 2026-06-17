import { WebSocket } from 'ws';

/**
 * X (Twitter) broadcast live-chat client. X broadcasts run on the legacy
 * Periscope chat infrastructure, which is readable anonymously via a guest
 * token — no user login required. Protocol ported from
 * https://github.com/badlogic/twitter-broadcast-chat.
 *
 * Every request is anonymous (guest token only). We use the plain global
 * `fetch` with explicit headers and `credentials: 'omit'` rather than Electron's
 * session, so the streamer's logged-in X cookies never leak into these reads
 * (an authenticated read returns a different shape — see the YouTube anon-read
 * lesson). All X endpoints live here so there's a single place to update when X
 * changes them.
 */

// The public X web bearer token shipped by the x.com web client; powers guest
// activation. May rotate — kept here as the single point of truth.
const X_WEB_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export interface XChatBootstrap {
  broadcastId: string;
  url: string;
  endpoint: string;
  accessToken: string;
  /** Broadcaster's @handle, when the metadata exposes it. */
  host: string | null;
  title: string | null;
  viewerCount: number;
}

export interface XChatMessage {
  username: string;
  displayName: string;
  text: string;
  timestampMs: number;
  uuid: string;
}

class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function xApiHeaders(guestToken?: string): Record<string, string> {
  return {
    authorization: `Bearer ${X_WEB_BEARER}`,
    accept: 'application/json, text/plain, */*',
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': 'en',
    ...(guestToken ? { 'x-guest-token': guestToken } : {}),
  };
}

/** Headers the Periscope chat API expects (accessChatPublic + history). */
function pscpHeaders(): Record<string, string> {
  return {
    accept: '*/*',
    origin: 'https://x.com',
    referer: 'https://x.com/',
    'content-type': 'application/json',
    'x-periscope-user-agent': 'Twitter/m5',
    'x-attempt': '1',
    'x-idempotence': `${Date.now()}`,
  };
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    // Anonymous: never attach the Electron session's X cookies.
    credentials: 'omit',
    headers: { 'user-agent': BROWSER_UA, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new HttpError(`HTTP ${response.status} for ${url}`, response.status, text);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

export async function activateGuestToken(): Promise<string> {
  const res = await requestJson<{ guest_token?: string }>('https://api.x.com/1.1/guest/activate.json', {
    method: 'POST',
    headers: xApiHeaders(),
  });
  if (!res.guest_token) throw new Error('Could not activate X guest token');
  return res.guest_token;
}

/** Normalizes a handle (strips `@`, a full profile URL, query/path). */
export function normalizeHandle(raw: string): string {
  let v = (raw ?? '').trim();
  v = v.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/^(?:twitter|x)\.com\//, '');
  v = v.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
  return v.split(/[/?#]/)[0] ?? '';
}

/** Pulls a broadcast id out of an `x.com/i/broadcasts/<id>` URL or a raw id. */
export function parseBroadcastId(input: string | undefined): string | null {
  const trimmed = input?.trim() ?? '';
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const m = url.pathname.match(/\/i\/broadcasts\/([^/?#]+)/);
    if (m?.[1]) return m[1];
  } catch {
    /* not a URL — fall through */
  }
  return /^[A-Za-z0-9]+$/.test(trimmed) ? trimmed : null;
}

/**
 * BEST-EFFORT: resolve a handle's current live broadcast id. X exposes no
 * documented endpoint for this; we query the undocumented GraphQL
 * `UserByScreenName` and deep-scan the response for a broadcast id. This is
 * fragile and WILL return null whenever X changes shape, rotates the query id,
 * or the user simply isn't live — callers MUST fall back to a pasted broadcast
 * URL. Never throws.
 */
export async function resolveLiveBroadcastId(
  handle: string,
  guestToken: string,
  log?: (msg: string) => void,
): Promise<string | null> {
  const screenName = normalizeHandle(handle);
  if (!screenName) return null;
  try {
    const variables = encodeURIComponent(JSON.stringify({ screen_name: screenName }));
    const features = encodeURIComponent(
      JSON.stringify({
        hidden_profile_subscriptions_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
      }),
    );
    // Undocumented GraphQL query id — may need updating when X rotates it.
    const url = `https://x.com/i/api/graphql/qW5u-DAuXpMEG0zA1F7UGQ/UserByScreenName?variables=${variables}&features=${features}`;
    const data = await requestJson<unknown>(url, { headers: xApiHeaders(guestToken) });
    const id = deepFindBroadcastId(data);
    if (!id) log?.(`No live broadcast auto-detected for @${screenName}`);
    return id;
  } catch (cause) {
    log?.(`Live-broadcast auto-detect failed for @${screenName}: ${cause instanceof Error ? cause.message : String(cause)}`);
    return null;
  }
}

/** Walks arbitrary JSON looking for a broadcast id (`broadcast_id` field or an
 *  embedded `/i/broadcasts/<id>` url). */
function deepFindBroadcastId(node: unknown, depth = 0): string | null {
  if (depth > 12 || !isRecord(node)) return null;
  for (const [key, value] of Object.entries(node)) {
    if ((key === 'broadcast_id' || key === 'broadcastId') && typeof value === 'string' && value) return value;
    if (typeof value === 'string') {
      const m = value.match(/\/i\/broadcasts\/([A-Za-z0-9]+)/);
      if (m?.[1]) return m[1];
    } else {
      const found = deepFindBroadcastId(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function toCount(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Resolves the chat endpoint + access token for a broadcast (guest auth). */
export async function bootstrapChat(broadcastId: string, guestToken: string): Promise<XChatBootstrap> {
  const show = await requestJson<{ broadcasts?: Record<string, Record<string, unknown>> }>(
    `https://x.com/i/api/1.1/broadcasts/show.json?ids=${encodeURIComponent(broadcastId)}`,
    { headers: xApiHeaders(guestToken) },
  );
  const broadcast = show.broadcasts?.[broadcastId];
  const mediaKey = typeof broadcast?.media_key === 'string' ? broadcast.media_key : null;
  if (!mediaKey) throw new Error(`No media_key for X broadcast ${broadcastId} (is it live?)`);

  const status = await requestJson<{ chatToken?: string }>(
    `https://x.com/i/api/1.1/live_video_stream/status/${encodeURIComponent(mediaKey)}?client=web&use_syndication_guest_id=false&cookie_set_host=x.com`,
    { headers: xApiHeaders(guestToken) },
  );
  if (!status.chatToken) throw new Error(`No chatToken for X broadcast ${broadcastId}`);

  const access = await requestJson<{
    access_token?: string;
    replay_access_token?: string;
    endpoint?: string;
    replay_endpoint?: string;
  }>('https://proxsee-cf.pscp.tv/api/v2/accessChatPublic', {
    method: 'POST',
    headers: pscpHeaders(),
    body: JSON.stringify({ chat_token: status.chatToken }),
  });

  const endpoint = access.endpoint ?? access.replay_endpoint;
  const accessToken = access.access_token ?? access.replay_access_token;
  if (!endpoint || !accessToken) throw new Error(`Could not resolve chat endpoint for X broadcast ${broadcastId}`);

  return {
    broadcastId,
    url: `https://x.com/i/broadcasts/${broadcastId}`,
    endpoint,
    accessToken,
    host: typeof broadcast?.username === 'string' ? broadcast.username : null,
    title: typeof broadcast?.status === 'string' ? broadcast.status : null,
    viewerCount: toCount(broadcast?.total_watching ?? broadcast?.num_watching ?? broadcast?.total_watched),
  };
}

function parseChatMessage(raw: { kind?: number; payload?: string }): XChatMessage | null {
  if (raw.kind !== 1 || !raw.payload) return null;
  const outer = safeParse(raw.payload);
  if (!outer) return null;
  const inner = isRecord(outer.body)
    ? outer.body
    : typeof outer.body === 'string'
      ? safeParse(outer.body)
      : null;
  if (!inner) return null;

  const text = typeof inner.body === 'string' ? inner.body.trim() : '';
  if (!text) return null;

  const sender = isRecord(outer.sender) ? outer.sender : {};
  const timestampMs = typeof inner.timestamp === 'number'
    ? inner.timestamp
    : typeof inner.programDateTime === 'string'
      ? Date.parse(inner.programDateTime)
      : Date.now();
  const username = typeof inner.username === 'string'
    ? inner.username
    : typeof sender.username === 'string'
      ? sender.username
      : 'unknown';
  const displayName = typeof inner.displayName === 'string'
    ? inner.displayName
    : typeof sender.display_name === 'string'
      ? sender.display_name
      : username;
  const uuid = typeof inner.uuid === 'string' && inner.uuid ? inner.uuid : `${username}:${timestampMs}:${text}`;
  return { username, displayName, text, timestampMs, uuid };
}

/** Loads the recent chat history (so a fresh connect isn't an empty feed). */
export async function fetchHistory(bootstrap: XChatBootstrap): Promise<XChatMessage[]> {
  const res = await requestJson<{ messages?: Array<{ kind?: number; payload?: string }> }>(
    `${bootstrap.endpoint.replace(/\/$/, '')}/chatapi/v1/history`,
    {
      method: 'POST',
      headers: pscpHeaders(),
      body: JSON.stringify({ access_token: bootstrap.accessToken, cursor: '', limit: 1000, since: null, quick_get: true }),
    },
  );
  const byUuid = new Map<string, XChatMessage>();
  for (const m of res.messages ?? []) {
    const parsed = parseChatMessage(m);
    if (parsed) byUuid.set(parsed.uuid, parsed);
  }
  return [...byUuid.values()].sort((a, b) => a.timestampMs - b.timestampMs);
}

/** Opens the live chat WebSocket; returns a `stop()` fn. */
export function connectLiveChat(
  bootstrap: XChatBootstrap,
  onMessage: (msg: XChatMessage) => void,
  onError: (err: Error) => void,
  onClose: () => void,
): () => void {
  const wsUrl = `${bootstrap.endpoint.replace(/^http/, 'ws').replace(/\/$/, '')}/chatapi/v1/chatnow`;
  const ws = new WebSocket(wsUrl);
  let closed = false;

  ws.on('open', () => {
    // 1) authenticate the socket, 2) subscribe to the broadcast's chat room.
    ws.send(JSON.stringify({ payload: JSON.stringify({ access_token: bootstrap.accessToken }), kind: 3 }));
    ws.send(JSON.stringify({
      payload: JSON.stringify({ body: JSON.stringify({ room: bootstrap.broadcastId }), kind: 1 }),
      kind: 2,
    }));
  });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(String(data)) as { kind?: number; payload?: string };
      if (msg.kind === 1 && msg.payload) {
        const parsed = parseChatMessage(msg);
        if (parsed) onMessage(parsed);
      }
    } catch {
      /* ignore non-JSON / control frames */
    }
  });
  ws.on('error', () => {
    if (!closed) {
      closed = true;
      onError(new Error(`X chat WebSocket error for broadcast ${bootstrap.broadcastId}`));
    }
  });
  ws.on('close', () => {
    if (!closed) {
      closed = true;
      onClose();
    }
  });

  return () => {
    closed = true;
    try { ws.close(); } catch { /* ignore */ }
  };
}
