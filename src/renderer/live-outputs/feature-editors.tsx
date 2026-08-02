import { useMemo, useState } from 'react';

import type {
  ChronoDownLiveOutputConfig,
  ChronoUpLiveOutputConfig,
  CountdownLiveOutputConfig,
  DateLiveOutputConfig,
  LiveOutputConfig,
  LiveOutputTextLine,
  PlatformLiveOutputConfig,
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
                change(props, { ...config, metricId: event.target.value, refreshSeconds: Math.max(config.refreshSeconds, metric?.minimumRefreshSeconds ?? 1) });
              }}>
                {currentCapability?.metrics.map((metric) => <option key={metric.id} value={metric.id}>{metric.label}</option>)}
              </select>
            </Field>
            <NumberInput label={copy.fields.refresh} min={currentCapability?.metrics.find((metric) => metric.id === config.metricId)?.minimumRefreshSeconds ?? 1} max={300} value={config.refreshSeconds} onChange={(refreshSeconds) => change(props, { ...config, refreshSeconds })} />
          </>
        )}
      </EditorSection>
      <FormatField props={props} value={config.format} onChange={(format) => change(props, { ...config, format })} />
    </>
  );
}

export function PlayingNowEditor(props: LiveOutputEditorProps) {
  const config = props.config as PlayingNowLiveOutputConfig;
  const copy = getLiveOutputsCopy(useI18n().language);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const availableSources = useMemo(() => props.playingNowSources.filter((source) => source.status !== 'error'), [props.playingNowSources]);
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
                {availableSources.map((source) => <option key={source.id} value={source.id}>{source.label} · {source.status}</option>)}
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
