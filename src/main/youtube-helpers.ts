/**
 * Pure helper functions for YouTube HTML scraping and data extraction.
 * No side effects — all state management stays in app-context.ts.
 */

export interface LiveStreamInfo {
  videoId: string;
  title: string;
  viewCount: number | null;
  subscriberCount: number | null;
  channelHandle: string;
}

/**
 * Computes the per-stream display labels for a set of concurrent YouTube
 * livestreams. The label is what shows on chat badges, viewer cards, and
 * live-link entries — see ObsStatsPanel / AppHeader / ChatFeed.
 *
 * Rules (in order):
 *   1. One stream → "YouTube".
 *   2. All streams from distinct channels → "YouTube @channel" so the user
 *      can tell which channel the chat / card is for.
 *   3. Multiple streams from the same channel:
 *      - If any title contains an orientation keyword
 *        (horizontal / desktop / vertical / mobile / celular / shorts),
 *        label that stream Horizontal or Vertical and assign the opposite
 *        canonical label to the partner. Synonyms are normalized to the
 *        canonical pair to keep the vocabulary stable.
 *      - Otherwise fall back to numeric: "YouTube-1", "YouTube-2", …
 *   4. Three or more streams from the same channel skip the H/V heuristic
 *      (the opposite-pair model only makes sense for two) and go numeric.
 */
export function computeYouTubeStreamLabels(
  streams: ReadonlyArray<{ videoId: string; title: string; channelHandle: string | null }>,
): Map<string, string> {
  const labels = new Map<string, string>();
  if (streams.length === 0) return labels;
  if (streams.length === 1) {
    labels.set(streams[0].videoId, 'YouTube');
    return labels;
  }

  const handles = streams.map((s) => normalizeHandle(s.channelHandle));
  const distinctHandles = new Set(handles.filter((h) => h.length > 0));
  if (distinctHandles.size === streams.length) {
    streams.forEach((s, i) => {
      const h = handles[i] || '';
      labels.set(s.videoId, h ? `YouTube @${h}` : `YouTube-${i + 1}`);
    });
    return labels;
  }

  if (streams.length === 2) {
    const orientations = streams.map((s) => detectOrientation(s.title));
    const hasH = orientations.includes('horizontal');
    const hasV = orientations.includes('vertical');
    if (hasH || hasV) {
      streams.forEach((s, i) => {
        const o = orientations[i];
        if (o === 'horizontal') labels.set(s.videoId, 'YouTube Horizontal');
        else if (o === 'vertical') labels.set(s.videoId, 'YouTube Vertical');
        else labels.set(s.videoId, hasH ? 'YouTube Vertical' : 'YouTube Horizontal');
      });
      return labels;
    }
  }

  streams.forEach((s, i) => labels.set(s.videoId, `YouTube-${i + 1}`));
  return labels;
}

function normalizeHandle(handle: string | null): string {
  if (!handle) return '';
  return handle.trim().replace(/^@+/, '').toLowerCase();
}

function detectOrientation(title: string): 'horizontal' | 'vertical' | null {
  const t = title.toLowerCase();
  if (/\b(horizontal|desktop)\b/.test(t)) return 'horizontal';
  if (/\b(vertical|mobile|celular|shorts)\b/.test(t)) return 'vertical';
  return null;
}

function getYtText(obj: unknown): string {
  if (!obj || typeof obj !== 'object') return '';
  const o = obj as Record<string, unknown>;
  if (typeof o.simpleText === 'string') return o.simpleText;
  if (Array.isArray(o.runs)) return (o.runs as Array<Record<string, unknown>>).map((r) => String(r.text ?? '')).join('');
  return '';
}

export function extractYtInitialData(html: string): unknown {
  const marker = 'var ytInitialData = ';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  let depth = 0;
  let end = jsonStart;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  try { return JSON.parse(html.slice(jsonStart, end)); } catch { return null; }
}

