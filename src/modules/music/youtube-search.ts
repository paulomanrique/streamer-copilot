const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
}

export async function searchYouTube(query: string): Promise<YouTubeSearchResult | null> {
  // sp=EgIQAQ%3D%3D filters results to videos only
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) throw new Error(`YouTube search HTTP ${response.status}`);

  const html = await response.text();
  const data = extractYtInitialData(html);
  if (!data) return null;

  return findFirstVideoResult(data);
}

function extractYtInitialData(html: string): unknown {
  const marker = 'var ytInitialData = ';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  let depth = 0;
  let end = jsonStart;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  try { return JSON.parse(html.slice(jsonStart, end)) as unknown; } catch { return null; }
}

function findFirstVideoResult(obj: unknown): YouTubeSearchResult | null {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findFirstVideoResult(item);
      if (found) return found;
    }
    return null;
  }
  const r = obj as Record<string, unknown>;
  // videoRenderer objects have videoId + title + lengthText
  if (typeof r.videoId === 'string' && r.title && r.lengthText) {
    const title = extractText(r.title);
    const durationSeconds = parseDuration(extractText(r.lengthText));
    const thumbnails = ((r.thumbnail as Record<string, unknown> | undefined)?.thumbnails) as Array<{ url: string }> | undefined;
    const thumbnailUrl = thumbnails?.at(-1)?.url ?? null;
    if (title && durationSeconds > 0) {
      return { videoId: r.videoId, title, durationSeconds, thumbnailUrl };
    }
  }
  for (const value of Object.values(r)) {
    const found = findFirstVideoResult(value);
    if (found) return found;
  }
  return null;
}

function extractText(obj: unknown): string {
  if (!obj || typeof obj !== 'object') return '';
  const r = obj as Record<string, unknown>;
  if (typeof r.simpleText === 'string') return r.simpleText;
  if (Array.isArray(r.runs) && r.runs[0]) {
    const run = r.runs[0] as Record<string, unknown>;
    if (typeof run.text === 'string') return run.text;
  }
  return '';
}

function parseDuration(text: string): number {
  const parts = text.split(':').map(Number);
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  return 0;
}
