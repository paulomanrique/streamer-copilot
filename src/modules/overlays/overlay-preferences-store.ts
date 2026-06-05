import type { OverlayId, OverlayPreferences, OverlayPreferencesMap } from '../../shared/types.js';
import { JsonSettingsStore } from '../base/settings-store.js';
import { sanitizeOverlayPreferences } from './overlay-style-sanitize.js';

const SETTINGS_FILE = 'overlay-preferences.json';

const KNOWN_IDS: OverlayId[] = ['chat-overlay', 'chat-dock', 'now-playing', 'raffles', 'polls'];

function isOverlayId(value: unknown): value is OverlayId {
  return typeof value === 'string' && (KNOWN_IDS as string[]).includes(value);
}

/**
 * Per-profile store for overlay customization preferences.
 *
 * Each overlay surface (chat overlay, chat dock, now-playing, etc.) gets
 * its own `OverlayPreferences` slot used as a per-overlay override of the
 * global `OverlayDefaults`. Set fields win over the defaults; unset fields
 * inherit. Persisted here + broadcast over WebSocket so a connected OBS
 * Browser Source updates without reload.
 */
export class OverlayPreferencesStore extends JsonSettingsStore<OverlayPreferencesMap> {
  constructor(profileDirectory: string) {
    super(profileDirectory, SETTINGS_FILE);
  }

  protected defaults(): OverlayPreferencesMap {
    return {};
  }

  protected parse(raw: Record<string, unknown>): OverlayPreferencesMap {
    const out: OverlayPreferencesMap = {};
    for (const [id, prefs] of Object.entries(raw)) {
      if (!isOverlayId(id)) continue;
      out[id] = sanitizeOverlayPreferences(prefs);
    }
    return out;
  }

  /** Returns the current map; missing ids are treated as empty preferences
   *  (caller can default-fallback per-field). */
  async loadAll(): Promise<OverlayPreferencesMap> {
    return this.load();
  }

  /** Replaces the preferences slot for a single overlay. */
  async setForOverlay(id: OverlayId, prefs: OverlayPreferences): Promise<OverlayPreferencesMap> {
    const current = await this.load();
    const next: OverlayPreferencesMap = { ...current, [id]: sanitizeOverlayPreferences(prefs) };
    return this.save(next);
  }
}
