import { useCallback, useEffect, useRef } from 'react';

import type { SoundPlayPayload, VoiceSpeakPayload } from '../../shared/types.js';

/** Delay in milliseconds between finishing one audio item and starting the next. */
const GAP_MS = 2_000;

type QueueItem =
  | { type: 'sound'; payload: SoundPlayPayload }
  | { type: 'tts-system'; payload: VoiceSpeakPayload }
  | { type: 'tts-google'; payload: { base64: string } };

interface AudioQueueOptions {
  voiceRate: number;
  voiceVolume: number;
  languageCode: string;
  onError: (message: string) => void;
}

/**
 * Global audio queue that serialises all sound playback (sound commands,
 * TTS, welcome sounds, raffle sounds, etc.) with a configurable gap
 * between items so they don't overlap.
 */
export function useAudioQueue({ voiceRate, voiceVolume, languageCode, onError }: AudioQueueOptions): void {
  const queueRef = useRef<QueueItem[]>([]);
  const isPlayingRef = useRef(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const optionsRef = useRef({ voiceRate, voiceVolume, languageCode, onError });

  // Keep options ref in sync so the processQueue closure always reads latest values
  useEffect(() => {
    optionsRef.current = { voiceRate, voiceVolume, languageCode, onError };
  }, [voiceRate, voiceVolume, languageCode, onError]);

  // Load system voices for TTS
  useEffect(() => {
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) voicesRef.current = list;
    };
    load();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', load);
      return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
    }
  }, []);

  // Report renderer speech capabilities once on mount
  useEffect(() => {
    void window.copilot.setRendererVoiceCapabilities({
      speechSynthesisAvailable:
        'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function',
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (isPlayingRef.current) return;
    const item = queueRef.current.shift();
    if (!item) return;

    isPlayingRef.current = true;
    const opts = optionsRef.current;

    try {
      if (item.type === 'sound') {
        await playSoundFile(item.payload.filePath, opts.onError);
      } else if (item.type === 'tts-system') {
        await speakWithSystemTTS(item.payload, voicesRef.current, opts);
      } else if (item.type === 'tts-google') {
        await playBase64Audio(item.payload.base64);
      }
    } catch {
      // Error already reported via onError in the individual handlers
    }

    // Wait the gap, then process next item
    await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    isPlayingRef.current = false;
    void processQueue();
  }, []);

  const enqueue = useCallback((item: QueueItem) => {
    queueRef.current.push(item);
    void processQueue();
  }, [processQueue]);

  // Subscribe to sound play events
  useEffect(() => {
    return window.copilot.onSoundPlay((payload) => {
      enqueue({ type: 'sound', payload });
    });
  }, [enqueue]);

  // Subscribe to voice speak events
  useEffect(() => {
    return window.copilot.onVoiceSpeak((payload) => {
      enqueue({ type: 'tts-system', payload });
    });
  }, [enqueue]);

  // Subscribe to Google TTS audio events
  useEffect(() => {
    return window.copilot.onGoogleTtsAudio((payload) => {
      enqueue({ type: 'tts-google', payload });
    });
  }, [enqueue]);
}

// ── Playback helpers ──────────────────────────────────────────────────

async function playSoundFile(filePath: string, onError: (msg: string) => void): Promise<void> {
  let objectUrl: string | null = null;
  try {
    const base64 = await window.copilot.readSoundFile(filePath);
    objectUrl = base64ToObjectUrl(base64, filePath);
    await playAudioElement(objectUrl);
  } catch {
    onError(`Failed to play sound file: ${filePath}`);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function speakWithSystemTTS(
  payload: VoiceSpeakPayload,
  voices: SpeechSynthesisVoice[],
  opts: { voiceRate: number; voiceVolume: number; languageCode: string; onError: (msg: string) => void },
): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
      opts.onError('Speech synthesis is not available in this renderer');
      resolve();
      return;
    }

    const utterance = new window.SpeechSynthesisUtterance(payload.text);
    const allVoices = voices.length > 0 ? voices : window.speechSynthesis.getVoices();
    const matchedVoice = allVoices.find((v) => v.name === payload.lang);
    if (matchedVoice) {
      utterance.lang = matchedVoice.lang;
      utterance.voice = matchedVoice;
    } else {
      utterance.lang = opts.languageCode;
    }
    utterance.rate = opts.voiceRate;
    utterance.volume = opts.voiceVolume;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

async function playBase64Audio(base64: string): Promise<void> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
  try {
    await playAudioElement(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function playAudioElement(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.volume = 1;
    audio.addEventListener('ended', () => resolve(), { once: true });
    audio.addEventListener('error', () => reject(new Error('Audio playback failed')), { once: true });
    void audio.play().catch(reject);
  });
}

function base64ToObjectUrl(base64: string, filePath: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'mp3';
  const mime = ext === 'ogg' ? 'audio/ogg' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}
