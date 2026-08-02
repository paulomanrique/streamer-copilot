import type {
  ChronoDownLiveOutputConfig,
  CompletionEffectConfig,
  LiveOutputConfig,
  LiveOutputControlInput,
  LiveOutputError,
  LiveOutputFeatureDescriptor,
  LiveOutputHotkeyBinding,
  LiveOutputOperationResult,
  LiveOutputRuntimeSnapshot,
  LiveOutputsSettings,
  LiveOutputsSnapshot,
  PlatformStreamMetadataPreset,
  PlayingNowLiveOutputConfig,
} from '../../shared/types.js';
import { liveOutputConfigSchema, liveOutputControlInputSchema, liveOutputHotkeyBindingSchema, platformStreamMetadataPresetSchema } from '../../shared/schemas.js';
import { LiveOutputFeatureRegistry, type LiveOutputFeatureRuntime } from './feature-registry.js';
import type { PlatformLiveMetricReader } from './features/platform-live-feature.js';
import type { PlayingNowReader } from './features/playing-now-feature.js';
import { registerAllLiveOutputFeatures } from './register-all.js';
import { LiveOutputWriter } from './output-writer.js';
import { LiveOutputsSettingsStore } from './settings-store.js';

interface LiveOutputsServiceOptions {
  profileDirectory: string;
  overlayBaseUrl: () => string | null;
  overlayServerStatus: () => 'running' | 'failed' | 'stopped';
  browserClientCount: (topic: string) => number;
  publishOverlay: (topic: string, payload: unknown) => void;
  onUpdate: (snapshot: LiveOutputsSnapshot) => void;
  playSound: (relativePath: string) => void;
  readPlatformMetric: PlatformLiveMetricReader;
  readPlayingNow: PlayingNowReader;
}

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av7eWQAAAABJRU5ErkJggg==',
  'base64',
);

export class LiveOutputsService {
  private readonly registry = new LiveOutputFeatureRegistry();
  private readonly settingsStore: LiveOutputsSettingsStore;
  private readonly writer: LiveOutputWriter;
  private settings: LiveOutputsSettings | null = null;
  private readonly runtimes = new Map<string, LiveOutputFeatureRuntime>();
  private readonly snapshots = new Map<string, LiveOutputRuntimeSnapshot>();
  private readonly artifactUpdatedAt = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private tickRunning = false;
  private lastPushedSnapshot = '';

  constructor(private readonly options: LiveOutputsServiceOptions) {
    this.settingsStore = new LiveOutputsSettingsStore(options.profileDirectory);
    this.writer = new LiveOutputWriter(options.profileDirectory);
    registerAllLiveOutputFeatures(this.registry, {
      readPlatformMetric: options.readPlatformMetric,
      readPlayingNow: options.readPlayingNow,
    });
  }

  async initialize(): Promise<void> {
    this.settings = await this.settingsStore.load();
    this.resetRuntimes(Date.now());
    await this.tick(true);
    this.timer = setInterval(() => { void this.tick(); }, 250);
  }

  getCatalog(): LiveOutputFeatureDescriptor[] {
    return this.registry.list().map((feature) => structuredClone(feature.descriptor));
  }

  getSnapshot(): LiveOutputsSnapshot {
    if (!this.settings) throw new Error('Live outputs are not initialized');
    return {
      settings: structuredClone(this.settings),
      outputs: Object.fromEntries([...this.snapshots].map(([id, snapshot]) => [id, structuredClone(snapshot)])),
      overlayServerStatus: this.options.overlayServerStatus(),
    };
  }

  getOutputSnapshot(id: string): LiveOutputRuntimeSnapshot | null {
    const snapshot = this.snapshots.get(id);
    return snapshot ? structuredClone(snapshot) : null;
  }

  async upsert(raw: unknown): Promise<LiveOutputOperationResult<LiveOutputsSnapshot>> {
    const parsed = liveOutputConfigSchema.safeParse(raw);
    if (!parsed.success) return failure('INVALID_SETTINGS', parsed.error.issues[0]?.message ?? 'Invalid live output settings', parsed.error.issues[0]?.path.join('.'));
    const input = parsed.data as LiveOutputConfig;
    const feature = this.registry.get(input.kind);
    if (!feature || !this.settings) return failure('INVALID_SETTINGS', `Unknown live output kind: ${input.kind}`);
    if (feature.descriptor.singleton && input.id !== feature.descriptor.defaultId) {
      return failure('INVALID_SETTINGS', `${input.kind} must use id ${feature.descriptor.defaultId}`, 'id');
    }
    const duplicateKind = this.settings.outputs.find((output) => output.kind === input.kind && output.id !== input.id);
    if (feature.descriptor.singleton && duplicateKind) {
      return failure('INVALID_SETTINGS', `${input.kind} supports one output only`, 'kind');
    }
    const index = this.settings.outputs.findIndex((output) => output.id === input.id);
    if (index >= 0) this.settings.outputs[index] = input;
    else this.settings.outputs.push(input);
    this.settings = await this.settingsStore.save(this.settings);
    this.runtimes.set(input.id, feature.createRuntime(input, Date.now()));
    if (!input.enabled && input.destinations.file.enabled) {
      await this.writer.writeText(input.destinations.file.relativePath, '').catch(() => undefined);
    }
    await this.tick(true);
    return success(this.getSnapshot());
  }

