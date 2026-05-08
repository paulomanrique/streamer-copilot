import { describe, expect, it, beforeEach, vi } from 'vitest';

import type { ChatMessage, StreamEvent } from '../../src/shared/types.js';
import { YTApiClient } from '../../src/platforms/youtube/api-client.js';

/**
 * These tests exercise the message-mapping surface of YTApiClient by invoking
 * the private `handleItem` method directly. Network-bound paths (poll loop,
 * sendMessage, moderation) are not exercised here — those go through googleapis
 * which would require heavier mocking. The mapping is the highest-value piece
 * to lock down: it converts YouTube's wire shape into the app's ChatMessage /
 * StreamEvent contract.
 */
function buildClient() {
  const messages: ChatMessage[] = [];
  const events: StreamEvent[] = [];
  const auth = {} as never; // never touched — we don't call start() / send / mod
  const client = new YTApiClient({
    videoId: 'vid-1',
    auth,
    onMessage: (m) => messages.push({ ...m, id: 'test', timestampLabel: 't' }),
    onEvent: (e) => events.push({ ...e, id: 'test', timestampLabel: 't' }),
  });
  return { client, messages, events };
}

function callHandle(client: YTApiClient, item: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).handleItem(item);
}

describe('YTApiClient.handleItem mapping', () => {
  let client: YTApiClient;
  let messages: ChatMessage[];
  let events: StreamEvent[];

  beforeEach(() => {
    ({ client, messages, events } = buildClient());
  });

  it('maps a text message with author, content, avatar, and platformMessageId', () => {
    callHandle(client, {
      id: 'msg-123',
      snippet: {
        type: 'textMessageEvent',
        publishedAt: new Date().toISOString(),
        textMessageDetails: { messageText: 'Hello world!' },
      },
      authorDetails: {
        displayName: '@TestUser',
        channelId: 'UCabc',
        profileImageUrl: 'https://yt3.example/a.jpg',
        isChatModerator: false,
        isChatSponsor: false,
      },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].author).toBe('TestUser'); // strips leading @
    expect(messages[0].content).toBe('Hello world!');
    expect(messages[0].userId).toBe('UCabc');
    expect(messages[0].avatarUrl).toBe('https://yt3.example/a.jpg');
    expect(messages[0].platformMessageId).toBe('msg-123');
    expect(messages[0].badges).toEqual([]);
  });

  it('flags moderator and member badges', () => {
    callHandle(client, {
      id: 'm1',
      snippet: { type: 'textMessageEvent', publishedAt: new Date().toISOString(), textMessageDetails: { messageText: 'mod' } },
      authorDetails: { displayName: 'Mod', isChatModerator: true, isChatSponsor: true },
    });
    callHandle(client, {
      id: 'm2',
      snippet: { type: 'textMessageEvent', publishedAt: new Date().toISOString(), textMessageDetails: { messageText: 'member' } },
      authorDetails: { displayName: 'Member', isChatModerator: false, isChatSponsor: true },
    });
    expect(messages[0].badges).toEqual(['moderator']);
    expect(messages[1].badges).toEqual(['member']);
  });

  it('skips empty text messages', () => {
    callHandle(client, {
      id: 'empty',
      snippet: { type: 'textMessageEvent', publishedAt: new Date().toISOString(), textMessageDetails: { messageText: '   ' } },
      authorDetails: { displayName: 'Someone' },
    });
    expect(messages).toHaveLength(0);
  });

  it('marks history messages whose publishedAt predates the client', () => {
    callHandle(client, {
      id: 'old',
      snippet: { type: 'textMessageEvent', publishedAt: '2000-01-01T00:00:00Z', textMessageDetails: { messageText: 'old' } },
      authorDetails: { displayName: 'Past' },
    });
    expect(messages[0].isHistory).toBe(true);
  });

  it('maps a super chat to a superchat StreamEvent with amount from micros', () => {
    callHandle(client, {
      id: 'sc',
      snippet: {
        type: 'superChatEvent',
        publishedAt: new Date().toISOString(),
        superChatDetails: {
          amountDisplayString: '$5.00',
          amountMicros: '5000000',
          userComment: 'gg!',
        },
      },
      authorDetails: { displayName: 'Donor' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('superchat');
    expect(events[0].amount).toBe(5);
    expect(events[0].message).toContain('gg!');
    expect(events[0].message).toContain('$5.00');
  });

  it('falls back to amountDisplayString parsing when amountMicros is missing', () => {
    callHandle(client, {
      id: 'sc2',
      snippet: {
        type: 'superChatEvent',
        publishedAt: new Date().toISOString(),
        superChatDetails: { amountDisplayString: 'R$ 12,50', userComment: '' },
      },
      authorDetails: { displayName: 'Donor' },
    });
    expect(events[0].amount).toBe(12.5);
  });

  it('maps a super sticker to a superchat StreamEvent', () => {
    callHandle(client, {
      id: 'st',
      snippet: {
        type: 'superStickerEvent',
        publishedAt: new Date().toISOString(),
        superStickerDetails: { amountDisplayString: '$2.00', amountMicros: '2000000' },
      },
      authorDetails: { displayName: 'Sticker Sender' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('superchat');
    expect(events[0].amount).toBe(2);
    expect(events[0].message).toContain('Super Sticker');
  });

  it('maps a new sponsor to a subscription StreamEvent', () => {
    callHandle(client, {
      id: 'ns',
      snippet: {
        type: 'newSponsorEvent',
        publishedAt: new Date().toISOString(),
        newSponsorDetails: { memberLevelName: 'Gold' },
      },
      authorDetails: { displayName: 'NewMember' },
    });
    expect(events[0].type).toBe('subscription');
    expect(events[0].message).toContain('Gold');
  });

  it('maps a member milestone with months and user comment', () => {
    callHandle(client, {
      id: 'mm',
      snippet: {
        type: 'memberMilestoneChatEvent',
        publishedAt: new Date().toISOString(),
        memberMilestoneChatDetails: { memberMonth: 6, memberLevelName: 'Gold', userComment: 'half a year!' },
      },
      authorDetails: { displayName: 'Veteran' },
    });
    expect(events[0].type).toBe('subscription');
    expect(events[0].message).toContain('Gold');
    expect(events[0].message).toContain('6 meses');
    expect(events[0].message).toContain('half a year!');
  });

  it('ignores chatEndedEvent silently', () => {
    callHandle(client, {
      id: 'end',
      snippet: { type: 'chatEndedEvent', publishedAt: new Date().toISOString() },
      authorDetails: { displayName: 'system' },
    });
    expect(messages).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});

describe('YTApiClient construction', () => {
  it('exposes the videoId and a moderation API', () => {
    const auth = {} as never;
    const client = new YTApiClient({
      videoId: 'abc',
      auth,
      onMessage: vi.fn(),
    });
    expect(client.videoId).toBe('abc');
    expect(client.moderation).toBeDefined();
    expect(typeof client.moderation?.deleteMessage).toBe('function');
    expect(typeof client.moderation?.banUser).toBe('function');
    expect(typeof client.moderation?.timeoutUser).toBe('function');
  });
});
