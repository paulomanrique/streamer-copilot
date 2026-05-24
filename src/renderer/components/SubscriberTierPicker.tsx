import type { MinSubscriberTier, PlatformId } from '../../shared/types.js';
import { useAppStore } from '../store.js';

interface SubscriberTierPickerProps {
  /** Mapeamento atual de tier mínimo por plataforma. `undefined` = sem restrição. */
  value: MinSubscriberTier | undefined;
  onChange: (next: MinSubscriberTier | undefined) => void;
  /** Esconde o componente inteiro quando `subscriber` não está selecionado. */
  visible: boolean;
}

/**
 * Selector de tier mínimo por plataforma para gating de comandos.
 *
 * Itera o catálogo (`subscriberTiers` no store) — uma plataforma só aparece
 * se já tem entries catalogadas. Twitch é builtin (T1/T2/T3 sempre presentes).
 * YouTube só aparece depois do scraper ter aprendido pelo menos um nível.
 * Não tem lista hardcoded de plataformas aqui — o que vem do catálogo é o
 * que o streamer vê (alinhado com a regra de simetria do AGENTS.md).
 */
export function SubscriberTierPicker({ value, onChange, visible }: SubscriberTierPickerProps) {
  const catalog = useAppStore((s) => s.subscriberTiers);
  if (!visible) return null;

  const platforms = Object.entries(catalog.byPlatform).filter(([, list]) => (list?.length ?? 0) > 0);
  if (platforms.length === 0) return null;

  const updatePlatform = (platform: PlatformId, tierId: string | '') => {
    const next: MinSubscriberTier = { ...(value ?? {}) };
    if (tierId === '') {
      delete next[platform];
    } else {
      next[platform] = tierId;
    }
    onChange(Object.keys(next).length > 0 ? next : undefined);
  };

  return (
    <div className="mt-2 rounded border border-gray-700 bg-gray-900/40 p-2.5">
      <p className="text-xs text-gray-400 mb-2">Tier mínimo de assinante (por plataforma)</p>
      <div className="space-y-1.5">
        {platforms.map(([platform, entries]) => {
          const sorted = [...(entries ?? [])].sort((a, b) => a.order - b.order);
          const selected = value?.[platform as PlatformId] ?? '';
          return (
            <div key={platform} className="flex items-center gap-2">
              <span className="text-xs text-gray-300 capitalize w-24 shrink-0">{platform}</span>
              <select
                value={selected}
                onChange={(e) => updatePlatform(platform as PlatformId, e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-600 rounded text-xs text-gray-300 px-2 py-1 focus:outline-none focus:border-violet-500"
              >
                <option value="">Qualquer tier</option>
                {sorted.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-600 mt-2">
        Aplica-se só quando &quot;Subscribers&quot; está selecionado acima. Outros níveis (mod/vip) passam direto.
      </p>
    </div>
  );
}
