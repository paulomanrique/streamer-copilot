import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

import type { LiveStreamInfo } from '../../main/youtube-helpers.js';

/**
 * Returns the active live broadcasts for the OAuth-granting channel.
 *
 * Quota cost per call: 1u (`liveBroadcasts.list`) + Nu (`videos.list`, batched
 * for all live videoIds) + 1u (`channels.list?statistics`) ≈ 3u typical. At a
 * 120s monitor cadence this is ~2.2k units/day — well below the 10k daily
 * quota.
 *
 * Returns `null` to signal a transient failure (so the adapter keeps existing
 * scrapers alive across a flaky cycle, matching the scrape monitor's
 * contract). An empty array means "the user is not currently live".
 */
export async function checkYouTubeLiveViaApi(
  channelHandle: string,
  auth: OAuth2Client,
): Promise<LiveStreamInfo[] | null> {
  const youtube = google.youtube({ version: 'v3', auth });
  try {
    const broadcasts = await youtube.liveBroadcasts.list({
      part: ['id', 'snippet', 'status'],
      broadcastStatus: 'active',
      broadcastType: 'all',
      mine: true,
      maxResults: 5,
    });
    const items = broadcasts.data.items ?? [];
    if (items.length === 0) return [];

    const videoIds = items.map((b) => b.id).filter((id): id is string => !!id);
    if (videoIds.length === 0) return [];

    const [videosRes, channelsRes] = await Promise.all([
      youtube.videos.list({ part: ['liveStreamingDetails', 'snippet'], id: videoIds }),
      youtube.channels.list({ part: ['statistics'], mine: true }),
    ]);

    const subscriberCount = parseCount(
      channelsRes.data.items?.[0]?.statistics?.subscriberCount,
    );

    const out: LiveStreamInfo[] = [];
    for (const video of videosRes.data.items ?? []) {
      if (!video.id) continue;
      const concurrent = parseCount(video.liveStreamingDetails?.concurrentViewers);
      out.push({
        videoId: video.id,
        title: video.snippet?.title ?? '',
        viewCount: concurrent,
        subscriberCount,
        channelHandle,
      });
    }
    return out;
  } catch {
    // Transient — let the adapter retry next cycle without tearing down clients.
    return null;
  }
}

function parseCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}