export function findLiveVideoIds(obj: unknown, found: LiveStreamInfo[] = []): LiveStreamInfo[] {
  if (!obj || typeof obj !== 'object') return found;
  if (Array.isArray(obj)) {
    for (const item of obj) findLiveVideoIds(item, found);
    return found;
  }
  const record = obj as Record<string, unknown>;
  if (typeof record.videoId === 'string') {
    let isLive = false;

    // Method 1: thumbnailOverlays with LIVE style
    if (Array.isArray(record.thumbnailOverlays)) {
      isLive = record.thumbnailOverlays.some((overlay: unknown) => {
        if (!overlay || typeof overlay !== 'object') return false;
        const tots = (overlay as Record<string, unknown>).thumbnailOverlayTimeStatusRenderer as Record<string, unknown> | undefined;
        return tots?.style === 'LIVE' || tots?.style === 'LIVE_NOW';
      });
    }

    // Method 2: badges array with live style or label
    if (!isLive && Array.isArray(record.badges)) {
      isLive = record.badges.some((badge: unknown) => {
        if (!badge || typeof badge !== 'object') return false;
        const meta = (badge as Record<string, unknown>).metadataBadgeRenderer as Record<string, unknown> | undefined;
        const style = String(meta?.style ?? '');
        const label = String(meta?.label ?? '').toLowerCase();
        return style === 'BADGE_STYLE_TYPE_LIVE_NOW' || label === 'live now' || label === 'ao vivo';
      });
    }

    // Method 3: viewCountText containing "watching" / "assistindo" (live-only phrasing)
    if (!isLive) {
      const vcText = getYtText(record.viewCountText).toLowerCase();
      if (vcText.includes('watching') || vcText.includes('assistindo')) isLive = true;
    }

    if (isLive && !found.some((f) => f.videoId === record.videoId)) {
      const title = getYtText(record.title);
      const viewCountRaw = getYtText(record.viewCountText);
      const viewCount = viewCountRaw ? parseInt(viewCountRaw.replace(/[^0-9]/g, ''), 10) || null : null;
      found.push({ videoId: record.videoId as string, title, viewCount, subscriberCount: null, channelHandle: '' });
    }
  }
  for (const value of Object.values(record)) findLiveVideoIds(value, found);
  return found;
}

export function extractYtSubscriberCount(html: string): number | null {
  const data = extractYtInitialData(html);
  if (!data) return null;
  return findYtSubscriberCount(data);
}

function findYtSubscriberCount(obj: unknown): number | null {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findYtSubscriberCount(item);
      if (found !== null) return found;
    }
    return null;
  }

  const record = obj as Record<string, unknown>;
  const candidates: string[] = [];
  for (const key of ['subscriberCountText', 'shortSubscriberCountText', 'subscribersText']) {
    if (key in record) candidates.push(getYtText(record[key]));
  }

  for (const value of Object.values(record)) {
    if (typeof value === 'string' && /subscriber|inscrito/i.test(value)) candidates.push(value);
  }

  for (const candidate of candidates) {
    const parsed = parseCompactCount(candidate);
    if (parsed !== null) return parsed;
  }

  for (const value of Object.values(record)) {
    const found = findYtSubscriberCount(value);
    if (found !== null) return found;
  }
  return null;
}

export function parseCompactCount(raw: string): number | null {
  const normalized = raw
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = normalized.match(/(\d+(?:[.,]\d+)?)(?:\s*)(mil|mi|bi|k|m|b)?/i);
  if (!match) return null;

  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value)) return null;

  const suffix = match[2] ?? '';
  const multiplier = suffix === 'k' || suffix === 'mil'
    ? 1_000
    : suffix === 'm' || suffix === 'mi'
      ? 1_000_000
      : suffix === 'b' || suffix === 'bi'
        ? 1_000_000_000
        : 1;
  return Math.round(value * multiplier);
}

export function extractYtLiveVideoIds(html: string): LiveStreamInfo[] {
  const data = extractYtInitialData(html);
  if (!data) return [];
  return findLiveVideoIds(data);
}

