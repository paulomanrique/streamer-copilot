import { describe, expect, it, vi } from 'vitest';

import { createKickChatAdapter } from '../../src/platforms/kick/adapter.js';

function createJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

describe('KickChatAdapter', () => {
  it('resolves the realtime id from Kick public channels API when client credentials are available', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse({ access_token: 'token-123' }))
      .mockResolvedValueOnce(createJsonResponse({
        data: [{
          broadcaster_user_id: 60319060,
          slug: 'heresachallenger',
        }],
      }));

    const adapter = createKickChatAdapter({
      channelSlug: 'heresachallenger',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetchFn,
    });

    await expect((adapter as unknown as { resolveChatroomId: () => Promise<number> }).resolveChatroomId()).resolves.toBe(60319060);
    expect(fetchFn).toHaveBeenNthCalledWith(1, 'https://id.kick.com/oauth/token', expect.objectContaining({
      method: 'POST',
    }));
    expect(fetchFn).toHaveBeenNthCalledWith(2, 'https://api.kick.com/public/v1/channels?slug=heresachallenger', expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer token-123' }),
    }));
  });

  it('falls back to the legacy channel endpoint when the official API cannot be used', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse({ chatroom: { id: 998877 } }));

    const adapter = createKickChatAdapter({
      channelSlug: 'legacy-channel',
      fetchFn,
    });

    await expect((adapter as unknown as { resolveChatroomId: () => Promise<number> }).resolveChatroomId()).resolves.toBe(998877);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith('https://kick.com/api/v2/channels/legacy-channel/chatroom', expect.objectContaining({
      headers: { accept: 'application/json' },
    }));
  });
});