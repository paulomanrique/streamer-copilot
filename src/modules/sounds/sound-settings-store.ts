import type { SoundSettings } from '../../shared/types.js';
import { AppSettingsRepository } from '../settings/app-settings-repository.js';

const SOUND_SETTINGS_KEY = 'sounds:settings';

const DEFAULT_SETTINGS: SoundSettings = {
  defaultCooldownSeconds: 0,
  defaultUserCooldownSeconds: 0,
};

export class SoundSettingsStore {
  constructor(private readonly repository: AppSettingsRepository) {}

  load(): SoundSettings {
    const raw = this.repository.get(SOUND_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    try {
      const parsed = JSON.parse(raw) as Partial<SoundSettings>;
      return {
        defaultCooldownSeconds:
          typeof parsed.defaultCooldownSeconds === 'number'
            ? parsed.defaultCooldownSeconds
            : DEFAULT_SETTINGS.defaultCooldownSeconds,
        defaultUserCooldownSeconds:
          typeof parsed.defaultUserCooldownSeconds === 'number'
            ? parsed.defaultUserCooldownSeconds
            : DEFAULT_SETTINGS.defaultUserCooldownSeconds,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  save(input: SoundSettings): SoundSettings {
    const next: SoundSettings = {
      defaultCooldownSeconds: input.defaultCooldownSeconds,
      defaultUserCooldownSeconds: input.defaultUserCooldownSeconds,
    };
    this.repository.set(SOUND_SETTINGS_KEY, JSON.stringify(next));
    return next;
  }
}
