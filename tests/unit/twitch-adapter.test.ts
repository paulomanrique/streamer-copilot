import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ChatMessage, StreamEvent } from '../../src/shared/types.js';
import { TwitchChatAdapter } from '../../src/platforms/twitch/adapter.js';

/**
 * Stub tmi.js client that captures event listeners so tests can
 * fire synthetic events directly.
 */
function createStubTmiClient() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    connect: vi.fn(async () => []),
    disconnect: vi.fn(async () => []),
    say: vi.fn(),
    on(event: string, handler: (...args: unknown[]) => void) {
      const list = listeners.get(event) ?? [];
      list.push(handler);
      listeners.set(event, list);
    },
    /** Fire a synthetic event (simulating tmi.js) */
    emit(event: string, ...args: unknown[]) {
      for (const handler of listeners.get(event) ?? []) handler(...args);
    },
  };
}

/**
 * Monkey-patch the adapter so it uses our stub instead of loading tmi.js.
 * We override the private `createClient` to return our stub client.
 */
function patchAdapter(adapter: TwitchChatAdapter, stub: ReturnType<typeof createStubTmiClient>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (adapter as any).createClient = async () => stub;
}

describe('TwitchChatAdapter', () => {
  let adapter: TwitchChatAdapter;
  let stub: ReturnType<typeof createStubTmiClient>;
  let messages: ChatMessage[];
  let events: StreamEvent[];

  beforeEach(async () => {
    stub = createStubTmiClient();
    adapter = new TwitchChatAdapter({
      channels: ['testchannel'],
      username: 'bot',
      password: 'oauth:token',
    });
    patchAdapter(adapter, stub);
    messages = [];
    events = [];
    adapter.onMessage((m) => messages.push(m));
    adapter.onEvent((e) => events.push(e));
    await adapter.connect();
  });

  describe('message events', () => {
    it('emits chat messages with author and content', () => {
      stub.emit('message', '#testchannel', {
        'display-name': 'TestUser',
        color: '#FF0000',
        badges: { subscriber: '1' },
        id: 'msg-1',
        'tmi-sent-ts': '1700000000000',
      }, 'Hello world!', false);

      expect(messages).toHaveLength(1);
      expect(messages[0].author).toBe('TestUser');
      expect(messages[0].content).toBe('Hello world!');
      expect(messages[0].platform).toBe('twitch');
      expect(messages[0].color).toBe('#FF0000');
    });

    it('ignores self messages', () => {
      stub.emit('message', '#testchannel', {
        'display-name': 'Bot',
        id: 'msg-self',
      }, 'Self message', true);

      expect(messages).toHaveLength(0);
    });

    it('resolves badges from tags.badges object', () => {
      stub.emit('message', '#testchannel', {
        'display-name': 'ModUser',
        badges: { moderator: '1', subscriber: '3' },
        id: 'msg-2',
      }, 'Hey', false);

      expect(messages).toHaveLength(1);
      expect(messages[0].badges).toContain('moderator/1');
      expect(messages[0].badges).toContain('subscriber/3');
    });

    it('falls back to mod/subscriber flags when no badges object', () => {
      stub.emit('message', '#testchannel', {
        'display-name': 'FlagUser',
        mod: true,
        subscriber: '1',
        id: 'msg-flags',
      }, 'Test', false);

      expect(messages).toHaveLength(1);
      expect(messages[0].badges).toContain('moderator/1');
      expect(messages[0].badges).toContain('subscriber/1');
    });
  });

  describe('cheer events', () => {
    it('emits cheer events with bit amount', () => {
      stub.emit('cheer', '#testchannel', {
        'display-name': 'Cheerer',
        bits: '500',
        id: 'cheer-1',
      }, 'Cheer500 Great stream!');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('cheer');
      expect(events[0].author).toBe('Cheerer');
      expect(events[0].amount).toBe(500);
      expect(events[0].message).toBe('Cheer500 Great stream!');
    });
  });

  describe('subscription events', () => {
    it('emits subscription events', () => {
      stub.emit('subscription', '#testchannel', 'NewSub', {}, 'Thanks for subscribing!', {
        'display-name': 'NewSub',
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('subscription');
      expect(events[0].author).toBe('NewSub');
      expect(events[0].amount).toBe(1);
    });

    it('emits resub events with month count', () => {
      stub.emit('resub', '#testchannel', 'LongSub', 24, 'Two years strong!', {
        'display-name': 'LongSub',
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('subscription');
      expect(events[0].amount).toBe(24);
      expect(events[0].message).toBe('Two years strong!');
    });
  });

  describe('gift sub events', () => {
    it('emits single gift sub', () => {
      stub.emit('subgift', '#testchannel', 'Gifter', null, 'Recipient', null, {
        'display-name': 'Gifter',
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('gift');
      expect(events[0].author).toBe('Gifter');
      expect(events[0].amount).toBe(1);
      expect(events[0].message).toContain('@Recipient');
    });

    it('emits anonymous gift sub', () => {
      stub.emit('anonsubgift', '#testchannel', null, 'LuckyViewer');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('gift');
      expect(events[0].author).toBe('Anonymous');
    });

    it('emits mystery gift with count', () => {
      stub.emit('submysterygift', '#testchannel', 'BigGifter', 25, null, {
        'display-name': 'BigGifter',
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('gift');
      expect(events[0].amount).toBe(25);
    });

    it('emits anonymous mystery gift', () => {
      stub.emit('anonsubmysterygift', '#testchannel', 10);

      expect(events).toHaveLength(1);
      expect(events[0].author).toBe('Anonymous');
      expect(events[0].amount).toBe(10);
    });
  });

  describe('gift paid upgrade events', () => {
    it('emits gift paid upgrade as subscription', () => {
      stub.emit('giftpaidupgrade', '#testchannel', 'UpgradedUser', null, {
        'display-name': 'UpgradedUser',
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('subscription');
      expect(events[0].author).toBe('UpgradedUser');
    });

    it('emits anonymous gift paid upgrade', () => {
      stub.emit('anongiftpaidupgrade', '#testchannel', 'AnonUpgraded', {
        'display-name': 'AnonUpgraded',
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('subscription');
      expect(events[0].author).toBe('AnonUpgraded');
    });
  });

  describe('raid events', () => {
    it('emits raid events with viewer count', () => {
      stub.emit('raided', '#testchannel', 'Raider', 150);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('raid');
      expect(events[0].author).toBe('Raider');
      expect(events[0].amount).toBe(150);
    });
  });

  describe('handler management', () => {
    it('allows removing message handlers', () => {
      const extraMessages: ChatMessage[] = [];
      const unsub = adapter.onMessage((m) => extraMessages.push(m));

      stub.emit('message', '#testchannel', { 'display-name': 'A', id: '1' }, 'msg1', false);
      expect(extraMessages).toHaveLength(1);

      unsub();
      stub.emit('message', '#testchannel', { 'display-name': 'B', id: '2' }, 'msg2', false);
      expect(extraMessages).toHaveLength(1); // No new messages after unsub
    });

    it('allows removing event handlers', () => {
      const extraEvents: StreamEvent[] = [];
      const unsub = adapter.onEvent((e) => extraEvents.push(e));

      stub.emit('raided', '#testchannel', 'Raider', 100);
      expect(extraEvents).toHaveLength(1);

      unsub();
      stub.emit('raided', '#testchannel', 'Raider2', 200);
      expect(extraEvents).toHaveLength(1);
    });
  });

  describe('disconnect', () => {
    it('disconnects cleanly', async () => {
      await adapter.disconnect();
      expect(stub.disconnect).toHaveBeenCalled();
    });
  });
});
