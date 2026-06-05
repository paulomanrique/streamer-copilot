import { useEffect, useState } from 'react';

import { OVERLAY_FONTS } from '../../shared/constants.js';
import type { OverlayDefaults } from '../../shared/types.js';

const DEFAULT_BG = '#000000';
const DEFAULT_BORDER = '#7c5cff';
const DEFAULT_TEXT = '#d1d5db';
const DEFAULT_ACCENT = '#c4b5fd';

/**
 * Right-hand panel editor for the global default visual style applied to
 * every overlay surface. Drives `OverlayDefaults` via `setOverlayDefaults`
 * with optimistic local state — the server pushes the canonical map back
 * over IPC, but updating locally first keeps sliders responsive.
 *
 * Pairs with `OverlayPreviewGrid` rendered below it.
 */
export function OverlayDefaultsEditor() {
  const [defaults, setDefaults] = useState<OverlayDefaults>({});

  useEffect(() => {
    let cancelled = false;
    void window.copilot.getOverlayDefaults().then((current) => {
      if (!cancelled) setDefaults(current);
    }).catch(() => undefined);
    const unsub = window.copilot.onOverlayDefaultsUpdate((next) => {
      if (!cancelled) setDefaults(next);
    });
    return () => { cancelled = true; unsub(); };
  }, []);

  function patch(next: OverlayDefaults) {
    setDefaults(next);
    void window.copilot.setOverlayDefaults(next).catch(() => undefined);
  }

  function update<K extends keyof OverlayDefaults>(key: K, value: OverlayDefaults[K] | undefined) {
    const next = { ...defaults };
    if (value === undefined) delete next[key];
    else next[key] = value;
    patch(next);
  }

  function reset() {
    patch({});
  }

  const bgColor = defaults.backgroundColor ?? DEFAULT_BG;
  const bgOpacity = defaults.backgroundOpacity ?? 0;
  const borderRadius = defaults.borderRadius ?? 4;
  const borderColor = defaults.borderColor ?? DEFAULT_BORDER;
  const borderWidth = defaults.borderWidth ?? 0;
  const fontKey = defaults.fontFamily ?? 'system';
  const fontColor = defaults.fontColor ?? DEFAULT_TEXT;
  const fontSize = defaults.fontSize ?? 14;
  const accentColor = defaults.accentColor ?? DEFAULT_ACCENT;

  return (
    <section className="rounded-lg border border-gray-700 bg-gray-800/40 p-4 space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">Visual padrão</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Aplica a todos os overlays. O botão "Personalizar" de cada overlay sobrescreve estes valores quando preciso.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-violet-300 hover:text-violet-200 shrink-0"
        >
          Restaurar padrão
        </button>
      </header>

      <Group title="Fundo">
        <ColorField
          label="Cor"
          value={bgColor}
          onChange={(next) => update('backgroundColor', next)}
        />
        <SliderField
          label="Opacidade"
          value={bgOpacity}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(next) => update('backgroundOpacity', next)}
        />
      </Group>

      <Group title="Borda">
        <SliderField
          label="Arredondamento"
          value={borderRadius}
          min={0}
          max={32}
          step={1}
          format={(v) => `${v}px`}
          onChange={(next) => update('borderRadius', next)}
        />
        <ColorField
          label="Cor"
          value={borderColor}
          onChange={(next) => update('borderColor', next)}
        />
        <SliderField
          label="Espessura"
          value={borderWidth}
          min={0}
          max={6}
          step={1}
          format={(v) => `${v}px`}
          onChange={(next) => update('borderWidth', next)}
        />
      </Group>

      <Group title="Fonte">
        <SelectField
          label="Família"
          value={fontKey}
          options={OVERLAY_FONTS.map((entry) => ({ value: entry.key, label: entry.label }))}
          onChange={(next) => update('fontFamily', next)}
        />
        <ColorField
          label="Cor"
          value={fontColor}
          onChange={(next) => update('fontColor', next)}
        />
        <SliderField
          label="Tamanho"
          value={fontSize}
          min={10}
          max={28}
          step={1}
          format={(v) => `${v}px`}
          onChange={(next) => update('fontSize', next)}
        />
      </Group>

      <Group title="Cor de destaque">
        <ColorField
          label="Accent"
          value={accentColor}
          onChange={(next) => update('accentColor', next)}
        />
        <p className="text-xs text-gray-500">
          Usada em nome de comando no chat, tag "AO VIVO" do sorteio, tag "ENQUETE" e título do player de música.
        </p>
      </Group>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">{title}</h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm text-gray-300">{label}</label>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 font-mono">{value.toUpperCase()}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 rounded border border-gray-600 bg-transparent cursor-pointer"
        />
      </div>
    </div>
  );
}

function SliderField({
  label, value, min, max, step, format, onChange,
}: {
  label: string;
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
        <label className="text-sm text-gray-300">{label}</label>
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

function SelectField({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm text-gray-300">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-700 border border-gray-600 rounded text-sm text-gray-200 px-2 py-1 focus:outline-none focus:border-violet-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
