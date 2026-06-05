import { useEffect, useState } from 'react';

import { OVERLAY_FONTS } from '../../shared/constants.js';
import type { OverlayServerInfo } from '../../shared/ipc.js';
import type { OverlayDefaults, OverlayId, OverlayPreferences } from '../../shared/types.js';
import {
  ColorField, Group, OverrideField, SelectField, SliderField,
} from './OverlayStyleControls.js';

export type BuilderMode =
  | { kind: 'defaults' }
  | { kind: 'overlay'; id: OverlayId };

interface OverlayVisualBuilderProps {
  mode: BuilderMode;
  onBack: () => void;
  info: OverlayServerInfo | null;
}

const OVERLAY_OPTIONS: Array<{ id: OverlayId; label: string }> = [
  { id: 'chat-overlay', label: 'Chat — Overlay' },
  { id: 'chat-dock', label: 'Chat — Dock' },
  { id: 'now-playing', label: 'Now playing' },
  { id: 'raffles', label: 'Sorteio' },
  { id: 'polls', label: 'Enquete' },
];

const DEFAULT_VALUES = {
  backgroundColor: '#000000',
  backgroundOpacity: 0,
  borderRadius: 4,
  borderColor: '#7c5cff',
  borderWidth: 0,
  fontFamily: 'system',
  fontColor: '#d1d5db',
  fontSize: 14,
  accentColor: '#c4b5fd',
} as const;

type StyleField = keyof typeof DEFAULT_VALUES;

function urlFor(info: OverlayServerInfo | null, id: OverlayId): string | null {
  if (!info) return null;
  switch (id) {
    case 'chat-overlay': return info.urls.chat;
    case 'chat-dock': return info.urls.chatDock;
    case 'now-playing': return info.urls.nowPlaying;
    case 'raffles': return info.urls.raffles;
    case 'polls': return info.urls.polls;
  }
}

function withPreviewFlag(url: string | null): string | null {
  if (!url) return null;
  return url.includes('?') ? `${url}&preview=1` : `${url}?preview=1`;
}

/**
 * Full-page editor for the visual style of overlays. Two modes:
 *  - `defaults`: edits the global OverlayDefaults blob (applied to every overlay)
 *  - `overlay`: edits a per-overlay override slot in OverlayPreferences[id],
 *    with a per-field "padrão" toggle that deletes the field back to inherit
 *
 * Layout is controls-on-left + live preview iframe on right; the preview has
 * a dropdown to switch which overlay it shows so the streamer can spot-check
 * the same defaults across surfaces.
 */
