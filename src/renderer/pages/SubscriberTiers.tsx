import { useMemo, useState } from 'react';

import type { PlatformId, SubscriberTierEntry } from '../../shared/types.js';
import { listPlatformProviders } from '../platforms/registry.js';
import { useAppStore } from '../store.js';

/**
 * Página de gestão do catálogo de tiers de membro pagos por plataforma.
 *
 * Per-plataforma:
 *   - `source: 'builtin'` (Twitch T1/T2/T3) → read-only.
 *   - `source: 'api'` (YouTube via Data API) → read-only (a API define a ordem).
 *   - `source: 'scraped'` (YouTube via scraper, observado das mensagens) →
 *     reordenável + renomeável. A ordem definida aqui é o que o resolver de
 *     permissões usa pra comparar `minSubscriberTier`.
 *
 * Nenhum platform id é hardcoded — a página itera o registry e mostra só
 * plataformas cujo catálogo tem entries, alinhado com a regra de simetria.
 */
export function SubscriberTiersPage() {
  const catalog = useAppStore((s) => s.subscriberTiers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providers = useMemo(() => {
    const allProviders = listPlatformProviders();
    return allProviders
      .map((p) => ({ provider: p, entries: catalog.byPlatform[p.id as PlatformId] ?? [] }))
      .filter(({ entries }) => entries.length > 0);
  }, [catalog]);

  const saveEntries = async (platform: PlatformId, entries: SubscriberTierEntry[]) => {
    setBusy(true);
    setError(null);
    try {
      await window.copilot.replaceSubscriberTiers({ platform, entries });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-gray-100">Tiers de assinante</h2>
        <p className="text-sm text-gray-400 mt-1">
          Ordene os níveis de membro de cada plataforma para que o gating &quot;tier mínimo&quot;
          dos comandos funcione corretamente. Twitch é fixo. YouTube aprende automaticamente conforme
          membros aparecem no chat.
        </p>
        {error ? <p className="text-sm text-red-400 mt-2">{error}</p> : null}
      </header>

      {providers.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum tier observado ainda. Conecte-se ao chat para que o sistema aprenda os níveis.</p>
      ) : null}

      {providers.map(({ provider, entries }) => (
        <PlatformTierSection
          key={provider.id}
          platformId={provider.id as PlatformId}
          displayName={provider.displayName}
          entries={entries}
          disabled={busy}
          onSave={(next) => saveEntries(provider.id as PlatformId, next)}
        />
      ))}
    </div>
  );
}

interface PlatformTierSectionProps {
  platformId: PlatformId;
  displayName: string;
  entries: SubscriberTierEntry[];
  disabled: boolean;
  onSave: (next: SubscriberTierEntry[]) => Promise<void>;
}

function PlatformTierSection({ platformId, displayName, entries, disabled, onSave }: PlatformTierSectionProps) {
  const sorted = useMemo(() => [...entries].sort((a, b) => a.order - b.order), [entries]);
  const readOnly = sorted.every((e) => e.source !== 'scraped');

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const next = [...sorted];
    [next[index], next[target]] = [next[target], next[index]];
    void onSave(next.map((e, i) => ({ ...e, order: i + 1 })));
  };

  const rename = (index: number, label: string) => {
    if (sorted[index].source !== 'scraped') return;
    const next = sorted.map((e, i) => i === index ? { ...e, label } : e);
    void onSave(next);
  };

  return (
    <section className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-medium text-gray-200">{displayName}</h3>
        <span className="text-xs text-gray-500">
          {readOnly ? 'Read-only' : `${sorted.length} nível${sorted.length === 1 ? '' : 'is'}`}
        </span>
      </div>
      <ul className="space-y-1">
        {sorted.map((entry, index) => (
          <li
            key={entry.id}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-gray-800/60"
            data-platform={platformId}
          >
            <span className="text-xs text-gray-500 w-6 shrink-0 text-right">{entry.order}.</span>
            {entry.source === 'scraped' ? (
              <input
                type="text"
                defaultValue={entry.label}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value && value !== entry.label) rename(index, value);
                }}
                disabled={disabled}
                className="flex-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 px-2 py-1 focus:outline-none focus:border-violet-500"
              />
            ) : (
              <span className="flex-1 text-sm text-gray-300">{entry.label}</span>
            )}
            <span className="text-[10px] uppercase tracking-wide text-gray-600 px-1.5 py-0.5 rounded bg-gray-800 shrink-0">
              {entry.source}
            </span>
            {entry.source === 'scraped' ? (
              <div className="flex gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={disabled || index === 0}
                  className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs disabled:opacity-40"
                  aria-label="Mover para cima"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={disabled || index === sorted.length - 1}
                  className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs disabled:opacity-40"
                  aria-label="Mover para baixo"
                >
                  ↓
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
