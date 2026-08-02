import { useState, type ReactNode } from 'react';

import type {
  LiveOutputConfig,
  LiveOutputControlAction,
  LiveOutputDestinationConfig,
  LiveOutputFeatureDescriptor,
  LiveOutputRuntimeSnapshot,
  LiveOutputRuntimeStatus,
  OverlayVisualStyle,
} from '../../shared/types.js';
import { OVERLAY_FONTS } from '../../shared/constants.js';
import { ToggleSwitch } from '../components/ToggleSwitch.js';
import type { getLiveOutputsCopy } from './copy.js';

type Copy = ReturnType<typeof getLiveOutputsCopy>;

export const INPUT_CLASS = 'w-full rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50';

export function EditorSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/55 p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-300">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] leading-4 text-gray-500">{hint}</span> : null}
    </label>
  );
}

export function CheckRow({ label, description, checked, onChange, disabled = false }: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={['flex items-start justify-between gap-4', disabled ? 'opacity-50' : ''].join(' ')}>
      <div>
        <p className="text-sm text-gray-200">{label}</p>
        {description ? <p className="mt-0.5 text-xs leading-5 text-gray-500">{description}</p> : null}
      </div>
      <div className={disabled ? 'pointer-events-none' : ''}>
        <ToggleSwitch checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<LiveOutputRuntimeStatus, string> = {
  disabled: 'border-gray-700 bg-gray-800 text-gray-400',
  ready: 'border-sky-700/60 bg-sky-950/50 text-sky-300',
  running: 'border-emerald-700/60 bg-emerald-950/50 text-emerald-300',
  paused: 'border-amber-700/60 bg-amber-950/50 text-amber-300',
  completed: 'border-violet-700/60 bg-violet-950/50 text-violet-300',
  degraded: 'border-orange-700/60 bg-orange-950/50 text-orange-300',
  error: 'border-rose-700/60 bg-rose-950/50 text-rose-300',
};

export function StatusBadge({ status, copy }: { status: LiveOutputRuntimeStatus; copy: Copy }) {
  return (
    <span className={['inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', STATUS_STYLE[status]].join(' ')}>
      {copy.statuses[status]}
    </span>
  );
}

export function LiveOutputCard({
  icon, label, description, runtime, configured, copy, onOpen,
}: {
  icon: string;
  label: string;
  description: string;
  runtime: LiveOutputRuntimeSnapshot | null;
  configured: boolean;
  copy: Copy;
  onOpen: () => void;
}) {
  const status = runtime?.status ?? 'disabled';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group min-h-44 rounded-xl border border-gray-800 bg-gray-900/55 p-4 text-left transition hover:border-violet-700/70 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
    >
      <div className="flex items-start justify-between gap-4">
        <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-xl">{icon}</span>
        {configured ? <StatusBadge status={status} copy={copy} /> : <span className="text-[11px] text-gray-500">{copy.notConfigured}</span>}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-gray-100 group-hover:text-white">{label}</h3>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{description}</p>
      <p data-no-i18n="true" className="mt-3 min-h-5 truncate font-mono text-xs text-violet-200">
        {runtime?.renderedText || copy.noOutput}
      </p>
    </button>
  );
}

