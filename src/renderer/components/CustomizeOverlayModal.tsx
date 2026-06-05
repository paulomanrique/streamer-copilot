import { useEffect, useState } from 'react';

import { OVERLAY_FONTS } from '../../shared/constants.js';
import type { OverlayId, OverlayPreferences } from '../../shared/types.js';

interface CustomizeOverlayModalProps {
  /** Which overlay surface is being customized. */
  overlayId: OverlayId;
  /** Human-readable title shown in the modal header. */
  title: string;
  open: boolean;
  onClose: () => void;
  /** Current per-overlay override slice. Falls back to the global defaults
   *  field-by-field; unset fields = inherit from the editor on the page. */
  initialPrefs: OverlayPreferences;
  /** Called whenever the streamer drags a slider — fires on every change so
   *  the OBS browser source updates live via the WS push from app-context. */
  onChange: (next: OverlayPreferences) => void;
}

type OverrideKey =
  | 'backgroundColor'
  | 'backgroundOpacity'
  | 'borderRadius'
  | 'borderColor'
  | 'borderWidth'
  | 'fontFamily'
  | 'fontColor'
  | 'fontSize'
  | 'accentColor';

const DEFAULT_VALUES: Record<OverrideKey, string | number> = {
  backgroundColor: '#000000',
  backgroundOpacity: 0,
  borderRadius: 4,
  borderColor: '#7c5cff',
  borderWidth: 0,
  fontFamily: 'system',
  fontColor: '#d1d5db',
  fontSize: 14,
  accentColor: '#c4b5fd',
};

