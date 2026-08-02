import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  ChronoDownLiveOutputConfig,
  ChronoUpLiveOutputConfig,
  CountdownLiveOutputConfig,
  CredentialStatus,
  DateLiveOutputConfig,
  LiveOutputConfig,
  LiveOutputTextLine,
  PlatformCategory,
  PlatformLiveOutputConfig,
  PlatformStreamCapability,
  PlatformStreamMetadata,
  PlatformStreamMetadataPreset,
  PlayingNowLiveOutputConfig,
  SystemInfoLiveOutputConfig,
  TextRotatorLiveOutputConfig,
  TimeLiveOutputConfig,
} from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { CheckRow, EditorSection, Field, INPUT_CLASS, NumberInput, TokenPicker } from './components.js';
import { getLiveOutputsCopy } from './copy.js';
import type { LiveOutputEditorProps } from './registry.js';

function change<T extends LiveOutputConfig>(props: LiveOutputEditorProps, next: T): void {
  props.onChange(next);
}

function FormatField({ props, value, onChange, multiline = false }: {
  props: LiveOutputEditorProps;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const copy = getLiveOutputsCopy(useI18n().language);
  return (
    <EditorSection title={copy.format}>
      <Field label={copy.format}>
        {multiline ? (
          <textarea data-no-i18n="true" className={`${INPUT_CLASS} min-h-24 resize-y font-mono`} value={value} onChange={(event) => onChange(event.target.value)} />
        ) : (
          <input data-no-i18n="true" className={`${INPUT_CLASS} font-mono`} value={value} onChange={(event) => onChange(event.target.value)} />
        )}
      </Field>
      <TokenPicker descriptor={props.descriptor} value={value} onChange={onChange} copy={copy} />
    </EditorSection>
  );
}

function TimeZoneField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const copy = getLiveOutputsCopy(useI18n().language);
  return (
    <Field label={copy.fields.timezone}>
      <input
        data-no-i18n="true"
        className={INPUT_CLASS}
        value={value}
        placeholder={copy.fields.systemTimezone}
        onChange={(event) => onChange(event.target.value || 'system')}
      />
    </Field>
  );
}

function CompletionFields({ config, onChange, onPickSound }: {
  config: CountdownLiveOutputConfig | ChronoDownLiveOutputConfig;
  onChange: (next: typeof config) => void;
  onPickSound: () => Promise<void>;
}) {
  const copy = getLiveOutputsCopy(useI18n().language);
  return (
    <EditorSection title={copy.sound}>
      <Field label={copy.fields.doneText}>
        <input data-no-i18n="true" className={INPUT_CLASS} value={config.doneText} onChange={(event) => onChange({ ...config, doneText: event.target.value })} />
      </Field>
      <CheckRow label={copy.fields.playSound} checked={config.playSound} onChange={(playSound) => onChange({ ...config, playSound })} />
      {config.playSound ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void onPickSound()} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium hover:bg-violet-500">{copy.chooseSound}</button>
          {config.soundPath ? (
            <>
              <span data-no-i18n="true" className="max-w-xs truncate font-mono text-xs text-gray-400">{config.soundPath}</span>
              <button type="button" onClick={() => onChange({ ...config, soundPath: null })} className="text-xs text-rose-300 hover:text-rose-200">{copy.removeSound}</button>
            </>
          ) : null}
        </div>
      ) : null}
    </EditorSection>
  );
}

export function TimeEditor(props: LiveOutputEditorProps) {
  const config = props.config as TimeLiveOutputConfig;
  const copy = getLiveOutputsCopy(useI18n().language);
  return (
    <>
      <FormatField props={props} value={config.format} onChange={(format) => change(props, { ...config, format })} />
      <EditorSection title={copy.features.time.label}>
        <TimeZoneField value={config.timeZone} onChange={(timeZone) => change(props, { ...config, timeZone })} />
        <CheckRow label={copy.fields.use24Hour} checked={config.use24Hour} onChange={(use24Hour) => change(props, { ...config, use24Hour })} />
        <CheckRow label={copy.fields.removeLeadingZero} checked={config.removeLeadingHourZero} onChange={(removeLeadingHourZero) => change(props, { ...config, removeLeadingHourZero })} />
      </EditorSection>
    </>
  );
}