export function TokenPicker({ descriptor, value, onChange, copy }: {
  descriptor: LiveOutputFeatureDescriptor;
  value: string;
  onChange: (next: string) => void;
  copy: Copy;
}) {
  if (descriptor.tokens.length === 0) return <p className="text-xs text-gray-500">{copy.noTokens}</p>;
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-gray-400">{copy.tokens}</p>
      <div className="flex flex-wrap gap-2">
        {descriptor.tokens.map((token) => (
          <button
            key={token.token}
            type="button"
            title={`${token.description} · ${token.example}`}
            onClick={() => onChange(`${value}${token.token}`)}
            className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 font-mono text-xs text-violet-200 hover:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {token.token}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RuntimeControls({ descriptor, runtime, busy, copy, onControl, adjustmentSeconds = 60 }: {
  descriptor: LiveOutputFeatureDescriptor;
  runtime: LiveOutputRuntimeSnapshot | null;
  busy: boolean;
  copy: Copy;
  onControl: (action: LiveOutputControlAction, amountSeconds?: number) => void;
  adjustmentSeconds?: number;
}) {
  const controls = descriptor.controls.filter((action) => {
    if (action === 'adjust') return false;
    if (action === 'start' && runtime?.status === 'running') return false;
    if (action === 'pause' && runtime?.status !== 'running') return false;
    if (action === 'resume' && runtime?.status !== 'paused') return false;
    return true;
  });
  if (controls.length === 0) return null;
  return (
    <EditorSection title={copy.runtime}>
      <div className="flex flex-wrap gap-2">
        {controls.map((action) => (
          <button
            key={action}
            type="button"
            disabled={busy}
            onClick={() => onControl(action, action === 'adjust' ? adjustmentSeconds : undefined)}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-medium text-gray-200 hover:border-violet-600 hover:text-white disabled:opacity-50"
          >
            {copy.actions[action] ?? action}
          </button>
        ))}
        {descriptor.controls.includes('adjust') ? (
          <>
            <button type="button" disabled={busy} onClick={() => onControl('adjust', -adjustmentSeconds)} className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-medium text-gray-200 hover:border-violet-600 disabled:opacity-50">− {copy.actions.decrement}</button>
            <button type="button" disabled={busy} onClick={() => onControl('adjust', adjustmentSeconds)} className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-medium text-gray-200 hover:border-violet-600 disabled:opacity-50">+ {copy.actions.increment}</button>
          </>
        ) : null}
      </div>
    </EditorSection>
  );
}

function updateStyle(destinations: LiveOutputDestinationConfig, patch: Partial<OverlayVisualStyle>): LiveOutputDestinationConfig {
  return { ...destinations, browser: { ...destinations.browser, style: { ...destinations.browser.style, ...patch } } };
}

export function DestinationEditor({ destinations, copy, onChange }: {
  destinations: LiveOutputDestinationConfig;
  copy: Copy;
  onChange: (next: LiveOutputDestinationConfig) => void;
}) {
  const style = destinations.browser.style;
  return (
    <>
      <EditorSection title={copy.destinations}>
        <CheckRow
          label={copy.outputFile}
          checked={destinations.file.enabled}
          onChange={(enabled) => onChange({ ...destinations, file: { ...destinations.file, enabled } })}
        />
        <Field label={copy.fields.filePath}>
          <input
            className={INPUT_CLASS}
            value={destinations.file.relativePath}
            disabled={!destinations.file.enabled}
            onChange={(event) => onChange({ ...destinations, file: { ...destinations.file, relativePath: event.target.value } })}
          />
        </Field>
        <CheckRow
          label={copy.fields.browserEnabled}
          checked={destinations.browser.enabled}
          onChange={(enabled) => onChange({ ...destinations, browser: { ...destinations.browser, enabled } })}
        />
      </EditorSection>
      {destinations.browser.enabled ? (
        <EditorSection title={copy.appearance}>
          <div className="grid gap-4 sm:grid-cols-3">
            <ColorInput label={copy.fields.background} value={style.backgroundColor ?? '#111827'} onChange={(backgroundColor) => onChange(updateStyle(destinations, { backgroundColor }))} />
            <ColorInput label={copy.fields.textColor} value={style.fontColor ?? '#f9fafb'} onChange={(fontColor) => onChange(updateStyle(destinations, { fontColor }))} />
            <ColorInput label={copy.fields.accent} value={style.accentColor ?? '#8b5cf6'} onChange={(accentColor) => onChange(updateStyle(destinations, { accentColor }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberInput label={copy.fields.opacity} min={0} max={1} step={0.05} value={style.backgroundOpacity ?? 0.72} onChange={(backgroundOpacity) => onChange(updateStyle(destinations, { backgroundOpacity }))} />
            <NumberInput label={copy.fields.fontSize} min={8} max={48} value={style.fontSize ?? 24} onChange={(fontSize) => onChange(updateStyle(destinations, { fontSize }))} />
            <NumberInput label={copy.fields.radius} min={0} max={48} value={style.borderRadius ?? 12} onChange={(borderRadius) => onChange(updateStyle(destinations, { borderRadius }))} />
          </div>
          <Field label={copy.font}>
            <select className={INPUT_CLASS} value={style.fontFamily ?? 'system'} onChange={(event) => onChange(updateStyle(destinations, { fontFamily: event.target.value }))}>
              {OVERLAY_FONTS.map((font) => <option key={font.key} value={font.key}>{font.label}</option>)}
            </select>
          </Field>
        </EditorSection>
      ) : null}
    </>
  );
}

export function PreviewPanel({ runtime, style, copy }: { runtime: LiveOutputRuntimeSnapshot | null; style?: OverlayVisualStyle; copy: Copy }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{copy.preview}</h3>
        <StatusBadge status={runtime?.status ?? 'disabled'} copy={copy} />
      </div>
      <div className="flex min-h-40 items-center justify-center bg-[radial-gradient(circle_at_center,_#273244_0,_#111827_45%,_#030712_100%)] p-6">
        <div
          data-no-i18n="true"
          style={{
            backgroundColor: style?.backgroundColor ?? '#111827',
            color: style?.fontColor ?? '#f9fafb',
            opacity: 1,
            borderRadius: style?.borderRadius ?? 12,
            borderColor: style?.borderColor ?? '#374151',
            borderWidth: style?.borderWidth ?? 1,
            fontSize: style?.fontSize ?? 24,
            background: `color-mix(in srgb, ${style?.backgroundColor ?? '#111827'} ${(style?.backgroundOpacity ?? 0.72) * 100}%, transparent)`,
          }}
          className="max-w-full whitespace-pre-wrap break-words border px-5 py-3 text-center shadow-2xl"
        >
          {runtime?.renderedText || copy.noOutput}
        </div>
      </div>
    </section>
  );
}

export function ArtifactsPanel({ runtime, copy, onReveal }: {
  runtime: LiveOutputRuntimeSnapshot | null;
  copy: Copy;
  onReveal: (artifactId?: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!runtime || runtime.artifacts.length === 0) return null;
  const copyUrl = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };
  return (
    <EditorSection title={copy.destinations}>
      {runtime.artifacts.map((artifact) => (
        <div key={artifact.id} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-200">{artifact.label}</p>
              <p data-no-i18n="true" className="mt-1 break-all font-mono text-[11px] text-gray-500">
                {artifact.browserUrl ?? artifact.relativePath ?? '—'}
              </p>
            </div>
            <div className="flex gap-2">
              {artifact.browserUrl ? (
                <button type="button" onClick={() => void copyUrl(artifact.id, artifact.browserUrl!)} className="text-xs text-violet-300 hover:text-violet-200">
                  {copied === artifact.id ? copy.copied : copy.copyUrl}
                </button>
              ) : null}
              {artifact.relativePath ? (
                <button type="button" onClick={() => onReveal(artifact.id)} className="text-xs text-violet-300 hover:text-violet-200">{copy.reveal}</button>
              ) : null}
            </div>
          </div>
          {artifact.error ? <p role="alert" className="mt-2 text-xs text-rose-300">{artifact.error.message}</p> : null}
        </div>
      ))}
    </EditorSection>
  );
}

export function CommonConfigEditor({ config, copy, onChange }: {
  config: LiveOutputConfig;
  copy: Copy;
  onChange: (next: LiveOutputConfig) => void;
}) {
  return (
    <EditorSection title="Status">
      <CheckRow label={copy.enabled} checked={config.enabled} onChange={(enabled) => onChange({ ...config, enabled })} />
      <CheckRow label={copy.startWithProfile} checked={config.startOnProfileLoad} onChange={(startOnProfileLoad) => onChange({ ...config, startOnProfileLoad })} />
    </EditorSection>
  );
}

export function NumberInput({ label, value, onChange, min, max, step = 1, hint }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input className={INPUT_CLASS} type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </Field>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex rounded-lg border border-gray-700 bg-gray-950/60 p-1">
        <input aria-label={label} className="h-8 w-10 cursor-pointer border-0 bg-transparent" type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <input data-no-i18n="true" className="min-w-0 flex-1 bg-transparent px-2 font-mono text-xs text-gray-300 outline-none" value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </Field>
  );
}
