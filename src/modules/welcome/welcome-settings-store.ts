import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { WelcomeSettings } from '../../shared/types.js';

const SETTINGS_FILE = 'welcome-settings.json';

const DEFAULT_SETTINGS: WelcomeSettings = {
  enabled: false,
  messageTemplate: 'Welcome, {username}! 👋',
  soundFilePath: null,
};

export class WelcomeSettingsStore {
  private readonly filePath: string;

  constructor(profileDirectory: string) {
    this.filePath = path.join(profileDirectory, SETTINGS_FILE);
  }

  async load(): Promise<WelcomeSettings> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<WelcomeSettings>;
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SETTINGS.enabled,
        messageTemplate:
          typeof parsed.messageTemplate === 'string' && parsed.messageTemplate.trim()
            ? parsed.messageTemplate
            : DEFAULT_SETTINGS.messageTemplate,
        soundFilePath:
          typeof parsed.soundFilePath === 'string' && parsed.soundFilePath.trim()
            ? parsed.soundFilePath
            : null,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async save(input: WelcomeSettings): Promise<WelcomeSettings> {
    const next: WelcomeSettings = {
      enabled: Boolean(input.enabled),
      messageTemplate: input.messageTemplate.trim() || DEFAULT_SETTINGS.messageTemplate,
      soundFilePath: input.soundFilePath?.trim() || null,
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }
}