export function DateEditor(props: LiveOutputEditorProps) {
  const config = props.config as DateLiveOutputConfig;
  const copy = getLiveOutputsCopy(useI18n().language);
  return (
    <>
      <EditorSection title={copy.format}>
        <Field label={copy.fields.dateTemplate}>
          <input data-no-i18n="true" className={`${INPUT_CLASS} font-mono`} value={config.template} onChange={(event) => change(props, { ...config, template: event.target.value })} />
        </Field>
        <Field label={copy.fields.dateFormat}>
          <input data-no-i18n="true" className={`${INPUT_CLASS} font-mono`} value={config.dateFormat} onChange={(event) => change(props, { ...config, dateFormat: event.target.value })} />
        </Field>
        <TokenPicker descriptor={props.descriptor} value={config.template} onChange={(template) => change(props, { ...config, template })} copy={copy} />
      </EditorSection>
      <EditorSection title={copy.features.date.label}>
        <Field label={copy.fields.locale}>
          <select className={INPUT_CLASS} value={config.locale} onChange={(event) => change(props, { ...config, locale: event.target.value as DateLiveOutputConfig['locale'] })}>
            <option value="system">{copy.fields.systemLocale}</option><option value="pt-BR">Português</option><option value="en-US">English</option>
          </select>
        </Field>
        <TimeZoneField value={config.timeZone} onChange={(timeZone) => change(props, { ...config, timeZone })} />
      </EditorSection>
    </>
  );
}

function isoToLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function localToIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function CountdownEditor(props: LiveOutputEditorProps) {
  const config = props.config as CountdownLiveOutputConfig;
  const copy = getLiveOutputsCopy(useI18n().language);
  return (
    <>
      <FormatField props={props} value={config.format} onChange={(format) => change(props, { ...config, format })} />
      <EditorSection title={copy.features.countdown.label}>
        <Field label={copy.fields.target}>
          <input className={INPUT_CLASS} type="datetime-local" value={isoToLocal(config.targetAt)} onChange={(event) => change(props, { ...config, targetAt: localToIso(event.target.value) })} />
        </Field>
        <TimeZoneField value={config.timeZone} onChange={(timeZone) => change(props, { ...config, timeZone })} />
        <CheckRow label={copy.fields.todayOnLoad} checked={config.useTodayOnProfileLoad} onChange={(useTodayOnProfileLoad) => change(props, { ...config, useTodayOnProfileLoad })} />
        <CheckRow label={copy.fields.doubleDigits} checked={config.doubleDigits} onChange={(doubleDigits) => change(props, { ...config, doubleDigits })} />
        <CheckRow label={copy.fields.omitZeros} checked={config.omitLeadingZeroUnits} onChange={(omitLeadingZeroUnits) => change(props, { ...config, omitLeadingZeroUnits })} />
      </EditorSection>
      <CompletionFields config={config} onChange={(next) => change(props, next)} onPickSound={props.onPickSound} />
    </>
  );
}

export function ChronoDownEditor(props: LiveOutputEditorProps) {
  const config = props.config as ChronoDownLiveOutputConfig;
  const copy = getLiveOutputsCopy(useI18n().language);
  return (
    <>
      <FormatField props={props} value={config.format} onChange={(format) => change(props, { ...config, format })} />
      <EditorSection title={copy.features['chrono-down'].label}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput label={copy.fields.initialSeconds} min={0} max={315_576_000} value={config.initialSeconds} onChange={(initialSeconds) => change(props, { ...config, initialSeconds })} />
          <NumberInput label={copy.fields.adjustmentMinutes} min={1} max={10_080} value={config.adjustmentMinutes} onChange={(adjustmentMinutes) => change(props, { ...config, adjustmentMinutes })} />
        </div>
        <CheckRow label={copy.fields.doubleDigits} checked={config.doubleDigits} onChange={(doubleDigits) => change(props, { ...config, doubleDigits })} />
        <CheckRow label={copy.fields.omitZeros} checked={config.omitLeadingZeroUnits} onChange={(omitLeadingZeroUnits) => change(props, { ...config, omitLeadingZeroUnits })} />
        <CheckRow label={copy.fields.startChronoUp} checked={config.startChronoUpOnComplete} onChange={(startChronoUpOnComplete) => change(props, { ...config, startChronoUpOnComplete })} />
      </EditorSection>
      <CompletionFields config={config} onChange={(next) => change(props, next)} onPickSound={props.onPickSound} />
    </>
  );
}

