/**
 * LinkedIn Live URL helpers. A live is an Event whose theater page
 * (`/events/<id>/theater/`) hosts the video and the live comments panel; the
 * live's feed post (`/feed/update/urn:li:ugcPost:<id>/`) redirects there. Both
 * shapes are accepted so the streamer can paste whichever link they have.
 */

export type LinkedInLiveRef =
  | { kind: 'event'; id: string }
  | { kind: 'post'; urnType: 'activity' | 'ugcPost'; id: string };

// LinkedIn ids are 19-digit snowflakes. Event slugs glue the id to the end of
// the title (`shippinglaravel-vet0-1today7504203994987237376`), so the id is
// the trailing 19 digits — not a greedy digit run, which would swallow any
// digits the title itself ends with.
const EVENT_SEGMENT_ID = /(\d{19})$/;
const POST_URN = /urn:li:(activity|ugcPost):(\d{19})/;
const POST_SLUG = /-(activity|ugcPost)-(\d{19})(?:-|$)/;

export function parseLinkedInLiveRef(raw: string | null | undefined): LinkedInLiveRef | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
  const path = decodeURIComponent(url.pathname);

  const eventSegment = path.match(/\/events\/([^/]+)/)?.[1];
  if (eventSegment) {
    const id = eventSegment.match(EVENT_SEGMENT_ID)?.[1];
    return id ? { kind: 'event', id } : null;
  }
  const urn = path.match(POST_URN) ?? path.match(POST_SLUG);
  if (urn) return { kind: 'post', urnType: urn[1] as 'activity' | 'ugcPost', id: urn[2] };
  return null;
}

/** Page the hidden scraper loads. Post links are kept as-is: LinkedIn
 *  redirects them to the event theater, which is where the comments live. */
export function linkedInLivePageUrl(ref: LinkedInLiveRef): string {
  return ref.kind === 'event'
    ? `https://www.linkedin.com/events/${ref.id}/theater/`
    : `https://www.linkedin.com/feed/update/urn:li:${ref.urnType}:${ref.id}/`;
}

/** Comment ids are snowflakes whose top 41 bits are the creation time in ms. */
export function linkedInIdTimestampMs(id: string): number | null {
  if (!/^\d{1,20}$/.test(id)) return null;
  try {
    const ms = Number(BigInt(id) >> 22n);
    return ms > 0 ? ms : null;
  } catch {
    return null;
  }
}

/** `urn:li:comment:(ugcPost:7504…,7504…)` → `7504…` (the comment's own id).
 *  Replies nest the parent comment urn, so the comment id is the last id. */
export function linkedInCommentIdFromUrn(urn: string): string | null {
  if (!urn.startsWith('urn:li:comment:')) return null;
  const ids = urn.match(/\d{19}/g);
  return ids && ids.length >= 2 ? ids[ids.length - 1] : null;
}

/** Profile or page reference for the account's channel: `paulo` (member) or
 *  `company/acme` (page). Accepts full profile/page URLs too. */
export function normalizeLinkedInChannel(raw: string): string {
  let value = raw.trim().replace(/^https?:\/\//i, '').replace(/^(?:[a-z]{2,3}\.|www\.)?linkedin\.com\//i, '');
  value = value.replace(/^@/, '').replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '');
  const company = value.match(/^(company|showcase|school)\/([^/]+)/i);
  if (company) return `company/${company[2]}`;
  const member = value.match(/^in\/([^/]+)/i);
  if (member) return member[1];
  return value.split('/')[0] ?? '';
}

export function linkedInProfileUrl(channel: string): string {
  const normalized = normalizeLinkedInChannel(channel);
  if (!normalized) return '';
  if (normalized.startsWith('company/')) {
    return `https://www.linkedin.com/company/${encodeURIComponent(normalized.slice('company/'.length))}/`;
  }
  return `https://www.linkedin.com/in/${encodeURIComponent(normalized)}/`;
}
