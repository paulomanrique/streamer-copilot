import { describe, expect, it } from 'vitest';

import type { ChatMessage, StreamEvent } from '../../src/shared/types.js';
import {
  appendChatEventsToState,
  appendChatMessagesToState,
  MAX_CHAT_EVENTS,
  MAX_CHAT_MESSAGES,
} from '../../src/renderer/store.js';

function message(id: string): ChatMessage {
  return {
    id,
    platform: 'twitch',
    author: `user-${id}`,
    content: `message ${id}`,
    badges: [],
    timestampLabel: '10:00',
  };
}

function event(id: string): StreamEvent {
  return {
    id,
    platform: 'youtube',
    type: 'superchat',
    author: `user-${id}`,
    amount: 5,
    timestampLabel: '10:00',
  };
}

describe('chat store batch helpers', () => {
  it('appends message batches with monotonic receivedOrder', () => {
    const next = appendChatMessagesToState(
      { chatMessages: [], chatEvents: [], chatSequence: 10 },
      [message('a'), message('b')],
    );

    expect(next.chatSequence).toBe(12);
    expect(next.chatMessages?.map((item) => item.id)).toEqual(['a', 'b']);
    expect(next.chatMessages?.map((item) => (item as ChatMessage & { receivedOrder: number }).receivedOrder)).toEqual([10, 11]);
  });

  it('caps message batches to the configured live window', () => {
    const messages = Array.from({ length: MAX_CHAT_MESSAGES + 5 }, (_, index) => message(String(index)));
    const next = appendChatMessagesToState({ chatMessages: [], chatEvents: [], chatSequence: 0 }, messages);

    expect(next.chatMessages).toHaveLength(MAX_CHAT_MESSAGES);
    expect(next.chatMessages?.[0]?.id).toBe('5');
  });

  it('appends and caps event batches', () => {
    const events = Array.from({ length: MAX_CHAT_EVENTS + 2 }, (_, index) => event(String(index)));
    const next = appendChatEventsToState({ chatMessages: [], chatEvents: [], chatSequence: 3 }, events);

    expect(next.chatSequence).toBe(MAX_CHAT_EVENTS + 5);
    expect(next.chatEvents).toHaveLength(MAX_CHAT_EVENTS);
    expect(next.chatEvents?.[0]?.id).toBe('2');
  });
});
