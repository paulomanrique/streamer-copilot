import type { WelcomeSettings, WelcomeUserOverride } from '../../shared/types.js';
import { JsonSettingsStore } from '../base/settings-store.js';

const SETTINGS_FILE = 'welcome-settings.json';

const DEFAULT_SETTINGS: WelcomeSettings = {
  enabled: false,
  messageTemplate: 'Welcome, {username}! 👋',
  soundFilePath: null,
  userOverrides: [],
};

export class WelcomeSettingsStore extends JsonSettingsStore<WelcomeSettings> {
  constructor(profileDirectory: string) {
    super(profileDirectory, SETTINGS_FILE);
  }

  protected defaults(): WelcomeSettings {
    return { ...DEFAULT_SETTINGS, userOverrides: [] };
  }

  protected parse(raw: Record<string, unknown>): WelcomeSettings {
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_SETTINGS.enabled,
      messageTemplate:
        typeof raw.messageTemplate === 'string' && raw.messageTemplate.trim()
          ? (raw.messageTemplate as string)
          : DEFAULT_SETTINGS.messageTemplate,
      soundFilePath:
        typeof raw.soundFilePath === 'string' && (raw.soundFilePath as string).trim()
          ? (raw.soundFilePath as string)
          : null,
      userOverrides: Array.isArray(raw.userOverrides)
        ? (raw.userOverrides as WelcomeUserOverride[]).filter(
            (o) => typeof o.username === 'string' && o.username.trim(),
          )
        : [],
    };
  }

  protected normalize(input: WelcomeSettings): WelcomeSettings {
    return {
      enabled: Boolean(input.enabled),
      messageTemplate: input.messageTemplate.trim() || DEFAULT_SETTINGS.messageTemplate,
      soundFilePath: input.soundFilePath?.trim() || null,
      userOverrides: (input.userOverrides ?? []).map((o) => ({
        username: o.username.trim(),
        messageTemplate: o.messageTemplate?.trim() || null,
        soundFilePath: o.soundFilePath?.trim() || null,
      })),
    };
  }
}