/** Locates and JSON-parses the ytInitialPlayerResponse blob from a watch page. */
function parseYtInitialPlayerResponse(html: string): Record<string, unknown> | null {
  const marker = 'var ytInitialPlayerResponse = ';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  let depth = 0;
  let end = jsonStart;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  try {
    const parsed = JSON.parse(html.slice(jsonStart, end));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

/** Parses ytInitialPlayerResponse and returns live stream info if the page is a live stream. */
export function extractYtLiveFromPlayerResponse(html: string): LiveStreamInfo | null {
  const data = parseYtInitialPlayerResponse(html);
  if (!data) return null;
  const videoDetails = data.videoDetails as Record<string, unknown> | undefined;
  if (!videoDetails) return null;
  const isLive = videoDetails.isLive === true || videoDetails.isLiveContent === true;
  if (!isLive) return null;
  const videoId = typeof videoDetails.videoId === 'string' ? videoDetails.videoId : null;
  if (!videoId) return null;
  const title = typeof videoDetails.title === 'string' ? videoDetails.title : '';
  return { videoId, title, viewCount: null, subscriberCount: null, channelHandle: '' };
}

/**
 * Extracts the current concurrent-viewer count from a YouTube watch page HTML.
 * Used as a fallback when the lightweight /live_stats endpoint is unavailable.
 *
 * IMPORTANT: `videoDetails.viewCount` (and the duplicated `microformat.viewCount`,
 * and the `videoPrimaryInfoRenderer.viewCount.simpleText` "X visualizações"
 * line) are all the cumulative lifetime view count of the broadcast — even
 * for an active live stream — not concurrent viewers.
 *
 * Concurrent viewers only live in `videoViewCountRenderer.viewCount` when
 * `videoViewCountRenderer.isLive === true`. We do NOT fall back to scanning
 * the raw HTML for a localized "watching now" / "assistindo agora" badge:
 * the watch page sidebar can include unrelated recommended live streams,
 * and a regex match would silently grab one of those instead of the main
 * video's count. Returning null is correct when the page's videoPrimaryInfoRenderer
 * isn't a live broadcast (VOD, ended live, etc.).
 */
export function extractYtConcurrentViewers(html: string): number | null {
  const initial = parseYtInitialData(html);
  if (!initial) return null;
  const contents = (((initial.contents as Record<string, unknown> | undefined)
    ?.twoColumnWatchNextResults as Record<string, unknown> | undefined)
    ?.results as Record<string, unknown> | undefined)
    ?.results as Record<string, unknown> | undefined;
  const items = contents?.contents as unknown[] | undefined;
  if (!Array.isArray(items)) return null;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const primary = (item as Record<string, unknown>).videoPrimaryInfoRenderer as Record<string, unknown> | undefined;
    if (!primary) continue;
    const vcr = (primary.viewCount as Record<string, unknown> | undefined)?.videoViewCountRenderer as Record<string, unknown> | undefined;
    if (!vcr || vcr.isLive !== true) continue;
    const vcText = vcr.viewCount as Record<string, unknown> | undefined;
    const literal = readYtText(vcText);
    if (literal) {
      const count = parseInt(literal.replace(/[^0-9]/g, ''), 10);
      if (Number.isFinite(count) && count >= 0) return count;
    }
  }

  return null;
}

/** Locates and JSON-parses the ytInitialData blob from a watch page. */
function parseYtInitialData(html: string): Record<string, unknown> | null {
  const marker = 'var ytInitialData = ';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  let depth = 0;
  let end = jsonStart;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  try {
    const parsed = JSON.parse(html.slice(jsonStart, end));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

/** Reads a YouTube text node (`{simpleText}` or `{runs:[{text}]}`) into a flat string. */
function readYtText(node: Record<string, unknown> | undefined): string {
  if (!node) return '';
  if (typeof node.simpleText === 'string') return node.simpleText;
  const runs = node.runs as unknown[] | undefined;
  if (Array.isArray(runs)) {
    return runs
      .map((r) => (r && typeof r === 'object' ? String((r as Record<string, unknown>).text ?? '') : ''))
      .join('');
  }
  return '';
}


/**
 * Normalize a Kick channel input (slug, URL, @handle) to a lowercase slug.
 */
export function normalizeKickChannelInput(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const fromAt = value.replace(/^@+/, '').trim();
  if (/^https?:\/\//i.test(fromAt)) {
    try {
      const parsed = new URL(fromAt);
      if (!parsed.hostname.toLowerCase().includes('kick.com')) return null;
      const [first] = parsed.pathname.split('/').filter(Boolean);
      if (!first) return null;
      const blocked = new Set(['categories', 'search', 'following', 'settings', 'messages']);
      if (blocked.has(first.toLowerCase())) return null;
      return first.toLowerCase();
    } catch {
      return null;
    }
  }
  return fromAt.split('/').filter(Boolean)[0]?.toLowerCase() ?? null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
