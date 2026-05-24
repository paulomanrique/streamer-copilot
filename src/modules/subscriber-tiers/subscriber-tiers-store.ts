import type { PlatformId, SubscriberTierCatalog, SubscriberTierEntry } from '../../shared/types.js';
import { JsonSettingsStore } from '../base/settings-store.js';

const SETTINGS_FILE = 'subscriber-tiers.json';

/** Twitch tiers são fixos pela plataforma — sempre presentes no catálogo. */
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
 * Catálogo per-profile dos tiers de membro pagos por plataforma.
 *
 * - Twitch: seed builtin de T1/T2/T3 — não muda em runtime.
 * - YouTube API: na conexão do adapter, chama `youtube.membershipsLevels.list`
 *   e substitui as entries `source: 'api'` (replaceForPlatform).
 * - YouTube scraper: cada mensagem com tier desconhecido faz upsert com
 *   `source: 'scraped'` (upsertScraped). O streamer reordena via UI.
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

  /** Substitui todas as entries de uma plataforma. Usado pelo path da API
   *  do YouTube (`membershipsLevels.list`) e pela UI de reordenação. */
  async replaceForPlatform(platform: PlatformId, entries: SubscriberTierEntry[]): Promise<SubscriberTierCatalog> {
    const current = await this.load();
    const next: SubscriberTierCatalog = {
      byPlatform: { ...current.byPlatform, [platform]: entries },
    };
    return this.save(next);
  }

  /** Acrescenta um tier observado no chat se ainda não estiver catalogado.
   *  Novo `order` = max(existing) + 1. Retorna `true` se algo mudou. */
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
