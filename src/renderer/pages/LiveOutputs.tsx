import { useEffect, useMemo, useState } from 'react';

import type {
  LiveOutputConfig,
  LiveOutputControlAction,
  LiveOutputFeatureDescriptor,
  LiveOutputHotkeyAction,
  LiveOutputHotkeyBinding,
  LiveOutputKind,
} from '../../shared/types.js';
import {
  ArtifactsPanel,
  CommonConfigEditor,
  DestinationEditor,
  EditorSection,
  INPUT_CLASS,
  LiveOutputCard,
  PreviewPanel,
  RuntimeControls,
} from '../live-outputs/components.js';
import { getLiveOutputsCopy, type FeatureCategory } from '../live-outputs/copy.js';
import { createDefaultLiveOutput, findOutputByKind } from '../live-outputs/defaults.js';
import '../live-outputs/register-all.js';
import { getLiveOutputFeature, listLiveOutputFeatures } from '../live-outputs/registry.js';
import { useLiveOutputs } from '../live-outputs/useLiveOutputs.js';
import { useI18n } from '../i18n/I18nProvider.js';

const CATEGORY_ORDER: FeatureCategory[] = ['clock', 'timers', 'content', 'telemetry', 'media'];

function formatUpdatedAt(value: string | null | undefined, language: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}

function LoadingState() {
  return (
    <div aria-label="Loading" className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-44 animate-pulse rounded-xl border border-gray-800 bg-gray-900/60" />)}
    </div>
  );
}

const HOTKEY_ACTIONS: LiveOutputHotkeyAction[] = [
  'chrono-down.toggle', 'chrono-down.stop', 'chrono-down.increment', 'chrono-down.decrement',
  'chrono-up.toggle', 'chrono-up.stop', 'chrono-up.increment', 'chrono-up.decrement',
];

