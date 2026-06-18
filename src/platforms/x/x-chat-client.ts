import { session } from 'electron';
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

// Undocumented GraphQL query ids used for live auto-detection. These rotate
// occasionally — when detection breaks, grab the fresh ids from the x.com web
// client (DevTools → Network) and update them here, in one place.
const GQL_USER_BY_SCREEN_NAME = 'qW5u-DAuXpMEG0zA1F7UGQ';
const GQL_USER_TWEETS = 'RyDU3I9VJtPF-Pnl6vrRlw';

// Feature flags the GraphQL endpoints require. Minimal verified set for
// UserByScreenName; the fuller set X's web client sends for UserTweets.
const USER_BY_SCREEN_NAME_FEATURES = {
  hidden_profile_subscriptions_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
};
const USER_TWEETS_FEATURES = {
  rweb_video_screen_enabled: false,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

export interface XChatBootstrap {
  broadcastId: string;
  url: string;
  endpoint: string;
  accessToken: string;
  /** Broadcaster's @handle, when the metadata exposes it. */
  host: string | null;
  title: string | null;
  viewerCount: number;
  /** Raw X chat permission type, e.g. 'StreamTypePublic' / 'StreamTypeOnlyFriends'. */
  chatPermissionType: string | null;
  /** Whether the chat is readable by an anonymous guest. False for friends-only
   *  / restricted broadcasts — the connection still works (live + viewer count),
   *  but no chat messages are delivered to a guest. */
  chatReadable: boolean;
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

/** Reads the streamer's X auth from the default Electron session (set by the
 *  in-app X login). Returns null when not logged in. Cookies are read live and
 *  never persisted/logged elsewhere. */
async function getXAuthFromSession(): Promise<{ cookie: string; csrf: string } | null> {
  try {
    const cookies = await session.defaultSession.cookies.get({ url: 'https://x.com' });
    const authToken = cookies.find((c) => c.name === 'auth_token')?.value;
    const csrf = cookies.find((c) => c.name === 'ct0')?.value;
    if (!authToken || !csrf) return null;
    return { cookie: `auth_token=${authToken}; ct0=${csrf}`, csrf };
  } catch {
    return null;
  }
}

/** handle → numeric user id (rest_id). Works with the guest token. */
async function fetchUserRestId(screenName: string, guestToken: string): Promise<string | null> {
  const variables = encodeURIComponent(JSON.stringify({ screen_name: screenName }));
  const features = encodeURIComponent(JSON.stringify(USER_BY_SCREEN_NAME_FEATURES));
  const url = `https://x.com/i/api/graphql/${GQL_USER_BY_SCREEN_NAME}/UserByScreenName?variables=${variables}&features=${features}`;
  const data = await requestJson<{ data?: { user?: { result?: { rest_id?: string } } } }>(url, {
    headers: xApiHeaders(guestToken),
  });
  return data.data?.user?.result?.rest_id ?? null;
}

/** Pulls `{ broadcast_id, broadcast_state }` out of a GraphQL card's
 *  binding_values, which come either as an array of `{ key, value:{string_value} }`
 *  or as an object map `{ broadcast_id: { string_value } }`. */
function bindingArrayToMap(arr: unknown[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  let any = false;
  for (const el of arr) {
    if (isRecord(el) && typeof el.key === 'string' && isRecord(el.value)) {
      const sv = (el.value as Record<string, unknown>).string_value;
      if (typeof sv === 'string') { out[el.key] = sv; any = true; }
    }
  }
  return any ? out : null;
}

/** Walks UserTweets JSON for broadcast cards and returns the most-recent LIVE
 *  broadcast id. Prefers cards whose `broadcast_state` is RUNNING; if no card
 *  exposes a state at all, falls back to the most-recent broadcast id and lets
 *  bootstrap validate liveness (so detection still works if the field is absent). */
function findLiveBroadcastId(root: unknown): string | null {
  const cards: Array<{ id: string; state: string | null }> = [];
  const walk = (node: unknown, depth: number): void => {
    if (depth > 24 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      const kv = bindingArrayToMap(node);
      if (kv && typeof kv.broadcast_id === 'string') {
        cards.push({ id: kv.broadcast_id, state: kv.broadcast_state ?? null });
      }
      for (const v of node) walk(v, depth + 1);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (isRecord(rec.broadcast_id) && typeof (rec.broadcast_id as Record<string, unknown>).string_value === 'string') {
      const st = isRecord(rec.broadcast_state) ? (rec.broadcast_state as Record<string, unknown>).string_value : null;
      cards.push({
        id: (rec.broadcast_id as Record<string, unknown>).string_value as string,
        state: typeof st === 'string' ? st : null,
      });
    }
    for (const v of Object.values(rec)) walk(v, depth + 1);
  };
  walk(root, 0);
  if (cards.length === 0) return null;
  const running = cards.find((c) => c.state != null && /running/i.test(c.state));
  if (running) return running.id;
  // States present but none running → not live. No states at all → best-effort.
  return cards.some((c) => c.state != null) ? null : cards[0].id;
}

/**
 * Resolves a handle's current LIVE broadcast id. Requires the streamer to be
 * logged into X (cookies in the default Electron session) — X exposes no public
 * guest endpoint for this. Chain: handle → rest_id (UserByScreenName, guest) →
 * recent tweets (UserTweets, authed) → the live broadcast card's broadcast_id.
 * Returns null (never throws) when not logged in, the user isn't live, or X
 * changed shape — callers fall back to the pasted broadcast URL.
 */
export async function resolveLiveBroadcastId(
  handle: string,
  guestToken: string,
  log?: (msg: string) => void,
): Promise<string | null> {
  const screenName = normalizeHandle(handle);
  if (!screenName) return null;
  const auth = await getXAuthFromSession();
  if (!auth) {
    log?.('Not logged in to X — auto-detection needs an X login (Conexões → X → Entrar). Paste the broadcast URL otherwise.');
    return null;
  }
  try {
    const restId = await fetchUserRestId(screenName, guestToken);
    if (!restId) {
      log?.(`Could not resolve the X user id for @${screenName}`);
      return null;
    }
    const variables = encodeURIComponent(JSON.stringify({
      userId: restId, count: 20, includePromotedContent: true,
      withQuickPromoteEligibilityTweetFields: true, withVoice: true,
    }));
    const features = encodeURIComponent(JSON.stringify(USER_TWEETS_FEATURES));
    const fieldToggles = encodeURIComponent(JSON.stringify({ withArticlePlainText: false }));
    const url = `https://x.com/i/api/graphql/${GQL_USER_TWEETS}/UserTweets?variables=${variables}&features=${features}&fieldToggles=${fieldToggles}`;
    const response = await fetch(url, {
      credentials: 'omit',
      headers: {
        authorization: `Bearer ${X_WEB_BEARER}`,
        'x-csrf-token': auth.csrf,
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-active-user': 'yes',
        'content-type': 'application/json',
        'user-agent': BROWSER_UA,
        cookie: auth.cookie,
      },
    });
    if (!response.ok) {
      log?.(`X UserTweets returned HTTP ${response.status} for @${screenName} (session expired? re-login)`);
      return null;
    }
    const data = safeParse(await response.text());
    const id = data ? findLiveBroadcastId(data) : null;
    if (!id) log?.(`No live broadcast found in @${screenName}'s recent tweets`);
    return id;
  } catch (cause) {
    log?.(`X live auto-detect failed for @${screenName}: ${cause instanceof Error ? cause.message : String(cause)}`);
    return null;
  }
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

  const status = await requestJson<{ chatToken?: string; chatPermissionType?: string }>(
    `https://x.com/i/api/1.1/live_video_stream/status/${encodeURIComponent(mediaKey)}?client=web&use_syndication_guest_id=false&cookie_set_host=x.com`,
    { headers: xApiHeaders(guestToken) },
  );
  if (!status.chatToken) throw new Error(`No chatToken for X broadcast ${broadcastId}`);
  // Anonymous guests can only read the chat when it's public. Friends-only /
  // restricted broadcasts (chatPermissionType !== 'StreamTypePublic') still
  // bootstrap and report viewers, but deliver no chat messages to a guest.
  const chatPermissionType = typeof status.chatPermissionType === 'string' ? status.chatPermissionType : null;
  const chatReadable = !chatPermissionType || chatPermissionType === 'StreamTypePublic';

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
    chatPermissionType,
    chatReadable,
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
