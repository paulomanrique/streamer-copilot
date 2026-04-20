import { OBSWebSocket } from 'obs-websocket-js';

import type { ObsConnectionSettings, ObsStatsSnapshot } from '../../shared/types.js';
import { ObsSettingsStore } from './obs-settings-store.js';

interface ObsServiceOptions {
  settingsStore: ObsSettingsStore;
  onConnected: () => void;
  onDisconnected: () => void;
  onStats: (stats: ObsStatsSnapshot) => void;
}

const POLL_INTERVAL_MS = 3_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_TRANSIENT_POLL_FAILURES = 3;

export class ObsService {
  private readonly client = new OBSWebSocket();
  private reconnectDelayMs = 1_000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private currentSettings: ObsConnectionSettings | null = null;
  private started = false;
  private connected = false;
  private consecutivePollFailures = 0;
  private lastStats: ObsStatsSnapshot | null = null;

  constructor(private readonly options: ObsServiceOptions) {
    this.client.on('ConnectionClosed', () => {
      this.handleDisconnected();
      this.scheduleReconnect();
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.currentSettings = this.options.settingsStore.get();
    void this.connectCurrentSettings();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.clearReconnectTimer();
    this.stopPolling();
    if (!this.connected) return;

    try {
      await this.client.disconnect();
    } catch (err) {
      console.warn('[obs] Disconnect error during stop:', err instanceof Error ? err.message : String(err));
      this.handleDisconnected();
    }
  }

  getSettings(): ObsConnectionSettings {
    return this.options.settingsStore.get();
  }

  async saveSettings(input: ObsConnectionSettings): Promise<ObsConnectionSettings> {
    const saved = this.options.settingsStore.save(input);
    this.currentSettings = saved;
    await this.restartConnection();
    return saved;
  }

  async testConnection(input: ObsConnectionSettings): Promise<void> {
    const probe = new OBSWebSocket();
    await probe.connect(this.toUrl(input), input.password || undefined, { rpcVersion: 1 });
    await probe.disconnect();
  }

  private async restartConnection(): Promise<void> {
    this.clearReconnectTimer();
    this.stopPolling();

    if (this.connected) {
      try {
        await this.client.disconnect();
      } catch (err) {
        console.warn('[obs] Disconnect error during restart:', err instanceof Error ? err.message : String(err));
        this.handleDisconnected();
      }
    }

    if (this.started) {
      await this.connectCurrentSettings();
    }
  }

  private async connectCurrentSettings(): Promise<void> {
    const settings = this.currentSettings ?? this.options.settingsStore.get();
    if (!settings.host || !settings.port) return;

    try {
      await this.client.connect(this.toUrl(settings), settings.password || undefined, { rpcVersion: 1 });
      this.connected = true;
      this.consecutivePollFailures = 0;
      this.reconnectDelayMs = 1_000;
      this.options.onConnected();
      await this.emitStats();
      this.startPolling();
    } catch (err) {
      console.warn('[obs] Failed to connect:', err instanceof Error ? err.message : String(err));
      this.handleDisconnected();
      this.scheduleReconnect();
    }
  }

  private handleDisconnected(): void {
    const wasConnected = this.connected;
    this.connected = false;
    this.consecutivePollFailures = 0;
    this.stopPolling();
    this.options.onStats(this.createOfflineStats());
    if (wasConnected) this.options.onDisconnected();
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      void this.emitStats();
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectCurrentSettings();
    }, this.reconnectDelayMs);

    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private async emitStats(): Promise<void> {
    if (!this.connected) {
      this.options.onStats(this.createOfflineStats());
      return;
    }

    try {
      const [streamStatus, stats, scene] = await Promise.all([
        this.client.call('GetStreamStatus') as Promise<Record<string, unknown>>,
        this.client.call('GetStats') as Promise<Record<string, unknown>>,
        this.client.call('GetCurrentProgramScene') as Promise<Record<string, unknown>>,
      ]);

      const outputDuration = this.readNumber(streamStatus.outputDuration);
      const outputBytes = this.readNumber(streamStatus.outputBytes);
      const bitrateKbps =
        outputDuration > 0 ? Math.round(((outputBytes * 8) / Math.max(outputDuration / 1000, 1)) / 1000) : 0;

      const snapshot: ObsStatsSnapshot = {
        connected: true,
        sceneName: this.readString(scene.currentProgramSceneName, 'Unknown'),
        uptimeLabel: this.formatDuration(outputDuration),
        bitrateKbps,
        fps: Math.round(this.readNumber(stats.activeFps)),
        cpuPercent: Math.round(this.readNumber(stats.cpuUsage)),
        ramMb: Math.round(this.readNumber(stats.memoryUsage)),
        droppedFrames: Math.round(this.readNumber(streamStatus.outputSkippedFrames)),
        droppedFramesRender: Math.round(this.readNumber(stats.renderSkippedFrames)),
      };
      this.options.onStats(snapshot);
      this.lastStats = snapshot;
      this.consecutivePollFailures = 0;
    } catch (err) {
      console.warn('[obs] Stats poll failed:', err instanceof Error ? err.message : String(err));
      this.consecutivePollFailures += 1;
      if (this.consecutivePollFailures < MAX_TRANSIENT_POLL_FAILURES) return;
      this.handleDisconnected();
      this.scheduleReconnect();
    }
  }

  private createOfflineStats(): ObsStatsSnapshot {
    const previous = this.lastStats;
    return {
      connected: false,
      sceneName: previous?.sceneName ?? 'Offline',
      uptimeLabel: previous?.uptimeLabel ?? '00:00:00',
      bitrateKbps: previous?.bitrateKbps ?? 0,
      fps: previous?.fps ?? 0,
      cpuPercent: previous?.cpuPercent ?? 0,
      ramMb: previous?.ramMb ?? 0,
      droppedFrames: previous?.droppedFrames ?? 0,
      droppedFramesRender: previous?.droppedFramesRender ?? 0,
    };
  }

  private toUrl(settings: ObsConnectionSettings): string {
    return `ws://${settings.host}:${settings.port}`;
  }

  private readNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private readString(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  private formatDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600)
      .toString()
      .padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const seconds = Math.floor(totalSeconds % 60)
      .toString()
      .padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }
}
