import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({}));

import {
  linkedInCommentIdFromUrn,
  linkedInIdTimestampMs,
  linkedInLivePageUrl,
  linkedInProfileUrl,
  normalizeLinkedInChannel,
  parseLinkedInLiveRef,
} from '../../src/shared/linkedin-live.js';
import {
  LinkedInDomChatScraper,
  parseLinkedInDomCommentMessage,
  parseLinkedInPageStateMessage,
} from '../../src/platforms/linkedin/dom-chat-scraper.js';

const EVENT_ID = '7504203994987237376';
const COMMENT_URN = 'urn:li:comment:(ugcPost:7504203998187540480,7504211564523094016)';

describe('LinkedIn live URLs', () => {
  it('extracts the event id from slugged, bare and theater event links', () => {
    for (const url of [
      `https://www.linkedin.com/events/shippinglaravel-vet0-1today${EVENT_ID}/theater/`,
      `https://www.linkedin.com/events/shippinglaravel-vet0-1today${EVENT_ID}/`,
      `linkedin.com/events/${EVENT_ID}/theater/?trk=share`,
    ]) {
      expect(parseLinkedInLiveRef(url)).toEqual({ kind: 'event', id: EVENT_ID });
    }
  });

  it('does not swallow digits the event title ends with', () => {
    expect(parseLinkedInLiveRef(`https://www.linkedin.com/events/live2026${EVENT_ID}/`))
      .toEqual({ kind: 'event', id: EVENT_ID });
  });

  it('accepts live post links and keeps them for the redirect', () => {
    const ref = parseLinkedInLiveRef('https://www.linkedin.com/feed/update/urn:li:ugcPost:7504203998187540480/');
    expect(ref).toEqual({ kind: 'post', urnType: 'ugcPost', id: '7504203998187540480' });
    expect(linkedInLivePageUrl(ref!)).toBe('https://www.linkedin.com/feed/update/urn:li:ugcPost:7504203998187540480/');
    expect(parseLinkedInLiveRef('https://www.linkedin.com/posts/someone_title-activity-7504203998187540480-AbCd/'))
      .toEqual({ kind: 'post', urnType: 'activity', id: '7504203998187540480' });
  });

  it('rejects non-LinkedIn and non-live links', () => {
    expect(parseLinkedInLiveRef('https://x.com/i/broadcasts/abc')).toBeNull();
    expect(parseLinkedInLiveRef('https://www.linkedin.com/in/someone/')).toBeNull();
    expect(parseLinkedInLiveRef('')).toBeNull();
  });

  it('builds the theater URL for events', () => {
    expect(linkedInLivePageUrl({ kind: 'event', id: EVENT_ID }))
      .toBe(`https://www.linkedin.com/events/${EVENT_ID}/theater/`);
  });

  it('decodes the creation time embedded in LinkedIn ids', () => {
    expect(new Date(linkedInIdTimestampMs('7504211564523094016')!).toISOString()).toBe('2026-09-11T16:17:38.491Z');
    expect(linkedInIdTimestampMs('not-an-id')).toBeNull();
  });

  it('reads the comment id from top-level and reply urns', () => {
    expect(linkedInCommentIdFromUrn(COMMENT_URN)).toBe('7504211564523094016');
    expect(linkedInCommentIdFromUrn(`urn:li:comment:(${COMMENT_URN},7504211564523094999)`)).toBe('7504211564523094999');
    expect(linkedInCommentIdFromUrn('urn:li:activity:7504211564523094016')).toBeNull();
  });

  it('normalizes profile and page channels', () => {
    expect(normalizeLinkedInChannel('https://www.linkedin.com/in/paulomanrique/?trk=x')).toBe('paulomanrique');
    expect(normalizeLinkedInChannel('br.linkedin.com/company/acme/posts')).toBe('company/acme');
    expect(normalizeLinkedInChannel('paulomanrique')).toBe('paulomanrique');
    expect(linkedInProfileUrl('company/acme')).toBe('https://www.linkedin.com/company/acme/');
    expect(linkedInProfileUrl('paulomanrique')).toBe('https://www.linkedin.com/in/paulomanrique/');
  });
});

