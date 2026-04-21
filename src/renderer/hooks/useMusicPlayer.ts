import { useCallback, useEffect, useRef } from 'react';

/**
 * Independent music player hook — separate from the global audio queue.
 * Manages its own Audio element for YouTube music request playback so
 * music and TTS/sound commands can play simultaneously.
 */
export function useMusicPlayer(): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentItemIdRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current = null;
    }
    currentItemIdRef.current = null;
  }, []);

  // Subscribe to play commands from main process
  useEffect(() => {
    return window.copilot.onMusicPlay((cmd) => {
      // Stop any current playback
      cleanup();

      const audio = new Audio(cmd.audioUrl);
      audio.volume = cmd.volume;
      audioRef.current = audio;
      currentItemIdRef.current = cmd.itemId;

      audio.addEventListener('ended', () => {
        void window.copilot.musicPlayerEvent({ type: 'ended', itemId: cmd.itemId });
        audioRef.current = null;
        currentItemIdRef.current = null;
      }, { once: true });

      audio.addEventListener('error', () => {
        void window.copilot.musicPlayerEvent({ type: 'error', itemId: cmd.itemId });
        audioRef.current = null;
        currentItemIdRef.current = null;
      }, { once: true });

      void audio.play().catch(() => {
        void window.copilot.musicPlayerEvent({ type: 'error', itemId: cmd.itemId });
        audioRef.current = null;
        currentItemIdRef.current = null;
      });
    });
  }, [cleanup]);

  // Subscribe to stop commands
  useEffect(() => {
    return window.copilot.onMusicStop(() => {
      cleanup();
    });
  }, [cleanup]);

  // Subscribe to volume changes
  useEffect(() => {
    return window.copilot.onMusicVolume((volume) => {
      if (audioRef.current) {
        audioRef.current.volume = Math.max(0, Math.min(1, volume));
      }
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);
}
