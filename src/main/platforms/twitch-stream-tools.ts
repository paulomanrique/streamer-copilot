import type {
  PlatformAccount,
  PlatformCategory,
  PlatformStreamMetadata,
  PlatformStreamTarget,
} from '../../shared/types.js';
import type { MainPlatformStreamTools } from './registry.js';

interface TwitchStreamToolsOptions {
  clientId: string;
  getAccount: (accountId: string) => Promise<PlatformAccount | null>;
  request?: typeof fetch;
}

interface TwitchContext {
  target: PlatformStreamTarget;
  headers: Record<string, string>;
  broadcasterId: string;
  broadcasterType: string;
  accountCreatedAt: string | null;
}

interface TwitchUser {
  id: string;
  broadcaster_type?: string;
  created_at?: string;
}

interface TwitchChannel {
  game_id?: string;
  game_name?: string;
  title?: string;
}

interface TwitchStream {
  viewer_count?: number;
  started_at?: string;
}

/** Twitch-owned implementation of the optional stream-output capability.
 * The live-output core only knows about metrics/metadata contracts and never
 * branches on the provider id. */
export function createTwitchStreamTools(options: TwitchStreamToolsOptions): MainPlatformStreamTools {
  const request = options.request ?? fetch;

  const resolve = async (target: PlatformStreamTarget): Promise<TwitchContext> => {
    const account = await options.getAccount(target.accountId);
    if (!account || account.providerId !== target.platformId) throw new Error('Twitch account is unavailable');
    const accessToken = String(account.providerData?.oauthToken ?? '').replace(/^oauth:/, '').trim();
    if (!accessToken) throw new Error('Twitch OAuth token is unavailable');
    const headers = { Authorization: `Bearer ${accessToken}`, 'Client-Id': options.clientId };
    const users = await twitchJson<{ data?: TwitchUser[] }>(
      request,
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(account.channel)}`,
      { headers },
    );
    const user = users.data?.[0];
    if (!user?.id) throw new Error('Twitch broadcaster could not be resolved');
    return {
      target,
      headers,
      broadcasterId: user.id,
      broadcasterType: user.broadcaster_type ?? '',
      accountCreatedAt: user.created_at ?? null,
    };
  };

  const metadata = async (target: PlatformStreamTarget): Promise<PlatformStreamMetadata> => {
    const context = await resolve(target);
    const [channels, streams, followers] = await Promise.all([
      twitchJson<{ data?: TwitchChannel[] }>(request, `https://api.twitch.tv/helix/channels?broadcaster_id=${context.broadcasterId}`, { headers: context.headers }),
      twitchJson<{ data?: TwitchStream[] }>(request, `https://api.twitch.tv/helix/streams?user_id=${context.broadcasterId}`, { headers: context.headers }),
      twitchJson<{ total?: number }>(request, `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${context.broadcasterId}`, { headers: context.headers }).catch(() => ({ total: undefined })),
    ]);
    const channel = channels.data?.[0];
    const stream = streams.data?.[0];
    return {
      platformId: target.platformId,
      accountId: target.accountId,
      channelId: target.channelId,
      isLive: !!stream,
      viewerCount: stream?.viewer_count ?? 0,
      followerCount: followers.total ?? null,
      title: channel?.title ?? '',
      categoryId: channel?.game_id ?? '',
      categoryName: channel?.game_name ?? '',
      broadcasterType: context.broadcasterType,
      accountCreatedAt: context.accountCreatedAt,
      startedAt: stream?.started_at ?? null,
    };
  };

  return {
    metrics: [
      { id: 'viewers', label: 'Current viewers', token: '$viewers', minimumRefreshSeconds: 10, defaultFileRelativePath: 'TextFiles/TwitchViewerCount.txt' },
      { id: 'followers', label: 'Followers', token: '$followers', minimumRefreshSeconds: 30, defaultFileRelativePath: 'TextFiles/TwitchFollowerCount.txt' },
    ],
    listTargets(accounts) {
      return accounts
        .filter((account) => account.enabled && account.channel.trim())
        .map((account) => ({
          platformId: account.providerId,
          accountId: account.id,
          channelId: account.channel,
          label: account.label || account.channel,
        }));
    },
    async readMetric(target, metricId) {
      const snapshot = await metadata(target);
      if (metricId === 'viewers') {
        return { token: '$viewers', value: String(snapshot.viewerCount ?? 0), details: { ...snapshot } };
      }
      if (metricId === 'followers') {
        if (snapshot.followerCount === null) throw new Error('Twitch follower count requires moderator:read:followers');
        return { token: '$followers', value: String(snapshot.followerCount), details: { ...snapshot } };
      }
      throw new Error(`Unsupported Twitch metric: ${metricId}`);
    },
    getMetadata: metadata,
    async searchCategories(target, query): Promise<PlatformCategory[]> {
      const context = await resolve(target);
      const payload = await twitchJson<{ data?: Array<{ id?: string; name?: string; box_art_url?: string }> }>(
        request,
        `https://api.twitch.tv/helix/search/categories?query=${encodeURIComponent(query)}&first=20`,
        { headers: context.headers },
      );
      return (payload.data ?? []).flatMap((category) => category.id && category.name ? [{
        id: category.id,
        name: category.name,
        imageUrl: category.box_art_url?.replace('{width}', '144').replace('{height}', '192') ?? null,
      }] : []);
    },
    async updateMetadata(target, input) {
      const context = await resolve(target);
      const body: Record<string, string> = {};
      if (input.title !== undefined) body.title = input.title;
      if (input.categoryId !== undefined) body.game_id = input.categoryId;
      if (Object.keys(body).length > 0) {
        await twitchJson<void>(
          request,
          `https://api.twitch.tv/helix/channels?broadcaster_id=${context.broadcasterId}`,
          { method: 'PATCH', headers: { ...context.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
          true,
        );
      }
      return metadata(target);
    },
  };
}

async function twitchJson<T>(
  request: typeof fetch,
  url: string,
  init: RequestInit,
  allowEmpty = false,
): Promise<T> {
  const response = await request(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Twitch API ${response.status}: ${body.slice(0, 240) || response.statusText}`);
  }
  if (allowEmpty || response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
