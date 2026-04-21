import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { MusicRequestSettings } from '../../shared/types.js';

const SETTINGS_FILE = 'music-request-settings.json';

const DEFAULT_SETTINGS: MusicRequestSettings = {
  enabled: false,
  volume: 0.5,
  maxQueueSize: 20,
  maxDurationSeconds: 600,
  requestTrigger: '!sr',
  skipTrigger: '!skip',
  queueTrigger: '!queue',
  cancelTrigger: '!cancel',
  requestPermissions: ['everyone'],
  skipPermissions: ['moderator', 'broadcaster'],
  cooldownSeconds: 5,
  userCooldownSeconds: 30,
};

export class MusicSettingsStore {
  private readonly filePath: string;

  constructor(profileDirectory: string) {
    this.filePath = path.join(profileDirectory, SETTINGS_FILE);
  }

  async load(): Promise<MusicRequestSettings> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Record<string, unknown>;
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SETTINGS.enabled,
        volume: typeof parsed.volume === 'number' ? parsed.volume : DEFAULT_SETTINGS.volume,
        maxQueueSize: typeof parsed.maxQueueSize === 'number' ? parsed.maxQueueSize : DEFAULT_SETTINGS.maxQueueSize,
        maxDurationSeconds: typeof parsed.maxDurationSeconds === 'number' ? parsed.maxDurationSeconds : DEFAULT_SETTINGS.maxDurationSeconds,
        requestTrigger: typeof parsed.requestTrigger === 'string' && parsed.requestTrigger.trim() ? parsed.requestTrigger as string : DEFAULT_SETTINGS.requestTrigger,
        skipTrigger: typeof parsed.skipTrigger === 'string' && parsed.skipTrigger.trim() ? parsed.skipTrigger as string : DEFAULT_SETTINGS.skipTrigger,
        queueTrigger: typeof parsed.queueTrigger === 'string' && parsed.queueTrigger.trim() ? parsed.queueTrigger as string : DEFAULT_SETTINGS.queueTrigger,
        cancelTrigger: typeof parsed.cancelTrigger === 'string' && parsed.cancelTrigger.trim() ? parsed.cancelTrigger as string : DEFAULT_SETTINGS.cancelTrigger,
        requestPermissions: Array.isArray(parsed.requestPermissions) && parsed.requestPermissions.length > 0
          ? parsed.requestPermissions as MusicRequestSettings['requestPermissions']
          : DEFAULT_SETTINGS.requestPermissions,
        skipPermissions: Array.isArray(parsed.skipPermissions) && parsed.skipPermissions.length > 0
          ? parsed.skipPermissions as MusicRequestSettings['skipPermissions']
          : DEFAULT_SETTINGS.skipPermissions,
        cooldownSeconds: typeof parsed.cooldownSeconds === 'number' ? parsed.cooldownSeconds : DEFAULT_SETTINGS.cooldownSeconds,
        userCooldownSeconds: typeof parsed.userCooldownSeconds === 'number' ? parsed.userCooldownSeconds : DEFAULT_SETTINGS.userCooldownSeconds,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async save(input: MusicRequestSettings): Promise<MusicRequestSettings> {
    const next: MusicRequestSettings = {
      enabled: Boolean(input.enabled),
      volume: Math.max(0, Math.min(1, input.volume)),
      maxQueueSize: input.maxQueueSize,
      maxDurationSeconds: input.maxDurationSeconds,
      requestTrigger: input.requestTrigger.trim() || DEFAULT_SETTINGS.requestTrigger,
      skipTrigger: input.skipTrigger.trim() || DEFAULT_SETTINGS.skipTrigger,
      queueTrigger: input.queueTrigger.trim() || DEFAULT_SETTINGS.queueTrigger,
      cancelTrigger: input.cancelTrigger.trim() || DEFAULT_SETTINGS.cancelTrigger,
      requestPermissions: input.requestPermissions,
      skipPermissions: input.skipPermissions,
      cooldownSeconds: input.cooldownSeconds,
      userCooldownSeconds: input.userCooldownSeconds,
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }
}
