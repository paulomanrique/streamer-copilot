import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { dialog, ipcMain, shell } from 'electron';

import type { AccountRepository } from '../../modules/accounts/account-repository.js';
import { LiveOutputHotkeyManager } from '../../modules/live-outputs/hotkey-manager.js';
import { LiveOutputsService } from '../../modules/live-outputs/live-outputs-service.js';
import { PlayingNowCredentialManager } from '../../modules/live-outputs/media/playing-now-credentials.js';
import { PlayingNowSourceManager } from '../../modules/live-outputs/media/playing-now-source-manager.js';
import { createLiveOutputsOverlayHandler } from '../../modules/live-outputs/overlay-extension.js';
import {
  liveOutputArtifactInputSchema,
  liveOutputConfigSchema,
  liveOutputControlInputSchema,
  liveOutputHotkeySettingsSchema,
  liveOutputIdInputSchema,
  platformCategorySearchInputSchema,
  platformStreamMetadataPresetSchema,
  platformStreamMetadataUpdateInputSchema,
  platformStreamTargetInputSchema,
  playingNowCredentialsSchema,
  playingNowSourceInputSchema,
} from '../../shared/schemas.js';
import { IPC_CHANNELS } from '../../shared/ipc.js';
import type {
  LiveOutputConfig,
  LiveOutputControlInput,
  LiveOutputError,
  LiveOutputHotkeyAction,
  LiveOutputOperationResult,
  LiveOutputsSnapshot,
  PlatformCategory,
  PlatformLiveOutputConfig,
  PlatformStreamMetadata,
  PlatformStreamTarget,
} from '../../shared/types.js';
import type { OverlayServer } from '../overlay-server.js';
import type { MainPlatformRegistry, MainPlatformStreamTools } from '../platforms/registry.js';
import type { StateHub } from '../state-hub.js';
import type { MainFeatureModule } from './registry.js';

interface LiveOutputsMainModuleOptions {
  initialProfileDirectory: string;
  overlayServer: OverlayServer;
  stateHub: StateHub;
  platformRegistry: MainPlatformRegistry;
  accountRepository: AccountRepository;
  playSound: (relativePath: string) => void;
  logError: (message: string, metadata?: Record<string, unknown>) => void;
}

export class LiveOutputsMainModule implements MainFeatureModule {
  readonly id = 'live-outputs';
  private profileDirectory: string;
  private service: LiveOutputsService | null = null;
  private sourceManager: PlayingNowSourceManager | null = null;
  private credentialManager: PlayingNowCredentialManager | null = null;
  private unregisterOverlayRoute: (() => void) | null = null;
  private readonly hotkeys = new LiveOutputHotkeyManager((action) => { void this.handleHotkey(action); });

  constructor(private readonly options: LiveOutputsMainModuleOptions) {
    this.profileDirectory = options.initialProfileDirectory;
    this.registerIpc();
  }

  async initialize(): Promise<void> {
    if (!this.profileDirectory) return;
    await this.startForProfile(this.profileDirectory);
  }

  async switchProfile(profileDirectory: string): Promise<void> {
    await this.stopCurrent();
    this.profileDirectory = profileDirectory;
    if (profileDirectory) await this.startForProfile(profileDirectory);
  }

  async dispose(): Promise<void> {
    await this.stopCurrent();
  }

  private async startForProfile(profileDirectory: string): Promise<void> {
    this.sourceManager = new PlayingNowSourceManager();
    this.credentialManager = new PlayingNowCredentialManager(profileDirectory);
    const sourceManager = this.sourceManager;
    const credentialManager = this.credentialManager;
    const service = new LiveOutputsService({
      profileDirectory,
      overlayBaseUrl: () => {
        const status = this.options.overlayServer.getStatus();
        return status.status === 'running' ? `http://127.0.0.1:${status.port}` : null;
      },
      overlayServerStatus: () => this.options.overlayServer.getStatus().status,
      browserClientCount: (topic) => this.options.overlayServer.clientCount(topic),
      publishOverlay: (topic, payload) => this.options.overlayServer.publish(topic, payload),
      onUpdate: (snapshot) => this.options.stateHub.pushLiveOutputs(snapshot),
      playSound: this.options.playSound,
      readPlatformMetric: (config) => this.readPlatformMetric(config),
      readPlayingNow: async (config) => {
        const track = await sourceManager.read(config);
        if (!config.spotifyEnrichmentEnabled || !track.song) return track;
        try { return await credentialManager.enrich(track, config.writeArtwork); }
        catch (cause) {
          this.options.logError('Playing Now Spotify enrichment failed', { error: errorMessage(cause) });
          return track;
        }
      },
    });
    this.service = service;
    this.unregisterOverlayRoute = this.options.overlayServer.registerRouteHandler(createLiveOutputsOverlayHandler(service));
    await service.initialize();
    const settings = service.getSnapshot().settings;
    const hotkeyResult = this.hotkeys.apply(settings.hotkeysEnabled, settings.hotkeys);
    if (!hotkeyResult.ok) this.options.logError(hotkeyResult.error.message, { code: hotkeyResult.error.code });
  }

