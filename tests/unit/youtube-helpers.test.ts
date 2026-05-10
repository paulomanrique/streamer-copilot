import { describe, expect, it } from 'vitest';
import {
  computeYouTubeStreamLabels,
  extractYtInitialData,
  findLiveVideoIds,
  parseCompactCount,
  extractYtSubscriberCount,
  extractYtLiveVideoIds,
  normalizeKickChannelInput,
  escapeHtml,
} from '../../src/main/youtube-helpers.js';

describe('computeYouTubeStreamLabels', () => {
  const mk = (videoId: string, title: string, channelHandle: string | null = '@user') =>
    ({ videoId, title, channelHandle });

  it('returns "YouTube" for a single stream', () => {
    expect(computeYouTubeStreamLabels([mk('a', 'Just streaming')])).toEqual(
      new Map([['a', 'YouTube']]),
    );
  });

  it('uses channel handles when streams come from different channels', () => {
    const result = computeYouTubeStreamLabels([
      mk('a', 'Live', '@one'),
      mk('b', 'Live', '@two'),
    ]);
    expect(result.get('a')).toBe('YouTube @one');
    expect(result.get('b')).toBe('YouTube @two');
  });

  it('detects horizontal/vertical keywords from same channel', () => {
    const result = computeYouTubeStreamLabels([
      mk('a', 'Horizontal stream', '@user'),
      mk('b', 'Vertical stream', '@user'),
    ]);
    expect(result.get('a')).toBe('YouTube Horizontal');
    expect(result.get('b')).toBe('YouTube Vertical');
  });

  it('normalizes mobile/celular/desktop synonyms to Vertical/Horizontal', () => {
    const result = computeYouTubeStreamLabels([
      mk('a', 'Mobile gameplay', '@user'),
      mk('b', 'Desktop gameplay', '@user'),
    ]);
    expect(result.get('a')).toBe('YouTube Vertical');
    expect(result.get('b')).toBe('YouTube Horizontal');
  });

  it('assigns the opposite to the partner when only one title carries a keyword', () => {
    const result = computeYouTubeStreamLabels([
      mk('a', 'Live com pessoal', '@user'),
      mk('b', 'Stream celular', '@user'),
    ]);
    expect(result.get('a')).toBe('YouTube Horizontal');
    expect(result.get('b')).toBe('YouTube Vertical');
  });

  it('falls back to numeric labels with hyphen when no keywords match', () => {
    const result = computeYouTubeStreamLabels([
      mk('a', 'Stream A', '@user'),
      mk('b', 'Stream B', '@user'),
    ]);
    expect(result.get('a')).toBe('YouTube-1');
    expect(result.get('b')).toBe('YouTube-2');
  });

  it('uses numeric labels for 3+ streams from the same channel', () => {
    const result = computeYouTubeStreamLabels([
      mk('a', 'Horizontal', '@user'),
      mk('b', 'Vertical', '@user'),
      mk('c', 'Mobile', '@user'),
    ]);
    expect(result.get('a')).toBe('YouTube-1');
    expect(result.get('b')).toBe('YouTube-2');
    expect(result.get('c')).toBe('YouTube-3');
  });
});

describe('extractYtInitialData', () => {
  it('extracts JSON from ytInitialData marker', () => {
    const html = 'some html var ytInitialData = {"key":"value"}; more html';
    const result = extractYtInitialData(html);
    expect(result).toEqual({ key: 'value' });
  });

  it('returns null when marker is missing', () => {
    const html = 'no data here';
    expect(extractYtInitialData(html)).toBeNull();
  });

  it('handles nested objects', () => {
    const data = { a: { b: { c: 1 } }, d: [1, 2] };
    const html = `var ytInitialData = ${JSON.stringify(data)};`;
    expect(extractYtInitialData(html)).toEqual(data);
  });

  it('returns null for malformed JSON', () => {
    const html = 'var ytInitialData = {broken json';
    expect(extractYtInitialData(html)).toBeNull();
  });
});

describe('findLiveVideoIds', () => {
  it('finds live streams with videoId and thumbnailOverlays', () => {
    const data = {
      items: [{
        videoId: 'abc123',
        title: { simpleText: 'My Live Stream' },
        viewCountText: { simpleText: '1,234 watching' },
        thumbnailOverlays: [{
          thumbnailOverlayTimeStatusRenderer: { style: 'LIVE' },
        }],
      }],
    };

    const result = findLiveVideoIds(data);
    expect(result).toHaveLength(1);
    expect(result[0].videoId).toBe('abc123');
    expect(result[0].title).toBe('My Live Stream');
    expect(result[0].viewCount).toBe(1234);
  });

  it('skips non-live videos', () => {
    const data = {
      items: [{
        videoId: 'abc123',
        title: { simpleText: 'Recorded Video' },
        thumbnailOverlays: [{
          thumbnailOverlayTimeStatusRenderer: { style: 'DEFAULT' },
        }],
      }],
    };

    expect(findLiveVideoIds(data)).toHaveLength(0);
  });

  it('returns empty for null/undefined input', () => {
    expect(findLiveVideoIds(null)).toEqual([]);
    expect(findLiveVideoIds(undefined)).toEqual([]);
  });

  it('handles title with runs format', () => {
    const data = {
      videoId: 'v1',
      title: { runs: [{ text: 'Part 1' }, { text: ' - Live' }] },
      viewCountText: { simpleText: '500 watching' },
      thumbnailOverlays: [{
        thumbnailOverlayTimeStatusRenderer: { style: 'LIVE' },
      }],
    };

    const result = findLiveVideoIds(data);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Part 1 - Live');
  });
});

