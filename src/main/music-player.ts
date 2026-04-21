import { WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';

import type { MusicPlayCommand, MusicPlayerEvent } from '../shared/types.js';

// Injected into the YouTube embed page to prevent it from pausing when hidden.
// Mirrors the focus-spoof technique from lurk-buddy.
const FOCUS_SPOOF = `
(() => {
  const redefine = (target, key, getter) => {
    try { Object.defineProperty(target, key, { configurable: true, enumerable: false, get: getter }); } catch {}
  };
  redefine(Document.prototype, 'hidden', () => false);
  redefine(document, 'hidden', () => false);
  redefine(Document.prototype, 'visibilityState', () => 'visible');
  redefine(document, 'visibilityState', () => 'visible');
  document.hasFocus = () => true;
  const blocked = new Set(['visibilitychange', 'webkitvisibilitychange', 'blur', 'focusout', 'pagehide']);
  const patch = (t) => {
    const orig = t.addEventListener.bind(t);
    t.addEventListener = (type, listener, opts) => { if (blocked.has(type)) return; return orig(type, listener, opts); };
  };
  patch(document); patch(window);
  const pulse = () => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('focusin'));
  };
  pulse();
  setInterval(pulse, 1500);
})();
`;

export class MusicPlayer {
  private view: WebContentsView | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly onEvent: (event: MusicPlayerEvent) => void,
  ) {}

  play(cmd: MusicPlayCommand): void {
    this.stop();

    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;

    const view = new WebContentsView({
      webPreferences: {
        autoplayPolicy: 'no-user-gesture-required',
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.view = view;
    win.contentView.addChildView(view);
    // Off-screen so the view renders but is never visible
    view.setBounds({ x: -2000, y: -2000, width: 1280, height: 720 });

    const { itemId, videoId, volume } = cmd;

    // Ensure the WebContents is never muted at the Electron level
    view.webContents.setAudioMuted(false);

    view.webContents.on('dom-ready', () => {
      if (view.webContents.isDestroyed()) return;
      void view.webContents.executeJavaScript(FOCUS_SPOOF);
      // YouTube's player API (movie_player.setVolume) is more reliable than
      // setting video.volume directly, as YouTube may reset video.volume after init.
      // Retry until the player is fully initialised (can take 2-5 seconds).
      void view.webContents.executeJavaScript(`
        (() => {
          const vol = ${Math.round(volume * 100)};
          let attempts = 0;
          const apply = () => {
            const p = document.getElementById('movie_player');
            if (p && typeof p.setVolume === 'function') {
              p.setVolume(vol);
              if (typeof p.unMute === 'function') p.unMute();
              return;
            }
            const v = document.querySelector('video');
            if (v) { v.volume = ${volume}; v.muted = false; }
            if (++attempts < 30) setTimeout(apply, 500);
          };
          apply();
        })();
      `);
    });

    view.webContents.on('did-fail-load', (_e, code, desc) => {
      if (code === 0) return; // 0 = ERR_ABORTED, not a real error
      this.clearPoll();
      this.onEvent({ type: 'error', itemId, errorCode: code });
    });

    this.pollTimer = setInterval(() => void this.checkPlayback(view, itemId), 2000);

    // Load the full watch page (same as lurk-buddy) for reliable audio playback
    void view.webContents.loadURL(
      `https://www.youtube.com/watch?v=${videoId}&autoplay=1`,
    );
  }

  setVolume(volume: number): void {
    if (!this.view?.webContents || this.view.webContents.isDestroyed()) return;
    void this.view.webContents.executeJavaScript(`
      (() => {
        const vol = ${Math.round(volume * 100)};
        const p = document.getElementById('movie_player');
        if (p && typeof p.setVolume === 'function') { p.setVolume(vol); return; }
        const v = document.querySelector('video');
        if (v) v.volume = ${volume};
      })();
    `);
  }

  stop(): void {
    this.clearPoll();
    if (this.view) {
      const view = this.view;
      this.view = null;
      const win = this.getWindow();
      try {
        if (win && !win.isDestroyed()) win.contentView.removeChildView(view);
        if (!view.webContents.isDestroyed()) view.webContents.close();
      } catch { /* ignore */ }
    }
  }

  private async checkPlayback(view: WebContentsView, itemId: string): Promise<void> {
    if (view.webContents.isDestroyed()) {
      this.clearPoll();
      return;
    }
    try {
      const state = await view.webContents.executeJavaScript(`
        (() => {
          const v = document.querySelector('video');
          return { ended: v ? v.ended : false, hasError: v ? Boolean(v.error) : false };
        })()
      `) as { ended: boolean; hasError: boolean };

      if (state.ended) {
        this.clearPoll();
        this.onEvent({ type: 'ended', itemId });
      } else if (state.hasError) {
        this.clearPoll();
        this.onEvent({ type: 'error', itemId, errorCode: -1 });
      }
    } catch { /* view destroyed during JS execution */ }
  }

  private clearPoll(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
