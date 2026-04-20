import { safeStorage } from 'electron';

import type { ObsConnectionSettings } from '../../shared/types.js';
import { AppSettingsRepository } from '../settings/app-settings-repository.js';

interface ObsSettingsRecord {
  host: string;
  port: number;
  encryptedPassword: string;
}

const OBS_SETTINGS_KEY = 'obs.connection';

const DEFAULT_SETTINGS: ObsConnectionSettings = {
  host: '127.0.0.1',
  port: 4455,
  password: '',
};

export class ObsSettingsStore {
  constructor(private readonly repository: AppSettingsRepository) {}

  /** Returns true when the user has explicitly saved OBS settings at least once. */
  hasUserSettings(): boolean {
    return this.repository.get(OBS_SETTINGS_KEY) !== null;
  }

  get(): ObsConnectionSettings {
    const raw = this.repository.get(OBS_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    try {
      const parsed = JSON.parse(raw) as Partial<ObsSettingsRecord>;
      return {
        host: parsed.host || DEFAULT_SETTINGS.host,
        port: typeof parsed.port === 'number' ? parsed.port : DEFAULT_SETTINGS.port,
        password: parsed.encryptedPassword ? this.decryptPassword(parsed.encryptedPassword) : '',
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  save(input: ObsConnectionSettings): ObsConnectionSettings {
    const normalized: ObsConnectionSettings = {
      host: input.host.trim(),
      port: input.port,
      password: input.password,
    };
    const record: ObsSettingsRecord = {
      host: normalized.host,
      port: normalized.port,
      encryptedPassword: normalized.password ? this.encryptPassword(normalized.password) : '',
    };

    this.repository.set(OBS_SETTINGS_KEY, `${JSON.stringify(record, null, 2)}\n`);
    return normalized;
  }

  private encryptPassword(password: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage encryption is not available on this machine');
    }

    return safeStorage.encryptString(password).toString('base64');
  }

  private decryptPassword(encryptedPassword: string): string {
    if (!safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(Buffer.from(encryptedPassword, 'base64'));
  }
}