  async delete(raw: unknown): Promise<LiveOutputOperationResult<LiveOutputsSnapshot>> {
    const id = typeof raw === 'object' && raw && typeof (raw as { id?: unknown }).id === 'string'
      ? (raw as { id: string }).id
      : '';
    const config = this.settings?.outputs.find((output) => output.id === id);
    if (!config || !this.settings) return failure('INVALID_SETTINGS', 'Live output not found');
    if (this.registry.get(config.kind)?.descriptor.singleton) return failure('INVALID_SETTINGS', 'Singleton outputs can be disabled but not deleted');
    this.settings.outputs = this.settings.outputs.filter((output) => output.id !== id);
    this.settings = await this.settingsStore.save(this.settings);
    this.runtimes.delete(id);
    this.snapshots.delete(id);
    this.pushSnapshot();
    return success(this.getSnapshot());
  }

  async control(raw: unknown): Promise<LiveOutputOperationResult<LiveOutputsSnapshot>> {
    const parsed = liveOutputControlInputSchema.safeParse(raw);
    if (!parsed.success) return failure('INVALID_SETTINGS', parsed.error.issues[0]?.message ?? 'Invalid control input');
    const input = parsed.data as LiveOutputControlInput;
    const config = this.settings?.outputs.find((output) => output.id === input.id);
    const feature = config ? this.registry.get(config.kind) : null;
    const runtime = this.runtimes.get(input.id);
    if (!config || !feature || !runtime) return failure('INVALID_SETTINGS', 'Live output not found');
    if (!feature.control) return failure('INVALID_SETTINGS', `${config.kind} does not support runtime controls`);
    await feature.control(config, runtime, input, Date.now());
    await this.tick(true);
    return success(this.getSnapshot());
  }

  async saveHotkeys(enabled: boolean, bindings: unknown[]): Promise<LiveOutputOperationResult<LiveOutputsSnapshot>> {
    if (!this.settings) return failure('INVALID_SETTINGS', 'Live outputs are not initialized');
    const parsed: LiveOutputHotkeyBinding[] = [];
    for (const raw of bindings) {
      const binding = liveOutputHotkeyBindingSchema.safeParse(raw);
      if (!binding.success) return failure('INVALID_SETTINGS', binding.error.issues[0]?.message ?? 'Invalid hotkey');
      parsed.push(binding.data as LiveOutputHotkeyBinding);
    }
    const accelerators = parsed.flatMap((binding) => binding.accelerator ? [binding.accelerator.toLowerCase()] : []);
    if (new Set(accelerators).size !== accelerators.length) return failure('HOTKEY_CONFLICT', 'The same shortcut is assigned more than once');
    this.settings.hotkeysEnabled = enabled;
    this.settings.hotkeys = parsed;
    this.settings = await this.settingsStore.save(this.settings);
    this.pushSnapshot();
    return success(this.getSnapshot());
  }

  async saveMetadataPreset(raw: unknown): Promise<LiveOutputOperationResult<LiveOutputsSnapshot>> {
    if (!this.settings) return failure('INVALID_SETTINGS', 'Live outputs are not initialized');
    const parsed = platformStreamMetadataPresetSchema.safeParse(raw);
    if (!parsed.success) return failure('INVALID_SETTINGS', parsed.error.issues[0]?.message ?? 'Invalid metadata preset');
    const preset = parsed.data as PlatformStreamMetadataPreset;
    const duplicateName = this.settings.metadataPresets.find((item) => (
      item.id !== preset.id
      && item.platformId === preset.platformId
      && item.name.localeCompare(preset.name, undefined, { sensitivity: 'accent' }) === 0
    ));
    if (duplicateName) return failure('INVALID_SETTINGS', 'A preset with this name already exists', 'name');
    const index = this.settings.metadataPresets.findIndex((item) => item.id === preset.id);
    if (index >= 0) this.settings.metadataPresets[index] = preset;
    else this.settings.metadataPresets.push(preset);
    this.settings = await this.settingsStore.save(this.settings);
    this.pushSnapshot(true);
    return success(this.getSnapshot());
  }

