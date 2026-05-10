import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { EventLogLevel, GeneralSettings } from '../../shared/types.js';
import { AppSettingsRepository } from './app-settings-repository.js';

const GENERAL_SETTINGS_KEY = 'general:settings';
const DEFAULT_RECOMMENDATION_TEMPLATE = 'Pessoal, visitem o {username}';

const VALID_LOG_LEVELS: EventLogLevel[] = ['info', 'warn', 'error'];

const DEFAULT_SETTINGS: GeneralSettings = {
  startOnLogin: false,
  minimizeToTray: true,
  eventNotifications: true,
  recommendationTemplate: DEFAULT_RECOMMENDATION_TEMPLATE,
  diagnosticLogLevel: 'info',
  overlayServerPort: 7842,
};

export class GeneralSettingsStore {
  constructor(private readonly repository: AppSettingsRepository) {}

  load(): GeneralSettings {
    const raw = this.repository.get(GENERAL_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    try {
      const parsed = JSON.parse(raw) as Partial<GeneralSettings>;
      return {
        startOnLogin: parsed.startOnLogin ?? DEFAULT_SETTINGS.startOnLogin,
        minimizeToTray: parsed.minimizeToTray ?? DEFAULT_SETTINGS.minimizeToTray,
        eventNotifications: parsed.eventNotifications ?? DEFAULT_SETTINGS.eventNotifications,
        recommendationTemplate: normalizeRecommendationTemplate(parsed.recommendationTemplate),
        diagnosticLogLevel: VALID_LOG_LEVELS.includes(parsed.diagnosticLogLevel as EventLogLevel)
          ? (parsed.diagnosticLogLevel as EventLogLevel)
          : DEFAULT_SETTINGS.diagnosticLogLevel,
        overlayServerPort: normalizePort(parsed.overlayServerPort),
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  save(input: GeneralSettings): GeneralSettings {
    const nextSettings: GeneralSettings = {
      startOnLogin: Boolean(input.startOnLogin),
      minimizeToTray: Boolean(input.minimizeToTray),
      eventNotifications: Boolean(input.eventNotifications),
      recommendationTemplate: normalizeRecommendationTemplate(input.recommendationTemplate),
      diagnosticLogLevel: VALID_LOG_LEVELS.includes(input.diagnosticLogLevel) ? input.diagnosticLogLevel : 'info',
      overlayServerPort: normalizePort(input.overlayServerPort),
    };
    this.repository.set(GENERAL_SETTINGS_KEY, JSON.stringify(nextSettings));
    return nextSettings;
  }

  async syncStartOnLogin(appName: string, executablePath: string, packaged: boolean): Promise<void> {
    const settings = this.load();

    if (process.platform !== 'linux') return;

    const autostartDirectory = path.join(os.homedir(), '.config', 'autostart');
    const desktopEntryPath = path.join(autostartDirectory, `${appName.toLowerCase().replace(/\s+/g, '-')}.desktop`);

    if (!settings.startOnLogin) {
      await fs.rm(desktopEntryPath, { force: true });
      return;
    }

    await fs.mkdir(autostartDirectory, { recursive: true });
    const execTarget = packaged ? executablePath : `${executablePath} ${path.resolve(process.cwd(), 'dist/main/index.js')}`;
    const desktopEntry = [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${appName}`,
      `Exec=${execTarget}`,
      'X-GNOME-Autostart-enabled=true',
    ].join('\n');
    await fs.writeFile(desktopEntryPath, `${desktopEntry}\n`, 'utf8');
  }
}

function normalizeRecommendationTemplate(input: unknown): string {
  if (typeof input !== 'string') return DEFAULT_RECOMMENDATION_TEMPLATE;
  const value = input.trim();
  return value || DEFAULT_RECOMMENDATION_TEMPLATE;
}

function normalizePort(input: unknown): number {
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n) || n < 1024 || n > 65535) return DEFAULT_SETTINGS.overlayServerPort;
  return Math.floor(n);
}