export function ChronoUpEditor(props: LiveOutputEditorProps) {
  const config = props.config as ChronoUpLiveOutputConfig;
  const copy = getLiveOutputsCopy(useI18n().language);
  return (
    <>
      <FormatField props={props} value={config.format} onChange={(format) => change(props, { ...config, format })} />
      <EditorSection title={copy.features['chrono-up'].label}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput label={copy.fields.initialSeconds} min={0} max={315_576_000} value={config.initialSeconds} onChange={(initialSeconds) => change(props, { ...config, initialSeconds })} />
          <NumberInput label={copy.fields.adjustmentMinutes} min={1} max={10_080} value={config.adjustmentMinutes} onChange={(adjustmentMinutes) => change(props, { ...config, adjustmentMinutes })} />
        </div>
        <CheckRow label={copy.fields.useDays} checked={config.useDays} onChange={(useDays) => change(props, { ...config, useDays })} />
        <CheckRow label={copy.fields.resetOnStart} checked={config.resetOnStart} onChange={(resetOnStart) => change(props, { ...config, resetOnStart })} />
      </EditorSection>
    </>
  );
}

function newLine(): LiveOutputTextLine {
  return { id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: '', enabled: true, allowEmpty: true };
}

export function TextRotatorEditor(props: LiveOutputEditorProps) {
  const config = props.config as TextRotatorLiveOutputConfig;
  const copy = getLiveOutputsCopy(useI18n().language);
  const updateLine = (index: number, patch: Partial<LiveOutputTextLine>) => {
    const lines = config.lines.map((line, current) => current === index ? { ...line, ...patch } : line);
    change(props, { ...config, lines });
  };
  const moveLine = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= config.lines.length) return;
    const lines = [...config.lines];
    [lines[index], lines[target]] = [lines[target]!, lines[index]!];
    change(props, { ...config, lines });
  };
  return (
    <>
      <EditorSection title={copy.features['text-rotator'].label}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput label={copy.fields.interval} min={1} max={86_400} value={config.intervalSeconds} onChange={(intervalSeconds) => change(props, { ...config, intervalSeconds })} />
          <Field label={copy.fields.order}>
            <select className={INPUT_CLASS} value={config.order} onChange={(event) => change(props, { ...config, order: event.target.value as TextRotatorLiveOutputConfig['order'] })}>
              <option value="sequential">{copy.fields.sequential}</option><option value="shuffle">{copy.fields.shuffle}</option>
            </select>
          </Field>
        </div>
        <CheckRow label={copy.fields.loop} checked={config.loop} onChange={(loop) => change(props, { ...config, loop })} />
      </EditorSection>
      <EditorSection title={copy.fields.lines}>
        <div className="space-y-3">
          {config.lines.map((line, index) => (
            <div key={line.id} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
              <div className="flex gap-2">
                <input data-no-i18n="true" aria-label={`${copy.fields.lineText} ${index + 1}`} className={INPUT_CLASS} value={line.text} onChange={(event) => updateLine(index, { text: event.target.value, allowEmpty: event.target.value.length === 0 ? line.allowEmpty : false })} />
                <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => moveLine(index, -1)} className="rounded border border-gray-700 px-2 text-gray-400 disabled:opacity-30">↑</button>
                <button type="button" aria-label="Move down" disabled={index === config.lines.length - 1} onClick={() => moveLine(index, 1)} className="rounded border border-gray-700 px-2 text-gray-400 disabled:opacity-30">↓</button>
                <button type="button" aria-label="Delete line" onClick={() => change(props, { ...config, lines: config.lines.filter((_, current) => current !== index) })} className="rounded border border-rose-900/60 px-2 text-rose-300">×</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={line.enabled} onChange={(event) => updateLine(index, { enabled: event.target.checked })} /> {copy.enabled}</label>
                <label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={line.allowEmpty} onChange={(event) => updateLine(index, { allowEmpty: event.target.checked })} /> {copy.fields.allowEmpty}</label>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => change(props, { ...config, lines: [...config.lines, newLine()] })} className="rounded-lg border border-dashed border-gray-700 px-3 py-2 text-xs text-violet-300 hover:border-violet-600">+ {copy.fields.addLine}</button>
        </div>
      </EditorSection>
    </>
  );
}