export function OverlayVisualBuilder({ mode, onBack, info }: OverlayVisualBuilderProps) {
  const [defaults, setDefaults] = useState<OverlayDefaults>({});
  const [prefs, setPrefs] = useState<OverlayPreferences>({});
  const [previewId, setPreviewId] = useState<OverlayId>(
    mode.kind === 'overlay' ? mode.id : 'chat-overlay',
  );

  // Hydrate + subscribe to live pushes from main (echoes back our own changes
  // and reflects edits made by other windows).
  useEffect(() => {
    let cancelled = false;
    if (mode.kind === 'defaults') {
      void window.copilot.getOverlayDefaults().then((current) => {
        if (!cancelled) setDefaults(current);
      }).catch(() => undefined);
      const unsub = window.copilot.onOverlayDefaultsUpdate((next) => {
        if (!cancelled) setDefaults(next);
      });
      return () => { cancelled = true; unsub(); };
    }
    const id = mode.id;
    void window.copilot.getOverlayPreferences().then((map) => {
      if (!cancelled) setPrefs(map[id] ?? {});
    }).catch(() => undefined);
    const unsub = window.copilot.onOverlayPreferencesUpdate((next) => {
      if (!cancelled) setPrefs(next[id] ?? {});
    });
    return () => { cancelled = true; unsub(); };
  }, [mode]);

  const isDefaults = mode.kind === 'defaults';
  // Effective slot we're editing — OverlayPreferences is a superset of
  // OverlayDefaults so it's safe to type the shared view as Preferences.
  const source: OverlayPreferences = isDefaults ? defaults : prefs;

  function persistDefaults(next: OverlayDefaults) {
    setDefaults(next);
    void window.copilot.setOverlayDefaults(next).catch(() => undefined);
  }

  function persistPrefs(next: OverlayPreferences) {
    if (mode.kind !== 'overlay') return;
    setPrefs(next);
    void window.copilot.setOverlayPreferences({ id: mode.id, prefs: next }).catch(() => undefined);
  }

  function setField<K extends StyleField>(key: K, value: OverlayPreferences[K] | undefined) {
    if (isDefaults) {
      const next: OverlayDefaults = { ...defaults };
      if (value === undefined) delete next[key];
      else (next[key] as OverlayPreferences[K]) = value;
      persistDefaults(next);
    } else {
      const next: OverlayPreferences = { ...prefs };
      if (value === undefined) delete next[key];
      else (next[key] as OverlayPreferences[K]) = value;
      // backgroundOpacity replaces the legacy `opacity` alias — clear it
      // whenever we touch the canonical field so old profiles don't ghost.
      if (key === 'backgroundOpacity') delete next.opacity;
      persistPrefs(next);
    }
  }

  function clearOverrideField(key: StyleField) {
    if (isDefaults) return; // no-op in defaults mode — there's nothing to inherit from
    const next: OverlayPreferences = { ...prefs };
    delete next[key];
    if (key === 'backgroundOpacity') delete next.opacity;
    persistPrefs(next);
  }

  function reset() {
    if (isDefaults) persistDefaults({});
    else persistPrefs({});
  }

  const fields = {
    backgroundColor: source.backgroundColor ?? DEFAULT_VALUES.backgroundColor,
    backgroundOpacity: source.backgroundOpacity ?? source.opacity ?? DEFAULT_VALUES.backgroundOpacity,
    borderRadius: source.borderRadius ?? DEFAULT_VALUES.borderRadius,
    borderColor: source.borderColor ?? DEFAULT_VALUES.borderColor,
    borderWidth: source.borderWidth ?? DEFAULT_VALUES.borderWidth,
    fontFamily: source.fontFamily ?? DEFAULT_VALUES.fontFamily,
    fontColor: source.fontColor ?? DEFAULT_VALUES.fontColor,
    fontSize: source.fontSize ?? DEFAULT_VALUES.fontSize,
    accentColor: source.accentColor ?? DEFAULT_VALUES.accentColor,
  };

  function isFieldActive(key: StyleField): boolean {
    if (key === 'backgroundOpacity') {
      return source.backgroundOpacity !== undefined || source.opacity !== undefined;
    }
    return source[key] !== undefined;
  }

  // In overlay mode, wrap each control so the streamer can flip it back to
  // "inherit from defaults" without losing the rest of the overrides. In
  // defaults mode, controls render bare — every field is always set.
  function wrap(key: StyleField, control: React.ReactNode) {
    if (isDefaults) return control;
    return (
      <OverrideField
        active={isFieldActive(key)}
        onToggleActive={(next) => {
          if (next) setField(key, DEFAULT_VALUES[key] as OverlayPreferences[typeof key]);
          else clearOverrideField(key);
        }}
      >
        {control}
      </OverrideField>
    );
  }

  const overlayLabel = mode.kind === 'overlay'
    ? OVERLAY_OPTIONS.find((o) => o.id === mode.id)?.label ?? ''
    : '';
  const headerTitle = isDefaults ? 'Editar visual padrão' : `Personalizar — ${overlayLabel}`;
  const iframeUrl = withPreviewFlag(urlFor(info, previewId));

  return (
    <div className="min-h-full p-6">
      <header className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-violet-300 hover:text-violet-200"
        >
          ← Voltar
        </button>
        <h2 className="text-base font-semibold">{headerTitle}</h2>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
        <section className="rounded-lg border border-gray-700 bg-gray-800/40 p-4 space-y-5">
          <p className="text-xs text-gray-500">
            {isDefaults
              ? 'Os valores aqui valem como padrão para todos os overlays. Cada overlay pode sobrescrever pelo botão "Personalizar".'
              : 'Cada ajuste aqui sobrescreve o visual padrão só para este overlay. Marque "padrão" para voltar a herdar.'}
          </p>

          <Group title="Fundo">
            {wrap('backgroundColor', (
              <ColorField label="Cor" value={fields.backgroundColor} onChange={(v) => setField('backgroundColor', v)} />
            ))}
            {wrap('backgroundOpacity', (
              <SliderField
                label="Opacidade"
                value={fields.backgroundOpacity}
                min={0} max={1} step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setField('backgroundOpacity', v)}
              />
            ))}
          </Group>

          <Group title="Borda">
            {wrap('borderRadius', (
              <SliderField
                label="Arredondamento"
                value={fields.borderRadius}
                min={0} max={32} step={1}
                format={(v) => `${v}px`}
                onChange={(v) => setField('borderRadius', v)}
              />
            ))}
            {wrap('borderColor', (
              <ColorField label="Cor" value={fields.borderColor} onChange={(v) => setField('borderColor', v)} />
            ))}
            {wrap('borderWidth', (
              <SliderField
                label="Espessura"
                value={fields.borderWidth}
                min={0} max={6} step={1}
                format={(v) => `${v}px`}
                onChange={(v) => setField('borderWidth', v)}
              />
            ))}
          </Group>

          <Group title="Fonte">
            {wrap('fontFamily', (
              <SelectField
                label="Família"
                value={fields.fontFamily}
                options={OVERLAY_FONTS.map((f) => ({ value: f.key, label: f.label }))}
                onChange={(v) => setField('fontFamily', v)}
              />
            ))}
            {wrap('fontColor', (
              <ColorField label="Cor" value={fields.fontColor} onChange={(v) => setField('fontColor', v)} />
            ))}
            {wrap('fontSize', (
              <SliderField
                label="Tamanho"
                value={fields.fontSize}
                min={10} max={28} step={1}
                format={(v) => `${v}px`}
                onChange={(v) => setField('fontSize', v)}
              />
            ))}
          </Group>

          <Group title="Cor de destaque">
            {wrap('accentColor', (
              <ColorField label="Accent" value={fields.accentColor} onChange={(v) => setField('accentColor', v)} />
            ))}
            <p className="text-xs text-gray-500">
              Tinge: nome de comando no chat, tag "AO VIVO" + ponteiro + hub + glow do vencedor no sorteio, tag "ENQUETE", título do player de música e barras do analisador de espectro.
            </p>
          </Group>

          <div className="pt-2 border-t border-gray-700">
            <button
              type="button"
              onClick={reset}
              className="text-xs text-violet-300 hover:text-violet-200"
            >
              {isDefaults ? 'Restaurar visual padrão' : 'Voltar a herdar tudo do padrão'}
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-gray-700 bg-gray-800/40 p-4 flex flex-col gap-3 min-h-[600px]">
          <header className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-100">Preview ao vivo</h3>
            <select
              value={previewId}
              onChange={(e) => setPreviewId(e.target.value as OverlayId)}
              className="bg-gray-700 border border-gray-600 rounded text-sm text-gray-200 px-2 py-1 focus:outline-none focus:border-violet-500"
            >
              {OVERLAY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </header>
          <div className="relative bg-black/60 rounded-md border border-gray-700 overflow-hidden flex-1">
            {iframeUrl ? (
              <iframe
                key={previewId}
                src={iframeUrl}
                title={`Preview ${previewId}`}
                className="absolute inset-0 w-full h-full pointer-events-none"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                Servidor de overlay não está rodando
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
