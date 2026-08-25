import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({}));

import { parseXDomChatConsoleMessage, XDomChatScraper } from '../../src/platforms/x/dom-chat-scraper.js';

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

  it('sends escaped content through the hidden broadcast page', async () => {
    const executeJavaScript = vi.fn().mockResolvedValue({ sent: true });
    const scraper = new XDomChatScraper(vi.fn());
    (scraper as unknown as { window: unknown }).window = {
      isDestroyed: () => false,
      webContents: { executeJavaScript },
    };
    const content = `It's live: "hello" 👋`;

    const send = scraper.sendMessage(content);
    await Promise.resolve();
    (scraper as unknown as { handleConsoleMessage: (message: string) => void }).handleConsoleMessage(
      `COPILOT_X_CHAT:${JSON.stringify({
        username: 'paulomanrique',
        displayName: 'Paulo Manrique',
        text: content,
        timestampMs: Date.now(),
        uuid: 'sent-message',
        isInitial: false,
      })}`,
    );

    await expect(send).resolves.toEqual({ username: 'paulomanrique', displayName: 'Paulo Manrique' });

    expect(executeJavaScript).toHaveBeenCalledOnce();
    expect(executeJavaScript.mock.calls[0]?.[0]).toContain(`const payload = ${JSON.stringify(content)};`);
    expect(executeJavaScript.mock.calls[0]?.[1]).toBe(true);
  });

  it('reports when the signed-in page has no chat composer', async () => {
    const scraper = new XDomChatScraper(vi.fn());
    (scraper as unknown as { window: unknown }).window = {
      isDestroyed: () => false,
      webContents: { executeJavaScript: vi.fn().mockResolvedValue({ sent: false, reason: 'input-not-found' }) },
    };

    await expect(scraper.sendMessage('hello')).rejects.toThrow('Log in to X');
  });
});
