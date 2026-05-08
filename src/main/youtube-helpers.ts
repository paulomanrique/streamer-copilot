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

export function getLabelFromTitle(title: string, idx: number): string {
  const lower = title.toLowerCase();
  if (lower.includes('horizontal')) return 'H';
  if (lower.includes('vertical') || lower.includes('shorts')) return 'V';
  return String(idx + 1);
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
 * Tries (in order):
 *   1. ytInitialPlayerResponse.videoDetails.viewCount when isLive/isLiveContent
 *      is true — string of digits, the most reliable source while live.
 *   2. ytInitialData "viewCountText" with phrasing like "X watching now" or
 *      "X assistindo" — a UI string, parsed by stripping non-digits.
 */
export function extractYtConcurrentViewers(html: string): number | null {
  const player = parseYtInitialPlayerResponse(html);
  if (player) {
    const videoDetails = player.videoDetails as Record<string, unknown> | undefined;
    const isLive = videoDetails?.isLive === true || videoDetails?.isLiveContent === true;
    if (isLive && typeof videoDetails?.viewCount === 'string') {
      const count = parseInt(videoDetails.viewCount, 10);
      if (Number.isFinite(count) && count >= 0) return count;
    }
  }

  // ytInitialData has the live-only "X watching now" badge string. Match the
  // phrasing variants (en/pt) and strip thousand separators / non-digits.
  const watchingMatch = html.match(/"simpleText"\s*:\s*"([\d.,\s]+)\s*(?:watching now|watching|assistindo agora|assistindo)"/i);
  if (watchingMatch) {
    const count = parseInt(watchingMatch[1].replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(count) && count >= 0) return count;
  }

  return null;
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
