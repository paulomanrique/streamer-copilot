import type { MusicRequestSettings } from '../../shared/types.js';
import { JsonSettingsStore } from '../base/settings-store.js';

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

export class MusicSettingsStore extends JsonSettingsStore<MusicRequestSettings> {
  constructor(profileDirectory: string) {
    super(profileDirectory, SETTINGS_FILE);
  }

  protected defaults(): MusicRequestSettings {
    return { ...DEFAULT_SETTINGS };
  }

  protected parse(raw: Record<string, unknown>): MusicRequestSettings {
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_SETTINGS.enabled,
      volume: typeof raw.volume === 'number' ? raw.volume : DEFAULT_SETTINGS.volume,
      maxQueueSize: typeof raw.maxQueueSize === 'number' ? raw.maxQueueSize : DEFAULT_SETTINGS.maxQueueSize,
      maxDurationSeconds: typeof raw.maxDurationSeconds === 'number' ? raw.maxDurationSeconds : DEFAULT_SETTINGS.maxDurationSeconds,
      requestTrigger:
        typeof raw.requestTrigger === 'string' && raw.requestTrigger.trim()
          ? (raw.requestTrigger as string)
          : DEFAULT_SETTINGS.requestTrigger,
      skipTrigger:
        typeof raw.skipTrigger === 'string' && raw.skipTrigger.trim()
          ? (raw.skipTrigger as string)
          : DEFAULT_SETTINGS.skipTrigger,
      queueTrigger:
        typeof raw.queueTrigger === 'string' && raw.queueTrigger.trim()
          ? (raw.queueTrigger as string)
          : DEFAULT_SETTINGS.queueTrigger,
      cancelTrigger:
        typeof raw.cancelTrigger === 'string' && raw.cancelTrigger.trim()
          ? (raw.cancelTrigger as string)
          : DEFAULT_SETTINGS.cancelTrigger,
      requestPermissions:
        Array.isArray(raw.requestPermissions) && raw.requestPermissions.length > 0
          ? (raw.requestPermissions as MusicRequestSettings['requestPermissions'])
          : DEFAULT_SETTINGS.requestPermissions,
      skipPermissions:
        Array.isArray(raw.skipPermissions) && raw.skipPermissions.length > 0
          ? (raw.skipPermissions as MusicRequestSettings['skipPermissions'])
          : DEFAULT_SETTINGS.skipPermissions,
      cooldownSeconds: typeof raw.cooldownSeconds === 'number' ? raw.cooldownSeconds : DEFAULT_SETTINGS.cooldownSeconds,
      userCooldownSeconds: typeof raw.userCooldownSeconds === 'number' ? raw.userCooldownSeconds : DEFAULT_SETTINGS.userCooldownSeconds,
    };
  }

  protected normalize(input: MusicRequestSettings): MusicRequestSettings {
    return {
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
  }
}
