import { describe, expect, it, vi } from 'vitest';

import { createTwitchStreamTools } from '../../src/main/platforms/twitch-stream-tools.js';
import type { PlatformAccount } from '../../src/shared/types.js';

const account: PlatformAccount = {
  id: 'account-1',
  providerId: 'twitch',
  label: 'Main channel',
  channel: 'streamer',
  enabled: true,
  autoConnect: true,
  createdAt: '2026-08-02T00:00:00.000Z',
  providerData: { oauthToken: 'oauth:secret' },
};

function json(value: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: status === 204 ? undefined : { 'content-type': 'application/json' },
  });
}

describe('Twitch stream tools', () => {
  it('exposes enabled accounts and reads live metadata through Helix', async () => {
    const request = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/users?')) return json({ data: [{ id: '42', broadcaster_type: 'affiliate', created_at: '2020-01-01T00:00:00Z' }] });
      if (url.includes('/channels/followers')) return json({ total: 321 });
      if (url.includes('/channels?')) return json({ data: [{ game_id: '10', game_name: 'Music', title: 'Live now' }] });
      if (url.includes('/streams?')) return json({ data: [{ viewer_count: 123, started_at: '2026-08-02T12:00:00Z' }] });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const tools = createTwitchStreamTools({ clientId: 'client', getAccount: async () => account, request: request as typeof fetch });
    const [target] = await tools.listTargets([account]);

    expect(target).toEqual({ platformId: 'twitch', accountId: 'account-1', channelId: 'streamer', label: 'Main channel' });
    await expect(tools.readMetric(target, 'viewers')).resolves.toMatchObject({ token: '$viewers', value: '123' });
    await expect(tools.readMetric(target, 'followers')).resolves.toMatchObject({ token: '$followers', value: '321' });
    await expect(tools.getMetadata?.(target)).resolves.toMatchObject({
      isLive: true,
      viewerCount: 123,
      followerCount: 321,
      title: 'Live now',
      categoryName: 'Music',
      broadcasterType: 'affiliate',
    });
  });

  it('searches categories and updates channel metadata', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes('/users?')) return json({ data: [{ id: '42' }] });
      if (url.includes('/search/categories')) return json({ data: [{ id: '509658', name: 'Just Chatting', box_art_url: 'https://img/{width}x{height}.jpg' }] });
      if (init?.method === 'PATCH') return json(null, 204);
      if (url.includes('/channels/followers')) return json({ total: 1 });
      if (url.includes('/channels?')) return json({ data: [{ game_id: '509658', game_name: 'Just Chatting', title: 'New title' }] });
      if (url.includes('/streams?')) return json({ data: [] });
      throw new Error(`Unexpected URL: ${url}`);
    });
    const tools = createTwitchStreamTools({ clientId: 'client', getAccount: async () => account, request: request as typeof fetch });
    const [target] = await tools.listTargets([account]);

    await expect(tools.searchCategories?.(target, 'chat')).resolves.toEqual([{
      id: '509658', name: 'Just Chatting', imageUrl: 'https://img/144x192.jpg',
    }]);
    await expect(tools.updateMetadata?.(target, { title: 'New title', categoryId: '509658' })).resolves.toMatchObject({ title: 'New title' });
    expect(calls.find((call) => call.init?.method === 'PATCH')?.init?.body).toBe(JSON.stringify({ title: 'New title', game_id: '509658' }));
  });
});