/**
 * Per-overlay override modal — every field has a "Usar padrão" toggle that
 * removes the override from the persisted `OverlayPreferences` slot. With
 * everything toggled to default, the overlay inherits the global visual
 * style set on the Overlays page editor.
 *
 * The chat dock is special-cased: it's an in-app dock for the streamer to
 * read messages, not a scene element, so its only knob is opacity (and
 * even that's hidden — the dock is supposed to be opaque).
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

  function updatePrefs(patch: Partial<OverlayPreferences>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    onChange(next);
  }

  function setOverride<K extends OverrideKey>(key: K, value: OverlayPreferences[K] | undefined) {
    const next = { ...prefs };
    if (value === undefined) delete next[key];
    else next[key] = value;
    setPrefs(next);
    onChange(next);
  }

  // Chat dock keeps its opaque-by-design behavior and skips the override
  // panel entirely; everything else (chat overlay, raffles, polls,
  // now-playing) is a scene element and gets the full editor.
  if (overlayId === 'chat-dock') {
    return (
      <ModalShell title={title} onClose={onClose}>
        <p className="text-sm text-gray-500">Sem opções de personalização para este overlay ainda.</p>
      </ModalShell>
    );
  }

  // Legacy compat: older profiles may have stored a top-level `opacity`
  // field instead of `backgroundOpacity`. Surface it under the new key so
  // the toggle behaves consistently.
  const bgOpacityOverride = prefs.backgroundOpacity ?? prefs.opacity;

  return (
    <ModalShell title={title} onClose={onClose}>
      <p className="text-xs text-gray-500 -mt-1 mb-2">
        Cada ajuste aqui sobrescreve o visual padrão só para este overlay. Marque "Usar padrão" para herdar de novo.
      </p>

      <OverrideField
        label="Cor de fundo"
        active={prefs.backgroundColor !== undefined}
        onToggleActive={(active) =>
          setOverride('backgroundColor', active ? String(DEFAULT_VALUES.backgroundColor) : undefined)
        }
      >
        <ColorInput
          value={prefs.backgroundColor ?? String(DEFAULT_VALUES.backgroundColor)}
          onChange={(v) => setOverride('backgroundColor', v)}
        />
      </OverrideField>

      <OverrideField
        label="Opacidade do fundo"
        active={bgOpacityOverride !== undefined}
        onToggleActive={(active) => {
          if (active) {
            updatePrefs({ backgroundOpacity: bgOpacityOverride ?? Number(DEFAULT_VALUES.backgroundOpacity), opacity: undefined });
          } else {
            updatePrefs({ backgroundOpacity: undefined, opacity: undefined });
          }
        }}
      >
        <SliderInput
          value={bgOpacityOverride ?? 0}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => updatePrefs({ backgroundOpacity: v, opacity: undefined })}
        />
      </OverrideField>

      <OverrideField
        label="Arredondamento"
        active={prefs.borderRadius !== undefined}
        onToggleActive={(active) =>
          setOverride('borderRadius', active ? Number(DEFAULT_VALUES.borderRadius) : undefined)
        }
      >
        <SliderInput
          value={prefs.borderRadius ?? Number(DEFAULT_VALUES.borderRadius)}
          min={0}
          max={32}
          step={1}
          format={(v) => `${v}px`}
          onChange={(v) => setOverride('borderRadius', v)}
        />
      </OverrideField>

      <OverrideField
        label="Cor da borda"
        active={prefs.borderColor !== undefined}
        onToggleActive={(active) =>
          setOverride('borderColor', active ? String(DEFAULT_VALUES.borderColor) : undefined)
        }
      >
        <ColorInput
          value={prefs.borderColor ?? String(DEFAULT_VALUES.borderColor)}
          onChange={(v) => setOverride('borderColor', v)}
        />
      </OverrideField>

      <OverrideField
        label="Espessura da borda"
        active={prefs.borderWidth !== undefined}
        onToggleActive={(active) =>
          setOverride('borderWidth', active ? Number(DEFAULT_VALUES.borderWidth) : undefined)
        }
      >
        <SliderInput
          value={prefs.borderWidth ?? Number(DEFAULT_VALUES.borderWidth)}
          min={0}
          max={6}
          step={1}
          format={(v) => `${v}px`}
          onChange={(v) => setOverride('borderWidth', v)}
        />
      </OverrideField>

      <OverrideField
        label="Família da fonte"
        active={prefs.fontFamily !== undefined}
        onToggleActive={(active) =>
          setOverride('fontFamily', active ? String(DEFAULT_VALUES.fontFamily) : undefined)
        }
      >
        <SelectInput
          value={prefs.fontFamily ?? String(DEFAULT_VALUES.fontFamily)}
          options={OVERLAY_FONTS.map((entry) => ({ value: entry.key, label: entry.label }))}
          onChange={(v) => setOverride('fontFamily', v)}
        />
      </OverrideField>

      <OverrideField
        label="Cor da fonte"
        active={prefs.fontColor !== undefined}
        onToggleActive={(active) =>
          setOverride('fontColor', active ? String(DEFAULT_VALUES.fontColor) : undefined)
        }
      >
        <ColorInput
          value={prefs.fontColor ?? String(DEFAULT_VALUES.fontColor)}
          onChange={(v) => setOverride('fontColor', v)}
        />
      </OverrideField>

      <OverrideField
        label="Tamanho da fonte"
        active={prefs.fontSize !== undefined}
        onToggleActive={(active) =>
          setOverride('fontSize', active ? Number(DEFAULT_VALUES.fontSize) : undefined)
        }
      >
        <SliderInput
          value={prefs.fontSize ?? Number(DEFAULT_VALUES.fontSize)}
          min={10}
          max={28}
          step={1}
          format={(v) => `${v}px`}
          onChange={(v) => setOverride('fontSize', v)}
        />
      </OverrideField>

      <OverrideField
        label="Cor de destaque"
        active={prefs.accentColor !== undefined}
        onToggleActive={(active) =>
          setOverride('accentColor', active ? String(DEFAULT_VALUES.accentColor) : undefined)
        }
      >
        <ColorInput
          value={prefs.accentColor ?? String(DEFAULT_VALUES.accentColor)}
          onChange={(v) => setOverride('accentColor', v)}
        />
      </OverrideField>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <header className="px-5 py-4 border-b border-gray-700 shrink-0">
          <h3 className="font-semibold text-gray-100">Personalizar {title}</h3>
          <p className="text-xs text-gray-500 mt-1">
            Ajustes aplicam ao vivo na Browser Source do OBS conectada.
          </p>
        </header>
        <div className="p-5 space-y-4 overflow-y-auto">{children}</div>
        <footer className="px-5 py-3 border-t border-gray-700 flex justify-end shrink-0">
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

function OverrideField({
  label, active, onToggleActive, children,
}: {
  label: string;
  active: boolean;
  onToggleActive: (active: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={active ? '' : 'opacity-60'}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <label className="text-sm text-gray-300">{label}</label>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={!active}
            onChange={(e) => onToggleActive(!e.target.checked)}
            className="accent-violet-500"
          />
          Usar padrão
        </label>
      </div>
      {active ? children : (
        <p className="text-xs text-gray-600 italic">Herdando do visual padrão.</p>
      )}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-12 rounded border border-gray-600 bg-transparent cursor-pointer"
      />
      <span className="text-xs text-gray-400 font-mono">{value.toUpperCase()}</span>
    </div>
  );
}

function SliderInput({
  value, min, max, step, format, onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (next: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-gray-400 font-mono">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet-500"
      />
    </div>
  );
}

function SelectInput({
  value, options, onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-gray-700 border border-gray-600 rounded text-sm text-gray-200 px-2 py-1 focus:outline-none focus:border-violet-500"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
