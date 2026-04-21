import { useEffect, useRef } from 'react';

// Minimal types for the YouTube IFrame API
interface YTPlayer {
  setVolume: (volume: number) => void;
  destroy: () => void;
}

interface YTEvent {
  data: number;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLDivElement,
        config: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YTPlayer }) => void;
            onStateChange?: (event: YTEvent) => void;
            onError?: (event: YTEvent) => void;
          };
        },
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_ENDED = 0;

function createOffScreenContainer(): HTMLDivElement {
  const div = document.createElement('div');
  // Must be large enough for the YT IFrame API to initialize (320x180 minimum)
  div.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:320px;height:180px;pointer-events:none;visibility:hidden;';
  document.body.appendChild(div);
  return div;
}

export function useMusicPlayer(): void {
  const playerRef = useRef<YTPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Inject the YouTube IFrame API script once
  useEffect(() => {
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }, []);

  useEffect(() => {
    return window.copilot.onMusicPlay((cmd) => {
      // Destroy the previous player and remove its container
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.remove();
        containerRef.current = null;
      }

      // Create a fresh off-screen container for each new song.
      // YT.Player replaces the div with an iframe, so we need a new div each time.
      containerRef.current = createOffScreenContainer();

      const itemId = cmd.itemId;
      const volume = Math.round(cmd.volume * 100);

      const build = () => {
        if (!window.YT?.Player || !containerRef.current) {
          setTimeout(build, 100);
          return;
        }
        playerRef.current = new window.YT.Player(containerRef.current, {
          videoId: cmd.videoId,
          playerVars: { autoplay: 1, controls: 0, playsinline: 1 },
          events: {
            onReady: (e) => { e.target.setVolume(volume); },
            onStateChange: (e) => {
              if (e.data === YT_ENDED) {
                void window.copilot.musicPlayerEvent({ type: 'ended', itemId });
              }
            },
            onError: (e) => {
              void window.copilot.musicPlayerEvent({ type: 'error', itemId, errorCode: e.data });
            },
          },
        });
      };

      build();
    });
  }, []);

  useEffect(() => {
    return window.copilot.onMusicStop(() => {
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.remove();
        containerRef.current = null;
      }
    });
  }, []);

  useEffect(() => {
    return window.copilot.onMusicVolume((volume) => {
      playerRef.current?.setVolume(Math.round(volume * 100));
    });
  }, []);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
      containerRef.current?.remove();
      containerRef.current = null;
    };
  }, []);
}
