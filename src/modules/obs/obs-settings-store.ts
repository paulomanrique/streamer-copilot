import path from 'node:path';

import { safeStorage } from 'electron';

import type { ObsConnectionSettings } from '../../shared/types.js';
import { JsonStore } from '../../db/json-store.js';
import { PROFILE_CONFIG_FILES } from '../../shared/constants.js';

interface ObsSettingsRecord {
  host: string;
  port: number;
  encryptedPassword: string;
}

const DEFAULT_SETTINGS: ObsConnectionSettings = {
  host: '127.0.0.1',
  port: 4455,
  password: '',
};

const EMPTY_RECORD: ObsSettingsRecord = {
  host: DEFAULT_SETTINGS.host,
  port: DEFAULT_SETTINGS.port,
  encryptedPassword: '',
};

export class ObsSettingsStore {
  constructor(private readonly getDirectory: () => string) {}

  private store(): JsonStore<ObsSettingsRecord | null> {
    return new JsonStore<ObsSettingsRecord | null>(
      path.join(this.getDirectory(), PROFILE_CONFIG_FILES.obsSettings),
      null,
    );
  }

  hasUserSettings(): boolean {
    return this.store().exists();
  }

  get(): ObsConnectionSettings {
    const raw = this.store().read();
    if (!raw) return { ...DEFAULT_SETTINGS };
    return {
      host: raw.host || DEFAULT_SETTINGS.host,
      port: typeof raw.port === 'number' ? raw.port : DEFAULT_SETTINGS.port,
      password: raw.encryptedPassword ? this.decryptPassword(raw.encryptedPassword) : '',
    };
  }

  save(input: ObsConnectionSettings): ObsConnectionSettings {
    const normalized: ObsConnectionSettings = {
      host: input.host.trim(),
      port: input.port,
      password: input.password,
    };
    const record: ObsSettingsRecord = {
      ...EMPTY_RECORD,
      host: normalized.host,
      port: normalized.port,
      encryptedPassword: normalized.password ? this.encryptPassword(normalized.password) : '',
    };
    this.store().write(record);
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
