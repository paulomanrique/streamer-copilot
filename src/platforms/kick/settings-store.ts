import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { KickSettings } from '../../shared/types.js';
import { decryptMarked, encryptMarked, isPlaintextSecret } from '../secret-storage.js';

const SETTINGS_FILE = 'kick-settings.json';

const DEFAULT_SETTINGS: KickSettings = {
  channelInput: '',
  clientId: '',
  clientSecret: '',
  autoConnect: false,
};

export class KickSettingsStore {
  private readonly filePath: string;

  constructor(profileDirectory: string) {
    this.filePath = path.join(profileDirectory, SETTINGS_FILE);
  }

  async load(): Promise<KickSettings> {
    let parsed: Partial<KickSettings>;
    try {
      parsed = JSON.parse(await fs.readFile(this.filePath, 'utf-8')) as Partial<KickSettings>;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }

    const storedSecret = typeof parsed.clientSecret === 'string' ? parsed.clientSecret : DEFAULT_SETTINGS.clientSecret;
    const settings: KickSettings = {
      channelInput: typeof parsed.channelInput === 'string' ? parsed.channelInput : DEFAULT_SETTINGS.channelInput,
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : DEFAULT_SETTINGS.clientId,
      clientSecret: decryptMarked(storedSecret),
      autoConnect: typeof parsed.autoConnect === 'boolean' ? parsed.autoConnect : DEFAULT_SETTINGS.autoConnect,
    };

    // Migrate a legacy plaintext client secret to encrypted-at-rest on first read.
    if (isPlaintextSecret(storedSecret)) {
      await this.save(settings).catch(() => { /* best-effort migration */ });
    }
    return settings;
  }

  async save(settings: KickSettings): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const onDisk: KickSettings = { ...settings, clientSecret: encryptMarked(settings.clientSecret) };
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(onDisk, null, 2), 'utf-8');
    await fs.rename(tmp, this.filePath);
  }

  async clear(): Promise<void> {
    await fs.rm(this.filePath, { force: true });
  }
}