describe('LinkedIn DOM chat scraper', () => {
  it('parses a stamped comment row from the hidden page', () => {
    const result = parseLinkedInDomCommentMessage(`COPILOT_LINKEDIN_CHAT:${JSON.stringify({
      urn: COMMENT_URN,
      name: 'Viewer Name',
      profilePath: '/in/viewer',
      text: 'Hello from France 👋',
      isInitial: true,
    })}`);
    expect(result).toEqual({
      commentId: '7504211564523094016',
      name: 'Viewer Name',
      profilePath: '/in/viewer',
      text: 'Hello from France 👋',
      timestampMs: Date.parse('2026-09-11T16:17:38.491Z'),
      isInitial: true,
    });
  });

  it('rejects rows without a comment urn, name or text', () => {
    expect(parseLinkedInDomCommentMessage('ordinary console output')).toBeNull();
    expect(parseLinkedInDomCommentMessage('COPILOT_LINKEDIN_CHAT:{bad json')).toBeNull();
    expect(parseLinkedInDomCommentMessage(`COPILOT_LINKEDIN_CHAT:${JSON.stringify({ urn: '', name: 'A', text: 'hi' })}`)).toBeNull();
    expect(parseLinkedInDomCommentMessage(`COPILOT_LINKEDIN_CHAT:${JSON.stringify({ urn: COMMENT_URN, name: 'A', text: '' })}`)).toBeNull();
  });

  it('parses page state', () => {
    expect(parseLinkedInPageStateMessage(`COPILOT_LINKEDIN_STATE:${JSON.stringify({
      ready: true,
      loginRequired: false,
      isLive: true,
      viewerCount: 4,
      path: `/events/${EVENT_ID}/theater/`,
      selfName: 'Paulo Manrique',
    })}`)).toEqual({
      ready: true,
      loginRequired: false,
      isLive: true,
      viewerCount: 4,
      path: `/events/${EVENT_ID}/theater/`,
      selfName: 'Paulo Manrique',
    });
  });

  it('sends through the comment box and resolves the sender from the echoed row', async () => {
    let composer = '';
    const executeJavaScript = vi.fn(async (script: string) => {
      if (script.includes('const payload =')) {
        composer = 'typed';
        return { ok: true };
      }
      if (script.includes("'keydown'")) {
        composer = '';
        return true;
      }
      return composer;
    });
    const scraper = new LinkedInDomChatScraper(vi.fn(), vi.fn());
    (scraper as unknown as { window: unknown }).window = {
      isDestroyed: () => false,
      webContents: { executeJavaScript, sendInputEvent: vi.fn() },
    };
    const content = `It's live: "hello" 👋`;

    const send = scraper.sendMessage(content);
    await vi.waitFor(() => expect(composer).toBe(''));
    (scraper as unknown as { handleConsoleMessage: (message: string) => void }).handleConsoleMessage(
      `COPILOT_LINKEDIN_CHAT:${JSON.stringify({ urn: COMMENT_URN, name: 'Paulo Manrique', profilePath: '/in/paulo', text: content, isInitial: false })}`,
    );

    await expect(send).resolves.toEqual({ profilePath: '/in/paulo', name: 'Paulo Manrique' });
    expect(executeJavaScript.mock.calls[0]?.[0]).toContain(`const payload = ${JSON.stringify(content)};`);
  });

  describe('watchdog', () => {
    const PAGE_URL = `https://www.linkedin.com/events/${EVENT_ID}/theater/`;

    function attach() {
      const loadURL = vi.fn().mockResolvedValue(undefined);
      const scraper = new LinkedInDomChatScraper(vi.fn(), vi.fn());
      const window = {
        isDestroyed: () => false,
        destroy: vi.fn(),
        loadURL,
        webContents: { on: vi.fn(), executeJavaScript: vi.fn() },
      };
      const internals = scraper as unknown as {
        window: unknown;
        pageUrl: string;
        startWatchdog: (window: unknown) => void;
        handleConsoleMessage: (message: string) => void;
      };
      internals.window = window;
      internals.pageUrl = PAGE_URL;
      internals.startWatchdog(window);
      return { scraper, loadURL, internals };
    }

    const liveState = (viewerCount: number) => `COPILOT_LINKEDIN_STATE:${JSON.stringify({
      ready: true, loginRequired: false, isLive: true, viewerCount, path: '/events/x/theater/', selfName: null,
    })}`;

    it('reloads the page when the heartbeat stops', async () => {
      vi.useFakeTimers();
      try {
        const { scraper, loadURL } = attach();
        await vi.advanceTimersByTimeAsync(130_000);
        expect(loadURL).toHaveBeenCalledWith(PAGE_URL, expect.anything());
        scraper.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('reloads a live that shows no activity for 5 minutes, but not one that is moving', async () => {
      vi.useFakeTimers();
      try {
        const { scraper, loadURL, internals } = attach();
        internals.handleConsoleMessage(liveState(4));
        for (let elapsed = 0; elapsed < 4 * 60_000; elapsed += 15_000) {
          internals.handleConsoleMessage('COPILOT_LINKEDIN_BEAT');
          internals.handleConsoleMessage(liveState(4 + (elapsed / 15_000) % 2));
          await vi.advanceTimersByTimeAsync(15_000);
        }
        expect(loadURL).not.toHaveBeenCalled();

        for (let elapsed = 0; elapsed < 6 * 60_000; elapsed += 15_000) {
          internals.handleConsoleMessage('COPILOT_LINKEDIN_BEAT');
          await vi.advanceTimersByTimeAsync(15_000);
        }
        expect(loadURL).toHaveBeenCalledWith(PAGE_URL, expect.anything());
        scraper.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('reports when the signed-in page has no comment box', async () => {
    const scraper = new LinkedInDomChatScraper(vi.fn(), vi.fn());
    (scraper as unknown as { window: unknown }).window = {
      isDestroyed: () => false,
      webContents: { executeJavaScript: vi.fn().mockResolvedValue({ ok: false, reason: 'input-not-found' }) },
    };

    await expect(scraper.sendMessage('hello')).rejects.toThrow('Log in to LinkedIn');
  });
});
