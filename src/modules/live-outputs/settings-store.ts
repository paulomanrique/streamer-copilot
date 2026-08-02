import type { LiveOutputConfig, LiveOutputsSettings } from '../../shared/types.js';
import { liveOutputConfigSchema, liveOutputsSettingsSchema } from '../../shared/schemas.js';
import { JsonSettingsStore } from '../base/settings-store.js';
import { createDefaultLiveOutputsSettings } from './defaults.js';

export class LiveOutputsSettingsStore extends JsonSettingsStore<LiveOutputsSettings> {
  constructor(profileDirectory: string) {
    super(profileDirectory, 'live-outputs.json');
  }

  protected defaults(): LiveOutputsSettings {
    return createDefaultLiveOutputsSettings();
  }

  protected parse(raw: Record<string, unknown>): LiveOutputsSettings {
    const parsed = liveOutputsSettingsSchema.safeParse(raw);
    if (parsed.success) return parsed.data as LiveOutputsSettings;

    const defaults = this.defaults();
    const rawOutputs = Array.isArray(raw.outputs) ? raw.outputs : [];
    const validOutputs = rawOutputs.flatMap((item): LiveOutputConfig[] => {
      const output = liveOutputConfigSchema.safeParse(item);
      return output.success ? [output.data as LiveOutputConfig] : [];
    });
    const byId = new Map(validOutputs.map((output) => [output.id, output]));
    for (const output of defaults.outputs) {
      if (!byId.has(output.id)) byId.set(output.id, output);
    }

    return {
      ...defaults,
      hotkeysEnabled: typeof raw.hotkeysEnabled === 'boolean' ? raw.hotkeysEnabled : defaults.hotkeysEnabled,
      outputs: [...byId.values()],
    };
  }

  protected normalize(input: LiveOutputsSettings): LiveOutputsSettings {
    return liveOutputsSettingsSchema.parse(input) as LiveOutputsSettings;
  }
}
