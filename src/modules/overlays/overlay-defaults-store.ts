import type { OverlayDefaults } from '../../shared/types.js';
import { JsonSettingsStore } from '../base/settings-store.js';
import { sanitizeOverlayVisualStyle } from './overlay-style-sanitize.js';

const SETTINGS_FILE = 'overlay-defaults.json';

/**
 * Per-profile store for the global "default visual style" applied to every
 * overlay surface. Lives next to `overlay-preferences.json` (per-overlay
 * overrides) — each overlay renderer merges the two with prefs winning.
 *
 * Missing fields are deliberate: an unset color/border/font means "use the
 * overlay's CSS fallback", not "render transparent". This keeps the file
 * tiny and lets future fields grow without migrations.
 */
export class OverlayDefaultsStore extends JsonSettingsStore<OverlayDefaults> {
  constructor(profileDirectory: string) {
    super(profileDirectory, SETTINGS_FILE);
  }

  protected defaults(): OverlayDefaults {
    return {};
  }

  protected parse(raw: Record<string, unknown>): OverlayDefaults {
    return sanitizeOverlayVisualStyle(raw);
  }

  async loadAll(): Promise<OverlayDefaults> {
    return this.load();
  }

  async replaceAll(next: OverlayDefaults): Promise<OverlayDefaults> {
    return this.save(sanitizeOverlayVisualStyle(next));
  }
}
