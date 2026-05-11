import type { SoundSettings } from '../../shared/types.js';
import { JsonSettingsStore } from '../base/settings-store.js';

const SETTINGS_FILE = 'sound-settings.json';

const DEFAULT_SETTINGS: SoundSettings = {
  defaultCooldownSeconds: 0,
  defaultUserCooldownSeconds: 0,
};

export class SoundSettingsStore extends JsonSettingsStore<SoundSettings> {
  constructor(profileDirectory: string) {
    super(profileDirectory, SETTINGS_FILE);
  }

  protected defaults(): SoundSettings {
    return { ...DEFAULT_SETTINGS };
  }

  protected parse(raw: Record<string, unknown>): SoundSettings {
    return {
      defaultCooldownSeconds:
        typeof raw.defaultCooldownSeconds === 'number'
          ? raw.defaultCooldownSeconds
          : DEFAULT_SETTINGS.defaultCooldownSeconds,
      defaultUserCooldownSeconds:
        typeof raw.defaultUserCooldownSeconds === 'number'
          ? raw.defaultUserCooldownSeconds
          : DEFAULT_SETTINGS.defaultUserCooldownSeconds,
    };
  }
}
