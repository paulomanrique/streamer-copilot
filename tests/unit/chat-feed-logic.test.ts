import { describe, expect, it } from 'vitest';

import type { ChatMessage, StreamEvent } from '../../src/shared/types.js';
import { computeStableChatFeedRows, deriveChatFeedRows } from '../../src/renderer/components/ChatFeed.logic.js';

function message(id: string, order: number, platform: ChatMessage['platform'] = 'twitch'): ChatMessage {
  return {
    id,
    platform,
    author: `user-${id}`,
    content: `message ${id}`,
    badges: [],
    timestampLabel: '10:00',
    receivedOrder: order,
  } as ChatMessage;
}

function event(id: string, order: number, type: StreamEvent['type'] = 'superchat'): StreamEvent {
  return {
    id,
    platform: 'youtube',
    type,
    author: `event-${id}`,
    amount: 10,
    timestampLabel: '10:00',
    receivedOrder: order,
  } as StreamEvent;
}

describe('deriveChatFeedRows', () => {
  it('keeps superchats in chronological flow in all mode', () => {
    const rows = deriveChatFeedRows({
      messages: [message('m1', 1), message('m2', 3)],
      events: [event('s1', 2)],
      feedMode: 'all',
      platformEnabled: () => true,
    });

    expect(rows.map((row) => row.id)).toEqual(['message:m1', 'event:s1', 'message:m2']);
  });

  it('shows only superchat events in superchat mode', () => {
    const rows = deriveChatFeedRows({
      messages: [message('m1', 1)],
      events: [event('raid1', 2, 'raid'), event('s1', 3, 'superchat')],
      feedMode: 'superchat',
      platformEnabled: () => true,
    });

    expect(rows.map((row) => row.id)).toEqual(['event:s1']);
  });

  it('applies platform filters before returning rows', () => {
    const rows = deriveChatFeedRows({
      messages: [message('m1', 1, 'twitch'), message('m2', 2, 'kick')],
      events: [event('s1', 3)],
      feedMode: 'all',
      platformEnabled: (platform) => platform !== 'twitch',
    });

    expect(rows.map((row) => row.id)).toEqual(['message:m2', 'event:s1']);
  });
});

describe('computeStableChatFeedRows', () => {
  it('reuses unchanged row references', () => {
    const rows = deriveChatFeedRows({
      messages: [message('m1', 1)],
      events: [],
      feedMode: 'all',
      platformEnabled: () => true,
    });
    const first = computeStableChatFeedRows(rows, { byId: new Map(), result: [] });
    const second = computeStableChatFeedRows([...rows], first);

    expect(second.result).toBe(first.result);
    expect(second.result[0]).toBe(first.result[0]);
  });
});