describe('parseCompactCount', () => {
  it('parses plain numbers', () => {
    expect(parseCompactCount('1234')).toBe(1234);
  });

  it('parses K suffix', () => {
    expect(parseCompactCount('5.2K')).toBe(5200);
    expect(parseCompactCount('5.2k')).toBe(5200);
  });

  it('parses M suffix', () => {
    expect(parseCompactCount('1.5M')).toBe(1500000);
    expect(parseCompactCount('1.5m')).toBe(1500000);
  });

  it('parses B suffix', () => {
    expect(parseCompactCount('2B')).toBe(2000000000);
  });

  it('parses Portuguese mil suffix', () => {
    expect(parseCompactCount('5,2 mil')).toBe(5200);
  });

  it('parses Portuguese mi suffix (millions)', () => {
    expect(parseCompactCount('1,5 mi')).toBe(1500000);
  });

  it('parses Portuguese bi suffix (billions)', () => {
    expect(parseCompactCount('1 bi')).toBe(1000000000);
  });

  it('handles non-breaking spaces', () => {
    expect(parseCompactCount('5\u00a0mil')).toBe(5000);
  });

  it('returns null for empty string', () => {
    expect(parseCompactCount('')).toBeNull();
  });

  it('returns null for no digits', () => {
    expect(parseCompactCount('subscribers')).toBeNull();
  });

  it('handles comma as decimal separator', () => {
    expect(parseCompactCount('2,5k')).toBe(2500);
  });
});

describe('extractYtSubscriberCount', () => {
  it('extracts subscriber count from ytInitialData', () => {
    const data = { subscriberCountText: { simpleText: '1.5M subscribers' } };
    const html = `var ytInitialData = ${JSON.stringify(data)};`;
    expect(extractYtSubscriberCount(html)).toBe(1500000);
  });

  it('returns null when no data is found', () => {
    expect(extractYtSubscriberCount('no data here')).toBeNull();
  });
});

describe('extractYtLiveVideoIds', () => {
  it('returns live streams from HTML', () => {
    const data = {
      videoId: 'live1',
      title: { simpleText: 'Live Now' },
      viewCountText: { simpleText: '100' },
      thumbnailOverlays: [{
        thumbnailOverlayTimeStatusRenderer: { style: 'LIVE' },
      }],
    };
    const html = `var ytInitialData = ${JSON.stringify(data)};`;
    const result = extractYtLiveVideoIds(html);
    expect(result).toHaveLength(1);
    expect(result[0].videoId).toBe('live1');
  });

  it('returns empty array for missing ytInitialData', () => {
    expect(extractYtLiveVideoIds('no data')).toEqual([]);
  });
});

describe('normalizeKickChannelInput', () => {
  it('normalizes a plain slug', () => {
    expect(normalizeKickChannelInput('MyChannel')).toBe('mychannel');
  });

  it('strips @ prefix', () => {
    expect(normalizeKickChannelInput('@MyChannel')).toBe('mychannel');
    expect(normalizeKickChannelInput('@@MyChannel')).toBe('mychannel');
  });

  it('extracts slug from kick.com URL', () => {
    expect(normalizeKickChannelInput('https://kick.com/xqc')).toBe('xqc');
  });

  it('extracts slug from kick.com URL with path', () => {
    expect(normalizeKickChannelInput('https://kick.com/mychannel/chatroom')).toBe('mychannel');
  });

  it('returns null for blocked paths', () => {
    expect(normalizeKickChannelInput('https://kick.com/categories')).toBeNull();
    expect(normalizeKickChannelInput('https://kick.com/search')).toBeNull();
    expect(normalizeKickChannelInput('https://kick.com/settings')).toBeNull();
  });

  it('returns null for non-kick URLs', () => {
    expect(normalizeKickChannelInput('https://twitch.tv/xqc')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(normalizeKickChannelInput('')).toBeNull();
    expect(normalizeKickChannelInput('  ')).toBeNull();
  });

  it('handles URL with trailing slash', () => {
    expect(normalizeKickChannelInput('https://kick.com/user/')).toBe('user');
  });
});

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes quotes', () => {
    expect(escapeHtml('"hello" & \'world\'')).toBe('&quot;hello&quot; &amp; &#39;world&#39;');
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('does not double-escape', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });
});
