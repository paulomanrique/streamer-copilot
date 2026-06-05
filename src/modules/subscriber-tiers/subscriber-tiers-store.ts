import type { PlatformId, SubscriberTierCatalog, SubscriberTierEntry } from '../../shared/types.js';
import { JsonSettingsStore } from '../base/settings-store.js';

const SETTINGS_FILE = 'subscriber-tiers.json';

/** Twitch tiers are platform-defined and fixed — always seeded. */
const TWITCH_BUILTIN: SubscriberTierEntry[] = [
  { id: '1', label: 'Tier 1', order: 1, source: 'builtin' },
  { id: '2', label: 'Tier 2', order: 2, source: 'builtin' },
  { id: '3', label: 'Tier 3', order: 3, source: 'builtin' },
];

function defaultCatalog(): SubscriberTierCatalog {
  return { byPlatform: { twitch: TWITCH_BUILTIN.map((e) => ({ ...e })) } };
}

function isEntry(value: unknown): value is SubscriberTierEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.label === 'string' &&
    typeof v.order === 'number' &&
    (v.source === 'builtin' || v.source === 'scraped' || v.source === 'api')
  );
}

/**
 * Per-profile catalog of paid-subscriber tiers per platform.
 *
 * - Twitch: built-in seed (T1/T2/T3) — doesn't change at runtime.
 * - YouTube API: on adapter connect, calls `youtube.membershipsLevels.list`
 *   and replaces `source: 'api'` entries via `replaceForPlatform`.
 * - YouTube scraper: every message with an unknown tier upserts into the
 *   catalog with `source: 'scraped'` (via `upsertScraped`). The streamer
 *   reorders through the management UI.
 */
export class SubscriberTiersStore extends JsonSettingsStore<SubscriberTierCatalog> {
  constructor(profileDirectory: string) {
    super(profileDirectory, SETTINGS_FILE);
  }

  protected defaults(): SubscriberTierCatalog {
    return defaultCatalog();
  }

  protected parse(raw: Record<string, unknown>): SubscriberTierCatalog {
    const byPlatformRaw = (raw.byPlatform && typeof raw.byPlatform === 'object')
      ? raw.byPlatform as Record<string, unknown>
      : {};
    const out: SubscriberTierCatalog['byPlatform'] = {};
    for (const [platform, list] of Object.entries(byPlatformRaw)) {
      if (!Array.isArray(list)) continue;
      const entries = list.filter(isEntry).map((e) => ({ ...e }));
      if (entries.length > 0) out[platform as PlatformId] = entries;
    }
    if (!out.twitch) out.twitch = TWITCH_BUILTIN.map((e) => ({ ...e }));
    return { byPlatform: out };
  }

  protected normalize(input: SubscriberTierCatalog): SubscriberTierCatalog {
    const out: SubscriberTierCatalog['byPlatform'] = {};
    for (const [platform, list] of Object.entries(input.byPlatform)) {
      if (!list) continue;
      const sorted = [...list].sort((a, b) => a.order - b.order);
      const renumbered = sorted.map((e, i) => ({ ...e, order: i + 1 }));
      out[platform as PlatformId] = renumbered;
    }
    return { byPlatform: out };
  }

  /** Replaces every entry for a platform. Used by the YouTube API path
   *  (`membershipsLevels.list`) and by the management UI's reorder action. */
  async replaceForPlatform(platform: PlatformId, entries: SubscriberTierEntry[]): Promise<SubscriberTierCatalog> {
    const current = await this.load();
    const next: SubscriberTierCatalog = {
      byPlatform: { ...current.byPlatform, [platform]: entries },
    };
    return this.save(next);
  }

  /** Appends a tier observed in chat if not yet catalogued. New `order` is
   *  `max(existing) + 1`. Returns `true` when something actually changed. */
  async upsertScraped(platform: PlatformId, tierId: string): Promise<boolean> {
    const id = tierId.trim();
    if (!id) return false;
    const current = await this.load();
    const list = current.byPlatform[platform] ?? [];
    if (list.some((e) => e.id === id)) return false;
    const nextOrder = list.reduce((max, e) => Math.max(max, e.order), 0) + 1;
    const entry: SubscriberTierEntry = { id, label: id, order: nextOrder, source: 'scraped' };
    await this.save({
      byPlatform: { ...current.byPlatform, [platform]: [...list, entry] },
    });
    return true;
  }
}
