import type { ChatMessageContentPart } from '../../shared/types.js';

/** Convert tmi.js's parsed emote tag (id -> inclusive ranges) to shared content. */
export function parseTwitchEmotes(content: string, emotes: unknown): ChatMessageContentPart[] | undefined {
  if (!emotes || typeof emotes !== 'object' || Array.isArray(emotes)) return undefined;

  // IRC offsets count Unicode code points, not JavaScript's UTF-16 code units.
  const characters = Array.from(content);
  const ranges: { id: string; start: number; end: number }[] = [];
  for (const [id, positions] of Object.entries(emotes)) {
    if (!id || !Array.isArray(positions)) continue;
    for (const position of positions) {
      if (typeof position !== 'string') continue;
      const match = /^(\d+)-(\d+)$/.exec(position);
      if (!match) continue;
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
        || start > end || end >= characters.length) continue;
      ranges.push({ id, start, end });
    }
  }
  if (!ranges.length) return undefined;
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  const parts: ChatMessageContentPart[] = [];
  let cursor = 0;
  for (const { id, start, end } of ranges) {
    // Ignore duplicate/overlapping ranges without losing the surrounding text.
    if (start < cursor) continue;
    if (start > cursor) {
      parts.push({ type: 'text', text: characters.slice(cursor, start).join('') });
    }
    parts.push({
      type: 'emote',
      name: characters.slice(start, end + 1).join(''),
      imageUrl: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/2.0`,
    });
    cursor = end + 1;
  }
  if (cursor < characters.length) {
    parts.push({ type: 'text', text: characters.slice(cursor).join('') });
  }
  return parts;
}