  private async stopCurrent(): Promise<void> {
    this.hotkeys.dispose();
    this.unregisterOverlayRoute?.();
    this.unregisterOverlayRoute = null;
    await this.service?.dispose();
    this.service = null;
    this.sourceManager = null;
    this.credentialManager = null;
  }

  private registerIpc(): void {
    ipcMain.handle(IPC_CHANNELS.liveOutputsGetCatalog, () => this.service?.getCatalog() ?? []);
    ipcMain.handle(IPC_CHANNELS.liveOutputsGetSnapshot, () => this.requireService().getSnapshot());
    ipcMain.handle(IPC_CHANNELS.liveOutputsUpsert, async (_, raw) => {
      const input = liveOutputConfigSchema.parse(raw) as LiveOutputConfig;
      if (input.kind === 'platform-live') {
        const validation = await this.validatePlatformOutput(input);
        if (!validation.ok) return validation;
      }
      return this.requireService().upsert(input);
    });
    ipcMain.handle(IPC_CHANNELS.liveOutputsDelete, (_, raw) => this.requireService().delete(liveOutputIdInputSchema.parse(raw)));
    ipcMain.handle(IPC_CHANNELS.liveOutputsControl, async (_, raw) => {
      const input = liveOutputControlInputSchema.parse(raw) as LiveOutputControlInput;
      const service = this.requireService();
      const config = service.getSnapshot().settings.outputs.find((output) => output.id === input.id);
      if (config?.kind === 'playing-now' && ['play', 'pause', 'stop', 'previous', 'next'].includes(input.action)) {
        const track = service.getOutputSnapshot(input.id)?.details;
        try {
          await this.requireSourceManager().control(typeof track?.sourceId === 'string' ? track.sourceId : null, input.action);
          return service.regenerate(input.id);
        } catch (cause) {
          return failure('SOURCE_UNAVAILABLE', errorMessage(cause));
        }
      }
      return service.control(input);
    });
    ipcMain.handle(IPC_CHANNELS.liveOutputsSaveHotkeys, async (_, raw) => {
      const { enabled, bindings } = liveOutputHotkeySettingsSchema.parse(raw);
      const current = this.requireService().getSnapshot().settings;
      const registration = this.hotkeys.apply(enabled, bindings);
      if (!registration.ok) return registration;
      const saved = await this.requireService().saveHotkeys(enabled, bindings);
      if (!saved.ok) this.hotkeys.apply(current.hotkeysEnabled, current.hotkeys);
      return saved;
    });
    ipcMain.handle(IPC_CHANNELS.liveOutputsRegenerate, (_, raw) => this.requireService().regenerate(liveOutputIdInputSchema.parse(raw).id));
    ipcMain.handle(IPC_CHANNELS.liveOutputsReveal, async (_, raw) => {
      const input = liveOutputArtifactInputSchema.parse(raw);
      const snapshot = this.requireService().getOutputSnapshot(input.id);
      const artifact = snapshot?.artifacts.find((item) => item.id === (input.artifact ?? 'primary'));
      if (!artifact?.absolutePath) return failure('OUTPUT_WRITE_FAILED', 'Output file is disabled or unavailable');
      shell.showItemInFolder(artifact.absolutePath);
      return success(undefined);
    });
    ipcMain.handle(IPC_CHANNELS.liveOutputsPickSound, async (_, raw) => {
      liveOutputIdInputSchema.parse(raw);
      const result = await dialog.showOpenDialog({
        title: 'Choose completion sound',
        properties: ['openFile'],
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }],
      });
      if (result.canceled || !result.filePaths[0]) return success(null);
      const extension = path.extname(result.filePaths[0]).toLowerCase();
      const relativePath = path.join('media', 'live-outputs', `${randomUUID()}${extension}`);
      const target = path.join(this.profileDirectory, relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(result.filePaths[0], target);
      return success(relativePath.split(path.sep).join('/'));
    });
    ipcMain.handle(IPC_CHANNELS.liveOutputsSaveMetadataPreset, (_, raw) => (
      this.requireService().saveMetadataPreset(platformStreamMetadataPresetSchema.parse(raw))
    ));
    ipcMain.handle(IPC_CHANNELS.liveOutputsDeleteMetadataPreset, (_, raw) => (
      this.requireService().deleteMetadataPreset(liveOutputIdInputSchema.parse(raw))
    ));

