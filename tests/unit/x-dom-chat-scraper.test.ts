import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({}));

import { parseXDomChatConsoleMessage } from '../../src/platforms/x/dom-chat-scraper.js';

describe('X DOM chat scraper', () => {
  it('parses a valid chat payload from the hidden page', () => {
    const result = parseXDomChatConsoleMessage(`COPILOT_X_CHAT:${JSON.stringify({
      username: '@viewer',
      displayName: 'Viewer Name',
      text: 'Hello from X 👾',
      timestampMs: 1234,
      uuid: 'dom:viewer:1234:1',
      isInitial: true,
    })}`);

    expect(result).toEqual({
      username: 'viewer',
      displayName: 'Viewer Name',
      text: 'Hello from X 👾',
      timestampMs: 1234,
      uuid: 'dom:viewer:1234:1',
      isInitial: true,
    });
  });

  it('rejects malformed logs and empty messages', () => {
    expect(parseXDomChatConsoleMessage('ordinary console output')).toBeNull();
    expect(parseXDomChatConsoleMessage('COPILOT_X_CHAT:{bad json')).toBeNull();
    expect(parseXDomChatConsoleMessage('COPILOT_X_CHAT:{"username":"viewer","text":""}')).toBeNull();
  });
});