export function SystemInfoEditor(props: LiveOutputEditorProps) {
  const config = props.config as SystemInfoLiveOutputConfig;
  const copy = getLiveOutputsCopy(useI18n().language);
  const interfaces = Array.isArray(props.runtime?.details.networkInterfaces) ? props.runtime?.details.networkInterfaces as Array<{ id: string; label: string }> : [];
  return (
    <>
      <FormatField props={props} value={config.format} onChange={(format) => change(props, { ...config, format })} multiline />
      <EditorSection title={copy.features['system-info'].label}>
        <NumberInput label={copy.fields.sampleInterval} min={1} max={60} value={config.sampleIntervalSeconds} onChange={(sampleIntervalSeconds) => change(props, { ...config, sampleIntervalSeconds })} />
        <CheckRow label={copy.fields.network} checked={config.networkEnabled} onChange={(networkEnabled) => change(props, { ...config, networkEnabled })} />
        {config.networkEnabled ? (
          <Field label={copy.fields.networkInterface}>
            <select className={INPUT_CLASS} value={config.networkInterfaceId ?? ''} onChange={(event) => change(props, { ...config, networkInterfaceId: event.target.value || null })}>
              <option value="">{copy.fields.automatic}</option>
              {interfaces.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </Field>
        ) : null}
        <CheckRow label={copy.fields.roundUsed} checked={config.roundRamUsedPercent} onChange={(roundRamUsedPercent) => change(props, { ...config, roundRamUsedPercent })} />
        <CheckRow label={copy.fields.roundAvailable} checked={config.roundRamAvailablePercent} onChange={(roundRamAvailablePercent) => change(props, { ...config, roundRamAvailablePercent })} />
      </EditorSection>
    </>
  );
}

function PlatformMetadataPanel({ config, capability, presets, onSavePreset, onDeletePreset }: {
  config: PlatformLiveOutputConfig;
  capability: PlatformStreamCapability;
  presets: PlatformStreamMetadataPreset[];
  onSavePreset: (preset: PlatformStreamMetadataPreset) => Promise<boolean>;
  onDeletePreset: (id: string) => Promise<boolean>;
}) {
  const copy = getLiveOutputsCopy(useI18n().language);
  const [metadata, setMetadata] = useState<PlatformStreamMetadata | null>(null);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [categorySearchActive, setCategorySearchActive] = useState(false);
  const [categories, setCategories] = useState<PlatformCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetBusy, setPresetBusy] = useState(false);
  const compatiblePresets = useMemo(
    () => presets.filter((preset) => preset.platformId === config.platformId),
    [config.platformId, presets],
  );

  const target = useMemo(() => ({
    platformId: config.platformId,
    accountId: config.accountId,
    channelId: config.channelId,
  }), [config.accountId, config.channelId, config.platformId]);

  const loadMetadata = useCallback(async () => {
    if (!capability.metadataReadable) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.copilot.getPlatformStreamMetadata(target);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMetadata(result.value);
      setTitle(result.value.title);
      setCategoryId(result.value.categoryId);
      setCategoryQuery(result.value.categoryName);
      setCategorySearchActive(false);
      setCategories([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [capability.metadataReadable, target]);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    if (!categorySearchActive || !capability.mutableMetadataFields.includes('category')) return undefined;
    const query = categoryQuery.trim();
    if (query.length < 2) {
      setCategories([]);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError(null);
      void window.copilot.searchPlatformCategories({ ...target, query }).then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setCategories([]);
          setError(result.error.message);
          return;
        }
        setCategories(result.value);
      }).catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }).finally(() => {
        if (!cancelled) setSearching(false);
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [capability.mutableMetadataFields, categoryQuery, categorySearchActive, target]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.copilot.updatePlatformStreamMetadata({
        ...target,
        ...(capability.mutableMetadataFields.includes('title') ? { title } : {}),
        ...(capability.mutableMetadataFields.includes('category') && categoryId ? { categoryId } : {}),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMetadata(result.value);
      setTitle(result.value.title);
      setCategoryId(result.value.categoryId);
      setCategoryQuery(result.value.categoryName);
      setCategorySearchActive(false);
      setCategories([]);
      setMessage(copy.metadataSaved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const categoryNeedsSelection = capability.mutableMetadataFields.includes('category')
    && categoryQuery !== (metadata?.categoryName ?? '')
    && categoryId.length === 0;

  const selectPreset = (id: string) => {
    setSelectedPresetId(id);
    const preset = compatiblePresets.find((item) => item.id === id);
    if (!preset) {
      setPresetName('');
      return;
    }
    setPresetName(preset.name);
    setTitle(preset.title);
    setCategoryId(preset.categoryId);
    setCategoryQuery(preset.categoryName);
    setCategorySearchActive(false);
    setCategories([]);
    setMessage(null);
  };

  const savePreset = async () => {
    if (!presetName.trim()) {
      setError(copy.fillPresetName);
      return;
    }
    setPresetBusy(true);
    setError(null);
    const ok = await onSavePreset({
      id: selectedPresetId || crypto.randomUUID(),
      platformId: config.platformId,
      name: presetName.trim(),
      title,
      categoryId,
      categoryName: categoryQuery,
    });
    if (ok) {
      setMessage(copy.presetSaved);
      setPresetName('');
      setSelectedPresetId('');
    }
    setPresetBusy(false);
  };

  const deletePreset = async () => {
    if (!selectedPresetId || !window.confirm(copy.confirmDeletePreset)) return;
    setPresetBusy(true);
    setError(null);
    const ok = await onDeletePreset(selectedPresetId);
    if (ok) {
      setMessage(copy.presetDeleted);
      setPresetName('');
      setSelectedPresetId('');
    }
    setPresetBusy(false);
  };

  return (
    <EditorSection title={copy.channelMetadata} description={copy.channelMetadataDescription}>
      {capability.metadataReadable ? (
        <>
          <div aria-busy={loading} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3"><p className="text-[11px] text-gray-500">{copy.streamState}</p><p className={['mt-1 text-sm font-medium', metadata?.isLive ? 'text-emerald-300' : 'text-gray-300'].join(' ')}>{metadata?.isLive ? copy.live : copy.offline}</p></div>
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3"><p className="text-[11px] text-gray-500">{copy.viewers}</p><p data-no-i18n="true" className="mt-1 text-sm font-medium text-gray-200">{metadata?.viewerCount?.toLocaleString() ?? '—'}</p></div>
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3"><p className="text-[11px] text-gray-500">{copy.followers}</p><p data-no-i18n="true" className="mt-1 text-sm font-medium text-gray-200">{metadata?.followerCount?.toLocaleString() ?? '—'}</p></div>
          </div>
          <button type="button" disabled={loading} onClick={() => void loadMetadata()} className="text-xs text-violet-300 hover:text-violet-200 disabled:opacity-50">{loading ? '…' : copy.refreshMetadata}</button>
        </>
      ) : null}

      {capability.mutableMetadataFields.includes('title') ? (
        <Field label={copy.streamTitle}>
          <input data-no-i18n="true" className={INPUT_CLASS} maxLength={500} value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
      ) : metadata?.title ? <p data-no-i18n="true" className="text-sm text-gray-300">{metadata.title}</p> : null}

      {capability.mutableMetadataFields.includes('category') ? (
        <div>
          <Field label={copy.streamCategory} hint={copy.searchCategory}>
            <input
              data-no-i18n="true"
              role="combobox"
              aria-expanded={categorySearchActive && categories.length > 0}
              aria-controls="platform-category-results"
              aria-autocomplete="list"
              className={INPUT_CLASS}
              value={categoryQuery}
              onChange={(event) => {
                setCategoryQuery(event.target.value);
                setCategoryId('');
                setCategorySearchActive(true);
                setMessage(null);
              }}
            />
          </Field>
          {searching ? <p role="status" className="mt-2 text-xs text-gray-500">…</p> : null}
          {categorySearchActive && !searching && categoryQuery.trim().length >= 2 ? (
            <div id="platform-category-results" role="listbox" aria-label={copy.categoryResults} className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-950 p-1">
              {categories.length === 0 ? <p role="status" className="px-3 py-2 text-xs text-gray-500">{copy.noCategories}</p> : categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  role="option"
                  aria-selected={category.id === categoryId}
                  onClick={() => {
                    setCategoryId(category.id);
                    setCategoryQuery(category.name);
                    setCategorySearchActive(false);
                    setCategories([]);
                  }}
                  className="block w-full rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800 focus:bg-gray-800 focus:outline-none"
                >
                  {category.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : metadata?.categoryName ? <p data-no-i18n="true" className="text-sm text-gray-400">{metadata.categoryName}</p> : null}

      {capability.mutableMetadataFields.length > 0 ? (
        <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-950/35 p-3">
          <p className="text-xs font-medium text-gray-300">{copy.metadataPresets}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={copy.metadataPresets}>
              <select className={INPUT_CLASS} value={selectedPresetId} onChange={(event) => selectPreset(event.target.value)}>
                <option value="">{copy.noPresets}</option>
                {compatiblePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </select>
            </Field>
            <Field label={copy.presetName}>
              <input className={INPUT_CLASS} maxLength={120} value={presetName} onChange={(event) => setPresetName(event.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={presetBusy} onClick={() => void savePreset()} className="rounded-lg border border-violet-700 px-3 py-2 text-xs text-violet-200 disabled:opacity-50">{copy.savePreset}</button>
            <button type="button" disabled={presetBusy || !selectedPresetId} onClick={() => void deletePreset()} className="rounded-lg border border-rose-900/70 px-3 py-2 text-xs text-rose-300 disabled:opacity-50">{copy.deletePreset}</button>
          </div>
        </div>
      ) : null}

      {capability.mutableMetadataFields.length > 0 ? (
        <button type="button" disabled={saving || loading || categoryNeedsSelection} onClick={() => void save()} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">{saving ? '…' : copy.saveMetadata}</button>
      ) : <p className="text-xs text-gray-500">{copy.metadataReadOnly}</p>}
      {message ? <p role="status" className="text-xs text-emerald-300">{message}</p> : null}
      {error ? <p role="alert" data-no-i18n="true" className="rounded-lg border border-rose-800/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">{error}</p> : null}
    </EditorSection>
  );
}

export function PlatformLiveEditor(props: LiveOutputEditorProps) {
  const config = props.config as PlatformLiveOutputConfig;
  const copy = getLiveOutputsCopy(useI18n().language);
  const targets = props.platformCapabilities.flatMap((capability) => capability.targets.map((target) => ({ capability, target })));
  const currentCapability = props.platformCapabilities.find((capability) => capability.platformId === config.platformId);
  const targetKey = (platformId: string, accountId: string, channelId: string) => [platformId, accountId, channelId].map(encodeURIComponent).join('|');
  const key = targetKey(config.platformId, config.accountId, config.channelId);
  const selectTarget = (value: string) => {
    const selected = targets.find(({ target }) => targetKey(target.platformId, target.accountId, target.channelId) === value);
    const metric = selected?.capability.metrics[0];
    if (!selected || !metric) return;
    change(props, {
      ...config, platformId: selected.target.platformId, accountId: selected.target.accountId,
      channelId: selected.target.channelId, metricId: metric.id, format: metric.token,
      refreshSeconds: Math.max(config.refreshSeconds, metric.minimumRefreshSeconds),
    });
  };
  return (
    <>
      <EditorSection title={copy.features['platform-live'].label}>
        {targets.length === 0 ? <p role="status" className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-200">{copy.noPlatformMetrics}</p> : (
          <>
            <Field label={copy.fields.platformTarget}>
              <select className={INPUT_CLASS} value={key} onChange={(event) => selectTarget(event.target.value)}>
                {targets.map(({ target }) => <option key={targetKey(target.platformId, target.accountId, target.channelId)} value={targetKey(target.platformId, target.accountId, target.channelId)}>{target.label}</option>)}
              </select>
            </Field>
            <Field label={copy.fields.metric}>
              <select className={INPUT_CLASS} value={config.metricId} onChange={(event) => {
                const metric = currentCapability?.metrics.find((item) => item.id === event.target.value);
                const previousMetric = currentCapability?.metrics.find((item) => item.id === config.metricId);
                change(props, {
                  ...config,
                  metricId: event.target.value,
                  format: metric && previousMetric ? config.format.replaceAll(previousMetric.token, metric.token) : config.format,
                  refreshSeconds: Math.max(config.refreshSeconds, metric?.minimumRefreshSeconds ?? 1),
                });
              }}>
                {currentCapability?.metrics.map((metric) => <option key={metric.id} value={metric.id}>{metric.label}</option>)}
              </select>
            </Field>
            <NumberInput label={copy.fields.refresh} min={currentCapability?.metrics.find((metric) => metric.id === config.metricId)?.minimumRefreshSeconds ?? 1} max={300} value={config.refreshSeconds} onChange={(refreshSeconds) => change(props, { ...config, refreshSeconds })} />
          </>
        )}
      </EditorSection>
      <FormatField
        props={{
          ...props,
          descriptor: {
            ...props.descriptor,
            tokens: currentCapability?.metrics.map((metric) => ({ token: metric.token, description: metric.label, example: '42' })) ?? props.descriptor.tokens,
          },
        }}
        value={config.format}
        onChange={(format) => change(props, { ...config, format })}
      />
      {currentCapability ? (
        <PlatformMetadataPanel
          config={config}
          capability={currentCapability}
          presets={props.metadataPresets}
          onSavePreset={props.onSaveMetadataPreset}
          onDeletePreset={props.onDeleteMetadataPreset}
        />
      ) : null}
    </>
  );
}

function SpotifyCredentialsPanel() {
  const copy = getLiveOutputsCopy(useI18n().language);
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.copilot.getPlayingNowCredentialStatus().then((next) => {
      if (!cancelled) setStatus(next);
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { cancelled = true; };
  }, []);

  const run = async (operation: () => Promise<CredentialStatus>, successMessage?: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await operation();
      setStatus(next);
      if (next.status === 'error') setError(next.message ?? 'Spotify error');
      else if (successMessage) setMessage(successMessage);
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError(copy.fillSpotifyCredentials);
      return;
    }
    const next = await run(
      () => window.copilot.savePlayingNowCredentials({ clientId: clientId.trim(), clientSecret }),
      copy.credentialsSaved,
    );
    if (next?.status === 'configured') {
      setClientId('');
      setClientSecret('');
    }
  };

  const test = async () => {
    const hasDraft = clientId.trim().length > 0 || clientSecret.length > 0;
    if (hasDraft && (!clientId.trim() || !clientSecret)) {
      setError(copy.fillSpotifyCredentials);
      return;
    }
    await run(() => hasDraft
      ? window.copilot.testPlayingNowCredentials({ clientId: clientId.trim(), clientSecret })
      : window.copilot.testPlayingNowCredentials());
  };

  const remove = async () => {
    if (!window.confirm(copy.confirmRemoveCredentials)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await window.copilot.removePlayingNowCredentials();
      setStatus({ status: 'not-configured', message: null });
      setClientId('');
      setClientSecret('');
      setMessage(copy.credentialsRemoved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = status?.status === 'configured'
    ? copy.configured
    : status?.status === 'error'
      ? copy.statuses.error
      : copy.notConfiguredCredential;

  return (
    <EditorSection title={copy.spotifyCredentials} description={copy.spotifyCredentialsDescription}>
      <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2">
        <span className="text-xs text-gray-500">{copy.credentialStatus}</span>
        <span role="status" className={['text-xs font-medium', status?.status === 'configured' ? 'text-emerald-300' : status?.status === 'error' ? 'text-rose-300' : 'text-gray-400'].join(' ')}>{statusLabel}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={copy.clientId}>
          <input data-no-i18n="true" autoComplete="off" className={INPUT_CLASS} value={clientId} onChange={(event) => setClientId(event.target.value)} />
        </Field>
        <Field label={copy.clientSecret} hint={copy.savedSecretHint}>
          <input data-no-i18n="true" autoComplete="new-password" type="password" className={INPUT_CLASS} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2" aria-busy={busy}>
        <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium hover:bg-violet-500 disabled:opacity-50">{copy.saveCredentials}</button>
        <button type="button" disabled={busy || (!clientId && !clientSecret && status?.status !== 'configured')} onClick={() => void test()} className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-200 hover:border-violet-600 disabled:opacity-50">{copy.testCredentials}</button>
        <button type="button" disabled={busy || status?.status !== 'configured'} onClick={() => void remove()} className="rounded-lg border border-rose-900/70 px-3 py-2 text-xs text-rose-300 hover:bg-rose-950/40 disabled:opacity-50">{copy.removeCredentials}</button>
      </div>
      {status?.message && status.status !== 'error' ? <p role="status" data-no-i18n="true" className="text-xs text-gray-400">{status.message}</p> : null}
      {message ? <p role="status" className="text-xs text-emerald-300">{message}</p> : null}
      {error ? <p role="alert" data-no-i18n="true" className="rounded-lg border border-rose-800/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">{error}</p> : null}
    </EditorSection>
  );
}

export function PlayingNowEditor(props: LiveOutputEditorProps) {
  const config = props.config as PlayingNowLiveOutputConfig;
  const copy = getLiveOutputsCopy(useI18n().language);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const availableSources = useMemo(() => props.playingNowSources.filter((source) => source.status === 'available'), [props.playingNowSources]);
  const test = async () => {
    if (!config.sourceId) return;
    setTesting(true);
    setTestResult(await props.onTestPlayingNowSource(config.sourceId));
    setTesting(false);
  };
  return (
    <>
      <FormatField props={props} value={config.format} onChange={(format) => change(props, { ...config, format })} multiline />
      <EditorSection title={copy.features['playing-now'].label}>
        <Field label={copy.fields.sourceMode}>
          <select className={INPUT_CLASS} value={config.sourceMode} onChange={(event) => {
            const sourceMode = event.target.value as PlayingNowLiveOutputConfig['sourceMode'];
            change(props, { ...config, sourceMode, sourceId: sourceMode === 'auto' ? null : config.sourceId ?? availableSources[0]?.id ?? null });
          }}>
            <option value="auto">{copy.fields.auto}</option><option value="pinned">{copy.fields.pinned}</option>
          </select>
        </Field>
        {config.sourceMode === 'pinned' ? (
          <>
            <Field label={copy.fields.source}>
              <select className={INPUT_CLASS} value={config.sourceId ?? ''} onChange={(event) => change(props, { ...config, sourceId: event.target.value || null })}>
                <option value="">—</option>
                {props.playingNowSources.map((source) => <option key={source.id} value={source.id} disabled={source.status !== 'available'}>{source.label} · {source.status}</option>)}
              </select>
            </Field>
            <div className="flex items-center gap-3">
              <button type="button" disabled={!config.sourceId || testing} onClick={() => void test()} className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-200 disabled:opacity-50">{testing ? '…' : copy.actions.test}</button>
              {testResult ? <span role="status" data-no-i18n="true" className="text-xs text-gray-400">{testResult}</span> : null}
            </div>
          </>
        ) : null}
        <CheckRow label={copy.fields.fallback} checked={config.fallbackToSystemSession} onChange={(fallbackToSystemSession) => change(props, { ...config, fallbackToSystemSession })} />
        <Field label={copy.fields.noMedia}>
          <input data-no-i18n="true" className={INPUT_CLASS} value={config.noMediaText} onChange={(event) => change(props, { ...config, noMediaText: event.target.value })} />
        </Field>
      </EditorSection>
      <EditorSection title={copy.metadata}>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberInput label={copy.fields.artistLimit} hint={copy.fields.noLimitHint} min={0} max={1_000} value={config.truncate.artist} onChange={(artist) => change(props, { ...config, truncate: { ...config.truncate, artist } })} />
          <NumberInput label={copy.fields.songLimit} hint={copy.fields.noLimitHint} min={0} max={1_000} value={config.truncate.song} onChange={(song) => change(props, { ...config, truncate: { ...config.truncate, song } })} />
          <NumberInput label={copy.fields.albumLimit} hint={copy.fields.noLimitHint} min={0} max={1_000} value={config.truncate.album} onChange={(album) => change(props, { ...config, truncate: { ...config.truncate, album } })} />
        </div>
        <CheckRow label={copy.fields.separateFiles} checked={config.writeSeparateFiles} onChange={(writeSeparateFiles) => change(props, { ...config, writeSeparateFiles })} />
        <CheckRow label={copy.fields.json} checked={config.writeJson} onChange={(writeJson) => change(props, { ...config, writeJson })} />
        <CheckRow label={copy.fields.artwork} checked={config.writeArtwork} onChange={(writeArtwork) => change(props, { ...config, writeArtwork })} />
        <CheckRow label={copy.fields.spotify} checked={config.spotifyEnrichmentEnabled} onChange={(spotifyEnrichmentEnabled) => change(props, { ...config, spotifyEnrichmentEnabled })} />
      </EditorSection>
      {config.spotifyEnrichmentEnabled ? <SpotifyCredentialsPanel /> : null}
      <EditorSection title={copy.fields.layout}>
        <Field label={copy.fields.layout}>
          <select className={INPUT_CLASS} value={config.overlayLayout} onChange={(event) => change(props, { ...config, overlayLayout: event.target.value as PlayingNowLiveOutputConfig['overlayLayout'] })}>
            <option value="compact">{copy.fields.compact}</option><option value="artwork-left">{copy.fields.artworkLeft}</option><option value="artwork-right">{copy.fields.artworkRight}</option>
          </select>
        </Field>
        <CheckRow label={copy.fields.progress} checked={config.showProgress} onChange={(showProgress) => change(props, { ...config, showProgress })} />
      </EditorSection>
    </>
  );
}
