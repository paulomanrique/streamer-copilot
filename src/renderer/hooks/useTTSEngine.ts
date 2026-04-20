import { useEffect, useRef } from 'react';

import type { VoiceSpeakPayload } from '../../shared/types.js';

interface TTSOptions {
  languageCode: string;
  voiceRate: number;
  voiceVolume: number;
  onError: (message: string) => void;
}

/**
 * Manages text-to-speech via the Web Speech API.
 * Subscribes to `onVoiceSpeak` IPC events and synthesises speech.
 */
export function useTTSEngine({ languageCode, voiceRate, voiceVolume, onError }: TTSOptions): void {
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Report renderer speech capabilities once on mount
  useEffect(() => {
    void window.copilot.setRendererVoiceCapabilities({
      speechSynthesisAvailable:
        'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function',
    });
  }, []);

  // Keep a ref to the loaded voices list so the speak handler always has it
  useEffect(() => {
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) voicesRef.current = list;
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  // Subscribe to voice speak events
  useEffect(() => {
    const speak = (payload: VoiceSpeakPayload) => {
      if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
        onError('Speech synthesis is not available in this renderer');
        return;
      }

      const utterance = new window.SpeechSynthesisUtterance(payload.text);
      const allVoices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
      const matchedVoice = allVoices.find((v) => v.name === payload.lang);
      if (matchedVoice) {
        utterance.lang = matchedVoice.lang;
        utterance.voice = matchedVoice;
      } else {
        utterance.lang = languageCode;
      }
      utterance.rate = voiceRate;
      utterance.volume = voiceVolume;
      window.speechSynthesis.speak(utterance);
    };

    return window.copilot.onVoiceSpeak(speak);
  }, [languageCode, voiceRate, voiceVolume, onError]);
}