    ipcMain.handle(IPC_CHANNELS.playingNowListSources, () => this.sourceManager?.listSources() ?? []);
    ipcMain.handle(IPC_CHANNELS.playingNowTestSource, async (_, raw) => {
      const input = playingNowSourceInputSchema.parse(raw);
      try { return success(await this.requireSourceManager().test(input.sourceId)); }
      catch (cause) { return failure('SOURCE_UNAVAILABLE', errorMessage(cause)); }
    });
    ipcMain.handle(IPC_CHANNELS.playingNowGetCredentialStatus, () => this.requireCredentialManager().getStatus());
    ipcMain.handle(IPC_CHANNELS.playingNowSaveCredentials, (_, raw) => {
      const input = playingNowCredentialsSchema.parse(raw);
      return this.requireCredentialManager().save(input.clientId, input.clientSecret);
    });
    ipcMain.handle(IPC_CHANNELS.playingNowTestCredentials, (_, raw) => {
      const parsed = raw == null ? undefined : playingNowCredentialsSchema.parse(raw);
      return this.requireCredentialManager().test(parsed);
    });
    ipcMain.handle(IPC_CHANNELS.playingNowRemoveCredentials, () => this.requireCredentialManager().remove());

    ipcMain.handle(IPC_CHANNELS.platformStreamGetCapabilities, () => this.getPlatformCapabilities());
    ipcMain.handle(IPC_CHANNELS.platformStreamGetMetadata, async (_, raw) => {
      const input = platformStreamTargetInputSchema.parse(raw);
      try {
        const { tools, target } = await this.resolvePlatformTarget(input);
        if (!tools.getMetadata) return failure('INVALID_SETTINGS', 'This provider does not expose stream metadata');
        return success(await tools.getMetadata(target));
      } catch (cause) { return platformFailure(cause); }
    });
    ipcMain.handle(IPC_CHANNELS.platformStreamSearchCategories, async (_, raw) => {
      const input = platformCategorySearchInputSchema.parse(raw);
      try {
        const { tools, target } = await this.resolvePlatformTarget(input);
        if (!tools.searchCategories) return failure('INVALID_SETTINGS', 'This provider does not support category search');
        return success(await tools.searchCategories(target, input.query));
      } catch (cause) { return platformFailure(cause); }
    });
    ipcMain.handle(IPC_CHANNELS.platformStreamUpdateMetadata, async (_, raw) => {
      const input = platformStreamMetadataUpdateInputSchema.parse(raw);
      try {
        const { tools, target } = await this.resolvePlatformTarget(input);
        if (!tools.updateMetadata) return failure('INVALID_SETTINGS', 'This provider cannot update stream metadata');
        return success(await tools.updateMetadata(target, { title: input.title, categoryId: input.categoryId }));
      } catch (cause) { return platformFailure(cause); }
    });
  }

  private async getPlatformCapabilities() {
    const accounts = await this.options.accountRepository.list();
    const capabilities = [];
    for (const provider of this.options.platformRegistry.list()) {
      if (!provider.streamTools) continue;
      const targets = await provider.streamTools.listTargets(accounts.filter((account) => account.providerId === provider.providerId));
      capabilities.push({
        platformId: provider.providerId,
        targets,
        metrics: provider.streamTools.metrics,
        metadataReadable: !!provider.streamTools.getMetadata,
        mutableMetadataFields: provider.streamTools.updateMetadata
          ? (['title', 'category'] as Array<'title' | 'category'>)
          : [],
      });
    }
    return capabilities;
  }

  private async resolvePlatformTarget(input: { platformId: string; accountId: string; channelId: string }): Promise<{
    tools: MainPlatformStreamTools;
    target: PlatformStreamTarget;
  }> {
    const provider = this.options.platformRegistry.get(input.platformId);
    if (!provider?.streamTools) throw new Error('Platform live-output provider is unavailable');
    const accounts = (await this.options.accountRepository.list()).filter((account) => account.providerId === provider.providerId);
    const targets = await provider.streamTools.listTargets(accounts);
    const target = targets.find((candidate) => candidate.accountId === input.accountId && candidate.channelId === input.channelId);
    if (!target) throw new Error('Stream target is unavailable');
    return { tools: provider.streamTools, target };
  }

  private async readPlatformMetric(config: PlatformLiveOutputConfig) {
    const { tools, target } = await this.resolvePlatformTarget(config);
    const metric = tools.metrics.find((candidate) => candidate.id === config.metricId);
    if (!metric) throw new Error('Platform metric is unavailable');
    return tools.readMetric(target, metric.id);
  }

  private async validatePlatformOutput(config: PlatformLiveOutputConfig): Promise<LiveOutputOperationResult<LiveOutputsSnapshot>> {
    try {
      const { tools } = await this.resolvePlatformTarget(config);
      const metric = tools.metrics.find((candidate) => candidate.id === config.metricId);
      if (!metric) return failure('INVALID_SETTINGS', 'Platform metric is unavailable', 'metricId');
      if (config.refreshSeconds < metric.minimumRefreshSeconds) {
        return failure('INVALID_SETTINGS', `Refresh must be at least ${metric.minimumRefreshSeconds} seconds`, 'refreshSeconds');
      }
      return success(this.requireService().getSnapshot());
    } catch (cause) {
      return failure('PLATFORM_DISCONNECTED', errorMessage(cause));
    }
  }

  private async handleHotkey(action: LiveOutputHotkeyAction): Promise<void> {
    const service = this.service;
    if (!service) return;
    const [outputId, command] = action.split('.') as ['chrono-down' | 'chrono-up', 'toggle' | 'stop' | 'increment' | 'decrement'];
    const config = service.getSnapshot().settings.outputs.find((output) => output.id === outputId);
    if (!config || (config.kind !== 'chrono-down' && config.kind !== 'chrono-up')) return;
    if (command === 'toggle') {
      const status = service.getOutputSnapshot(outputId)?.status;
      await service.control({ id: outputId, action: status === 'running' ? 'pause' : (status === 'paused' ? 'resume' : 'start') });
      return;
    }
    if (command === 'stop') {
      await service.control({ id: outputId, action: 'stop' });
      return;
    }
    const sign = command === 'increment' ? 1 : -1;
    await service.control({ id: outputId, action: 'adjust', amountSeconds: sign * config.adjustmentMinutes * 60 });
  }

  private requireService(): LiveOutputsService {
    if (!this.service) throw new Error('No active profile for live outputs');
    return this.service;
  }

  private requireSourceManager(): PlayingNowSourceManager {
    if (!this.sourceManager) throw new Error('Playing Now is unavailable');
    return this.sourceManager;
  }

  private requireCredentialManager(): PlayingNowCredentialManager {
    if (!this.credentialManager) throw new Error('Playing Now credentials are unavailable');
    return this.credentialManager;
  }
}

function success<T>(value: T): LiveOutputOperationResult<T> {
  return { ok: true, value };
}

function failure<T>(code: LiveOutputError['code'], message: string, field?: string): LiveOutputOperationResult<T> {
  return { ok: false, error: { code, message, field } };
}

function platformFailure(cause: unknown): LiveOutputOperationResult<PlatformStreamMetadata | PlatformCategory[]> {
  const message = errorMessage(cause);
  return failure(/scope|oauth|auth/i.test(message) ? 'AUTH_SCOPE_REQUIRED' : 'PLATFORM_DISCONNECTED', message);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
