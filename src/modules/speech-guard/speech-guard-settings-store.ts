import type { SpeechGuardSettings } from '../../shared/types.js';
import { SPEECH_GUARD_LIMITS } from '../../shared/schemas.js';
import { JsonSettingsStore } from '../base/settings-store.js';

const SETTINGS_FILE = 'speech-guard-settings.json';

export const DEFAULT_SPEECH_GUARD_SETTINGS: SpeechGuardSettings = {
  enabled: false,
  deviceId: null,
  thresholdDb: -45,
  holdSeconds: 2,
};

function clamp(value: number, limits: { min: number; max: number }): number {
  return Math.min(limits.max, Math.max(limits.min, value));
}

export class SpeechGuardSettingsStore extends JsonSettingsStore<SpeechGuardSettings> {
  constructor(profileDirectory: string) {
    super(profileDirectory, SETTINGS_FILE);
  }

  protected defaults(): SpeechGuardSettings {
    return { ...DEFAULT_SPEECH_GUARD_SETTINGS };
  }

  protected parse(raw: Record<string, unknown>): SpeechGuardSettings {
    const defaults = this.defaults();
    return this.normalize({
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : defaults.enabled,
      deviceId: typeof raw.deviceId === 'string' && raw.deviceId ? raw.deviceId : null,
      thresholdDb: typeof raw.thresholdDb === 'number' && Number.isFinite(raw.thresholdDb) ? raw.thresholdDb : defaults.thresholdDb,
      holdSeconds: typeof raw.holdSeconds === 'number' && Number.isFinite(raw.holdSeconds) ? raw.holdSeconds : defaults.holdSeconds,
    });
  }

  protected normalize(input: SpeechGuardSettings): SpeechGuardSettings {
    return {
      ...input,
      deviceId: input.deviceId || null,
      thresholdDb: clamp(input.thresholdDb, SPEECH_GUARD_LIMITS.thresholdDb),
      holdSeconds: clamp(input.holdSeconds, SPEECH_GUARD_LIMITS.holdSeconds),
    };
  }
}