  async deleteMetadataPreset(raw: unknown): Promise<LiveOutputOperationResult<LiveOutputsSnapshot>> {
    if (!this.settings) return failure('INVALID_SETTINGS', 'Live outputs are not initialized');
    const id = typeof raw === 'object' && raw && typeof (raw as { id?: unknown }).id === 'string'
      ? (raw as { id: string }).id
      : '';
    if (!this.settings.metadataPresets.some((item) => item.id === id)) return failure('INVALID_SETTINGS', 'Metadata preset not found');
    this.settings.metadataPresets = this.settings.metadataPresets.filter((item) => item.id !== id);
    this.settings = await this.settingsStore.save(this.settings);
    this.pushSnapshot(true);
    return success(this.getSnapshot());
  }

  async regenerate(id: string): Promise<LiveOutputOperationResult<LiveOutputsSnapshot>> {
    if (!this.settings?.outputs.some((output) => output.id === id)) return failure('INVALID_SETTINGS', 'Live output not found');
    this.writer.clearCache();
    await this.tick(true);
    return success(this.getSnapshot());
  }

  async dispose(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.writer.flush();
  }

  private resetRuntimes(now: number): void {
    this.runtimes.clear();
    for (const config of this.settings?.outputs ?? []) {
      const feature = this.registry.get(config.kind);
      if (feature) this.runtimes.set(config.id, feature.createRuntime(config, now));
    }
  }

  private async tick(force = false): Promise<void> {
    if (this.tickRunning || !this.settings) return;
    this.tickRunning = true;
    try {
      const now = Date.now();
      for (const config of this.settings.outputs) {
        const feature = this.registry.get(config.kind);
        const runtime = this.runtimes.get(config.id);
        if (!feature || !runtime) continue;
        try {
          const result = await feature.tick(config, runtime, now);
          const errors: LiveOutputError[] = [];
          const writesPlayingNowArtifacts = config.kind === 'playing-now' && (config.writeSeparateFiles || config.writeJson || config.writeArtwork);
          if (config.enabled && (config.destinations.file.enabled || writesPlayingNowArtifacts)) {
            try {
              await this.writeArtifacts(config, result.renderedText, result.details ?? {});
            } catch (cause) {
              errors.push({ code: 'OUTPUT_WRITE_FAILED', message: cause instanceof Error ? cause.message : String(cause) });
            }
          }
          if (result.completedNow && isCompletionConfig(config) && config.playSound && config.soundPath) {
            this.options.playSound(config.soundPath);
          }
          const previousSnapshot = this.snapshots.get(config.id);
          const snapshot: LiveOutputRuntimeSnapshot = {
            id: config.id,
            kind: config.kind,
            status: errors.length > 0 && result.status !== 'error' ? 'degraded' : result.status,
            renderedText: result.renderedText,
            updatedAt: new Date(now).toISOString(),
            nextTransitionAt: result.nextTransitionAt,
            browserClients: this.options.browserClientCount(`live-output:${config.id}`),
            errors,
            artifacts: this.buildArtifacts(config),
            details: {
              ...(result.details ?? {}),
              browserStyle: config.destinations.browser.style,
              browserLayout: config.kind === 'playing-now' ? config.overlayLayout : 'text',
              showProgress: config.kind === 'playing-now' ? config.showProgress : false,
            },
          };
          if (previousSnapshot && sameSnapshotContent(previousSnapshot, snapshot)) snapshot.updatedAt = previousSnapshot.updatedAt;
          this.snapshots.set(config.id, snapshot);
          if (config.destinations.browser.enabled && (force || snapshot.updatedAt !== previousSnapshot?.updatedAt)) {
            this.options.publishOverlay(`live-output:${config.id}`, snapshot);
          }
          if (result.completedNow && config.kind === 'chrono-down' && (config as ChronoDownLiveOutputConfig).startChronoUpOnComplete) {
            const chronoUp = this.settings.outputs.find((output) => output.kind === 'chrono-up');
            if (chronoUp) await this.control({ id: chronoUp.id, action: 'start' });
          }
        } catch (cause) {
          this.snapshots.set(config.id, {
            id: config.id,
            kind: config.kind,
            status: 'error',
            renderedText: '',
            updatedAt: new Date(now).toISOString(),
            nextTransitionAt: null,
            browserClients: this.options.browserClientCount(`live-output:${config.id}`),
            errors: [{ code: 'COLLECTOR_FAILED', message: cause instanceof Error ? cause.message : String(cause) }],
            artifacts: this.buildArtifacts(config),
            details: { browserStyle: config.destinations.browser.style },
          });
        }
      }
      this.pushSnapshot(force);
    } finally {
      this.tickRunning = false;
    }
  }