function HotkeysPanel({ settings, busy, onSave }: {
  settings: { hotkeysEnabled: boolean; hotkeys: LiveOutputHotkeyBinding[] };
  busy: boolean;
  onSave: (enabled: boolean, bindings: LiveOutputHotkeyBinding[]) => Promise<boolean>;
}) {
  const { language } = useI18n();
  const copy = getLiveOutputsCopy(language);
  const [enabled, setEnabled] = useState(settings.hotkeysEnabled);
  const [bindings, setBindings] = useState<LiveOutputHotkeyBinding[]>(settings.hotkeys);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setEnabled(settings.hotkeysEnabled);
    setBindings(settings.hotkeys);
  }, [settings]);
  const valueFor = (action: LiveOutputHotkeyAction) => bindings.find((item) => item.action === action)?.accelerator ?? '';
  const setValue = (action: LiveOutputHotkeyAction, accelerator: string) => {
    setBindings((current) => [
      ...current.filter((item) => item.action !== action),
      { action, accelerator: accelerator.trim() || null },
    ]);
  };
  return (
    <details className="rounded-xl border border-gray-800 bg-gray-900/55 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-gray-200">{copy.globalShortcuts}</summary>
      <div className="mt-4 space-y-4">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> {copy.enableGlobalShortcuts}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {HOTKEY_ACTIONS.map((action) => (
            <label key={action} className="block">
              <span data-no-i18n="true" className="mb-1 block text-xs text-gray-400">{action}</span>
              <input data-no-i18n="true" className={INPUT_CLASS} disabled={!enabled} placeholder="CommandOrControl+Shift+1" value={valueFor(action)} onChange={(event) => setValue(action, event.target.value)} />
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave(enabled, bindings).then(setSaved)}
          className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium hover:bg-violet-500 disabled:opacity-50"
        >
          {saved ? copy.saved : copy.save}
        </button>
      </div>
    </details>
  );
}

export function LiveOutputsPage() {
  const { language } = useI18n();
  const copy = getLiveOutputsCopy(language);
  const controller = useLiveOutputs();
  const [search, setSearch] = useState('');
  const [selectedKind, setSelectedKind] = useState<LiveOutputKind | null>(null);
  const [draft, setDraft] = useState<LiveOutputConfig | null>(null);
  const [baseline, setBaseline] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const descriptorsByKind = useMemo(() => new Map(controller.catalog.map((item) => [item.kind, item])), [controller.catalog]);
  const visibleFeatures = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(language);
    return listLiveOutputFeatures().filter((feature) => {
      if (!descriptorsByKind.has(feature.kind)) return false;
      const text = `${copy.features[feature.kind].label} ${copy.features[feature.kind].description}`.toLocaleLowerCase(language);
      return !query || text.includes(query);
    });
  }, [copy, descriptorsByKind, language, search]);

  const openFeature = (descriptor: LiveOutputFeatureDescriptor) => {
    const existing = controller.snapshot ? findOutputByKind(controller.snapshot.settings.outputs, descriptor.kind) : null;
    const next = existing ?? createDefaultLiveOutput(descriptor, controller.platformCapabilities);
    if (!next) {
      setNotice(language === 'pt-BR' ? 'Conecte uma plataforma compatível antes de configurar esta saída.' : 'Connect a compatible platform before configuring this output.');
      return;
    }
    const cloned = structuredClone(next);
    setSelectedKind(descriptor.kind);
    setDraft(cloned);
    setBaseline(JSON.stringify(cloned));
    setNotice(null);
  };

  const dirty = draft ? JSON.stringify(draft) !== baseline : false;
  const closeEditor = () => {
    if (dirty && !window.confirm(copy.confirmDiscard)) return;
    setSelectedKind(null);
    setDraft(null);
    setBaseline('');
  };

  const descriptor = selectedKind ? descriptorsByKind.get(selectedKind) ?? null : null;
  const rendererFeature = selectedKind ? getLiveOutputFeature(selectedKind) : null;
  const runtime = draft && controller.snapshot ? controller.snapshot.outputs[draft.id] ?? null : null;

  const saveDraft = async () => {
    if (!draft) return;
    if (await controller.save(draft)) {
      setBaseline(JSON.stringify(draft));
      setNotice(language === 'pt-BR' ? 'Saída salva.' : 'Output saved.');
    }
  };

  const updateDraft = (next: LiveOutputConfig) => setDraft(next);
  const pickSound = async () => {
    if (!draft || (draft.kind !== 'countdown' && draft.kind !== 'chrono-down')) return;
    const soundPath = await controller.pickSound(draft.id);
    if (soundPath) setDraft({ ...draft, soundPath, playSound: true });
  };
  const control = (action: LiveOutputControlAction, amountSeconds?: number) => {
    if (!draft) return;
    void controller.control({ id: draft.id, action, amountSeconds });
  };

  if (controller.loading) {
    return <main className="mx-auto min-h-full max-w-6xl p-4 sm:p-6"><LoadingState /></main>;
  }

  if (controller.error && !controller.snapshot) {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <div role="alert" className="max-w-md rounded-xl border border-rose-800/60 bg-rose-950/30 p-5 text-center">
          <h2 className="font-semibold text-rose-100">{copy.title}</h2>
          <p data-no-i18n="true" className="mt-2 text-sm text-rose-300">{controller.error}</p>
          <button type="button" onClick={() => void controller.reload()} className="mt-4 rounded-lg bg-rose-700 px-3 py-2 text-sm hover:bg-rose-600">{copy.retry}</button>
        </div>
      </main>
    );
  }

  if (draft && descriptor && rendererFeature) {
    const FeatureEditor = rendererFeature.Editor;
    return (
      <main className="min-h-full">
        <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={closeEditor} className="rounded-lg border border-gray-800 px-2.5 py-2 text-sm text-gray-400 hover:text-white" aria-label={copy.back}>←</button>
              <div className="min-w-0">
                <p className="truncate text-xs text-gray-500">{copy.title} / {copy.categories[rendererFeature.category]}</p>
                <h2 className="truncate text-base font-semibold text-gray-100">{copy.features[draft.kind].label}</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {dirty ? <span role="status" className="hidden text-xs text-amber-300 sm:inline">{copy.unsaved}</span> : null}
              <button type="button" disabled={!dirty || controller.busy} onClick={() => { setDraft(JSON.parse(baseline) as LiveOutputConfig); }} className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 disabled:opacity-40">{copy.discard}</button>
              <button type="button" disabled={!dirty || controller.busy} onClick={() => void saveDraft()} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-40">{controller.busy ? copy.saving : copy.save}</button>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-7xl gap-5 p-4 sm:p-6 min-[1220px]:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0 space-y-5">
            {(controller.error || notice) ? <p role="alert" data-no-i18n="true" className="rounded-lg border border-rose-800/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{controller.error ?? notice}</p> : null}
            {runtime?.errors.map((error) => <p key={`${error.code}-${error.field ?? ''}`} role="alert" data-no-i18n="true" className="rounded-lg border border-orange-800/50 bg-orange-950/30 px-4 py-3 text-sm text-orange-200">{error.message}</p>)}
            <CommonConfigEditor config={draft} copy={copy} onChange={updateDraft} />
            <FeatureEditor
              config={draft}
              descriptor={descriptor}
              runtime={runtime}
              playingNowSources={controller.sources}
              platformCapabilities={controller.platformCapabilities}
              onChange={updateDraft}
              onPickSound={pickSound}
              onTestPlayingNowSource={controller.testSource}
            />
            <DestinationEditor destinations={draft.destinations} copy={copy} onChange={(destinations) => setDraft({ ...draft, destinations })} />
          </div>
          <aside className="space-y-5 min-[1220px]:sticky min-[1220px]:top-24 min-[1220px]:self-start">
            <PreviewPanel runtime={runtime} style={draft.destinations.browser.style} copy={copy} />
            <RuntimeControls descriptor={descriptor} runtime={runtime} busy={controller.busy} copy={copy} onControl={control} adjustmentSeconds={(draft.kind === 'chrono-down' || draft.kind === 'chrono-up') ? draft.adjustmentMinutes * 60 : 60} />
            <ArtifactsPanel runtime={runtime} copy={copy} onReveal={(artifact) => void controller.reveal(draft.id, artifact)} />
            <EditorSection title={copy.health}>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-gray-500">{copy.lastUpdate}</dt><dd className="mt-1 text-gray-200">{formatUpdatedAt(runtime?.updatedAt, language)}</dd></div>
                <div><dt className="text-gray-500">{copy.browserClients}</dt><dd className="mt-1 text-gray-200">{runtime?.browserClients ?? 0}</dd></div>
              </dl>
              <button type="button" disabled={controller.busy} onClick={() => void controller.regenerate(draft.id)} className="text-xs text-violet-300 hover:text-violet-200 disabled:opacity-50">{copy.regenerate}</button>
            </EditorSection>
          </aside>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-full max-w-6xl p-4 sm:p-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">{copy.title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">{copy.description}</p>
        </div>
        <label className="relative block w-full sm:w-64">
          <span className="sr-only">{copy.searchPlaceholder}</span>
          <input className={INPUT_CLASS} type="search" value={search} placeholder={copy.searchPlaceholder} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </header>

      {(controller.error || notice) ? <p role="alert" data-no-i18n="true" className="mt-5 rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">{controller.error ?? notice}</p> : null}

      <div className="mt-6 space-y-7">
        {CATEGORY_ORDER.map((category) => {
          const features = visibleFeatures.filter((feature) => feature.category === category);
          if (features.length === 0) return null;
          return (
            <section key={category} aria-labelledby={`live-output-${category}`}>
              <h3 id={`live-output-${category}`} className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{copy.categories[category]}</h3>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {features.map((feature) => {
                  const descriptor = descriptorsByKind.get(feature.kind)!;
                  const config = controller.snapshot ? findOutputByKind(controller.snapshot.settings.outputs, feature.kind) : null;
                  const runtime = config && controller.snapshot ? controller.snapshot.outputs[config.id] ?? null : null;
                  return (
                    <LiveOutputCard
                      key={feature.kind}
                      icon={feature.icon}
                      label={copy.features[feature.kind].label}
                      description={copy.features[feature.kind].description}
                      runtime={runtime}
                      configured={Boolean(config)}
                      copy={copy}
                      onOpen={() => openFeature(descriptor)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
        {visibleFeatures.length === 0 ? <p role="status" className="rounded-xl border border-dashed border-gray-800 p-8 text-center text-sm text-gray-500">{copy.emptySearch}</p> : null}
        {controller.snapshot ? <HotkeysPanel settings={controller.snapshot.settings} busy={controller.busy} onSave={controller.saveHotkeys} /> : null}
      </div>
    </main>
  );
}
