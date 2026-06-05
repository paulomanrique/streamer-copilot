import { useEffect, useState } from 'react';

import type { OverlayId, OverlayPreferences } from '../../shared/types.js';

interface CustomizeOverlayModalProps {
  /** Which overlay surface is being customized. Drives the option set rendered. */
  overlayId: OverlayId;
  /** Human-readable title shown in the modal header. */
  title: string;
  open: boolean;
  onClose: () => void;
  /** Current preferences slice for this overlay; falls back to defaults when
   *  fields are missing. */
  initialPrefs: OverlayPreferences;
  /** Called whenever the streamer drags a slider — fires on every change so
   *  the OBS browser source updates live via the WS push from app-context. */
  onChange: (next: OverlayPreferences) => void;
}

/**
 * Generic per-overlay customization modal.
 *
 * The set of options visible depends on `overlayId` — today only `opacity`,
 * but the structure is built to grow as each overlay gets bespoke knobs
 * (chat row spacing, font scale, background tint, etc.).
 */
export function CustomizeOverlayModal({
  overlayId,
  title,
  open,
  onClose,
  initialPrefs,
  onChange,
}: CustomizeOverlayModalProps) {
  const [prefs, setPrefs] = useState<OverlayPreferences>(initialPrefs);

  useEffect(() => {
    if (open) setPrefs(initialPrefs);
  }, [open, initialPrefs]);

  if (!open) return null;

  const updatePrefs = (patch: Partial<OverlayPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    onChange(next);
  };

  // Backdrop opacity applies to every overlay that's meant to sit on top of
  // the OBS scene. The chat dock is intentionally excluded — it's a full
  // opaque dock for the streamer to read messages, not a scene element.
  const hasOpacity = overlayId !== 'chat-dock';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
        <header className="px-5 py-4 border-b border-gray-700">
          <h3 className="font-semibold text-gray-100">Personalizar {title}</h3>
          <p className="text-xs text-gray-500 mt-1">
            Ajustes aplicam ao vivo na Browser Source do OBS conectada.
          </p>
        </header>

        <div className="p-5 space-y-5">
          {hasOpacity ? (
            <OpacityField
              value={prefs.opacity ?? 0}
              onChange={(opacity) => updatePrefs({ opacity })}
            />
          ) : (
            <p className="text-sm text-gray-500">
              Sem opções de personalização para este overlay ainda.
            </p>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-gray-700 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm text-white"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}

function OpacityField({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const percent = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-sm text-gray-300">Opacidade do fundo</label>
        <span className="text-xs text-gray-400 font-mono">{percent}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet-500"
      />
      <p className="text-xs text-gray-600 mt-1">
        Escurece um painel atrás do conteúdo pra deixar o overlay mais legível
        sobre cenas com muito movimento. 0% mantém o cenário do OBS limpo;
        100% deixa o painel totalmente opaco. O texto/imagem sempre fica nítido.
      </p>
    </div>
  );
}