  private async writeArtifacts(config: LiveOutputConfig, renderedText: string, details: Record<string, unknown>): Promise<void> {
    if (config.destinations.file.enabled) {
      const changed = await this.writer.writeText(config.destinations.file.relativePath, renderedText);
      if (changed) this.artifactUpdatedAt.set(`${config.id}:primary`, new Date().toISOString());
    }
    if (config.kind !== 'playing-now') return;
    const playing = config as PlayingNowLiveOutputConfig;
    const artist = String(details.artist ?? '');
    const song = String(details.song ?? '');
    const album = String(details.album ?? '');
    if (playing.writeSeparateFiles) {
      await Promise.all([
        this.writer.writeText('TextFiles/TrackArtist.txt', artist),
        this.writer.writeText('TextFiles/TrackSong.txt', song),
        this.writer.writeText('TextFiles/TrackAlbum.txt', album),
      ]);
    }
    if (playing.writeJson) {
      await this.writer.writeJson('Data/track-info.json', {
        mediaplayer: details.sourceLabel ?? '', artist, song, album,
        album_image_path: this.writer.resolve('Images/AlbumImage.png'),
        state: details.state ?? 'idle',
        positionSeconds: details.positionSeconds ?? null,
        durationSeconds: details.durationSeconds ?? null,
      });
    }
    if (playing.writeArtwork && !details.artworkPath) await this.writer.writeBuffer('Images/AlbumImage.png', TRANSPARENT_PNG);
  }

  private buildArtifacts(config: LiveOutputConfig) {
    const baseUrl = this.options.overlayBaseUrl();
    const artifacts = [{
      id: 'primary',
      label: 'Text output',
      relativePath: config.destinations.file.enabled ? config.destinations.file.relativePath : null,
      absolutePath: config.destinations.file.enabled ? this.writer.resolve(config.destinations.file.relativePath) : null,
      browserUrl: config.destinations.browser.enabled && baseUrl ? `${baseUrl}/live-outputs/${encodeURIComponent(config.id)}` : null,
      updatedAt: this.artifactUpdatedAt.get(`${config.id}:primary`) ?? null,
      error: null,
    }];
    if (config.kind === 'playing-now') {
      const playing = config as PlayingNowLiveOutputConfig;
      if (playing.writeSeparateFiles) {
        for (const [id, relativePath] of [['artist', 'TextFiles/TrackArtist.txt'], ['song', 'TextFiles/TrackSong.txt'], ['album', 'TextFiles/TrackAlbum.txt']] as const) {
          artifacts.push({ id, label: id, relativePath, absolutePath: this.writer.resolve(relativePath), browserUrl: null, updatedAt: null, error: null });
        }
      }
      if (playing.writeJson) artifacts.push({ id: 'json', label: 'track-info.json', relativePath: 'Data/track-info.json', absolutePath: this.writer.resolve('Data/track-info.json'), browserUrl: null, updatedAt: null, error: null });
      if (playing.writeArtwork) artifacts.push({ id: 'artwork', label: 'AlbumImage.png', relativePath: 'Images/AlbumImage.png', absolutePath: this.writer.resolve('Images/AlbumImage.png'), browserUrl: null, updatedAt: null, error: null });
    }
    return artifacts;
  }

  private pushSnapshot(force = false): void {
    const snapshot = this.getSnapshot();
    const serialized = JSON.stringify(snapshot);
    if (!force && serialized === this.lastPushedSnapshot) return;
    this.lastPushedSnapshot = serialized;
    this.options.onUpdate(snapshot);
  }
}

function isCompletionConfig(config: LiveOutputConfig): config is LiveOutputConfig & CompletionEffectConfig {
  return config.kind === 'countdown' || config.kind === 'chrono-down';
}

function sameSnapshotContent(previous: LiveOutputRuntimeSnapshot, next: LiveOutputRuntimeSnapshot): boolean {
  const { updatedAt: _previousUpdatedAt, ...previousContent } = previous;
  const { updatedAt: _nextUpdatedAt, ...nextContent } = next;
  return JSON.stringify(previousContent) === JSON.stringify(nextContent);
}

function success<T>(value: T): LiveOutputOperationResult<T> {
  return { ok: true, value };
}

function failure<T>(code: LiveOutputError['code'], message: string, field?: string): LiveOutputOperationResult<T> {
  return { ok: false, error: { code, message, field } };
}
