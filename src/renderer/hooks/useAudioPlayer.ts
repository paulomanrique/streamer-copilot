import { useEffect, useRef } from 'react';

/**
 * Manages sound playback via the IPC bridge.
 * Subscribes to `onSoundPlay` events and plays audio using Web Audio.
 *
 * @param onError Called when a sound fails to play.
 */
export function useAudioPlayer(onError: (message: string) => void): void {
  const activeSoundsRef = useRef<HTMLAudioElement[]>([]);

  useEffect(() => {
    const play = async (payload: { filePath: string }) => {
      let objectUrl: string | null = null;
      try {
        const base64 = await window.copilot.readSoundFile(payload.filePath);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const ext = payload.filePath.split('.').pop()?.toLowerCase() ?? 'mp3';
        const mime = ext === 'ogg' ? 'audio/ogg' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));

        const audio = new Audio(objectUrl);
        audio.volume = 1;
        activeSoundsRef.current = [...activeSoundsRef.current, audio];

        const cleanup = () => {
          activeSoundsRef.current = activeSoundsRef.current.filter((item) => item !== audio);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        };

        audio.addEventListener('ended', cleanup, { once: true });
        audio.addEventListener('error', () => { cleanup(); onError(`Failed to play sound file: ${payload.filePath}`); }, { once: true });

        await audio.play();
      } catch {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        onError(`Failed to play sound file: ${payload.filePath}`);
      }
    };

    return window.copilot.onSoundPlay((payload) => { void play(payload); });
  }, [onError]);
}
