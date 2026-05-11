import type { TextSettings } from '../../shared/types.js';
import { JsonSettingsStore } from '../base/settings-store.js';

const SETTINGS_FILE = 'text-settings.json';

const DEFAULT_SETTINGS: TextSettings = {
  defaultCooldownSeconds: 0,
  defaultUserCooldownSeconds: 0,
};

export class TextSettingsStore extends JsonSettingsStore<TextSettings> {
  constructor(profileDirectory: string) {
    super(profileDirectory, SETTINGS_FILE);
  }

  protected defaults(): TextSettings {
    return { ...DEFAULT_SETTINGS };
  }

  protected parse(raw: Record<string, unknown>): TextSettings {
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
