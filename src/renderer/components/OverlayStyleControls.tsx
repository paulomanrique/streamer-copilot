import type { ReactNode } from 'react';

/**
 * Shared primitives for the visual-style editor — used by the global
 * defaults builder and the per-overlay override builder. Two consumers,
 * one set of widgets, so the look stays consistent and the override
 * "Usar padrão" toggle composes uniformly.
 */

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">{title}</h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
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

export function SliderField({
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

export function SelectField({
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

/**
 * Wraps a control in the per-overlay override UI: a small "padrão" checkbox
 * lives in the top-right corner, and toggling it signals the consumer to
 * delete the field from the OverlayPreferences slot (= inherit from the
 * global OverlayDefaults). The inner control keeps rendering its own label,
 * so there's no double-label visual; when inherited the inner control dims
 * and stops accepting input.
 *
 * Only used by the per-overlay builder mode — the global-defaults builder
 * renders controls bare without this wrapper.
 */
export function OverrideField({
  active, onToggleActive, children,
}: {
  active: boolean;
  onToggleActive: (active: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <label className="absolute -top-1 right-0 flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer select-none z-10">
        <input
          type="checkbox"
          checked={!active}
          onChange={(e) => onToggleActive(!e.target.checked)}
          className="accent-violet-500 w-3 h-3"
        />
        padrão
      </label>
      <div className={active ? '' : 'opacity-50 pointer-events-none'}>
        {children}
      </div>
    </div>
  );
}
