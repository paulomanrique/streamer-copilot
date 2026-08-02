import type { SystemInfoLiveOutputConfig } from '../../../shared/types.js';
import type { LiveOutputFeature, LiveOutputFeatureRuntime } from '../feature-registry.js';
import { descriptor } from '../feature-registry.js';
import { applyTemplate } from '../template-engine.js';
import { SystemMetricsSampler, type SystemMetricsSnapshot } from '../system/system-metrics-sampler.js';

interface SystemRuntimeData {
  dueAt: number;
  metrics: SystemMetricsSnapshot | null;
}

function runtimeData(runtime: LiveOutputFeatureRuntime): SystemRuntimeData {
  return runtime.data as unknown as SystemRuntimeData;
}

function rate(bytes: number): string {
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  let value = Math.max(0, bytes) * 8;
  let unit = 0;
  while (value >= 1_000 && unit < units.length - 1) { value /= 1_000; unit += 1; }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function createSystemInfoFeature(sampler = new SystemMetricsSampler()): LiveOutputFeature<SystemInfoLiveOutputConfig> {
  return {
    descriptor: descriptor('system-info', 'system-info', 'TextFiles/SystemInfo.txt', [
      ['$CPU_USAGE', 'CPU usage percentage', '28'],
      ['$RAM_MB_AVAIL', 'Available RAM in MB', '8192'],
      ['$RAM_%_IN_USE', 'RAM percentage in use', '62'],
      ['$RAM_%_AVAIL', 'RAM percentage available', '38'],
      ['$AMOUNT_PROCESSES', 'Running process count', '214'],
      ['$UPLOAD', 'Upload rate', '1.2 MB/s'],
      ['$DOWNLOAD', 'Download rate', '8.4 MB/s'],
    ], []),
    createRuntime(config, now) {
      return { status: config.enabled ? 'running' : 'disabled', data: { dueAt: now, metrics: null } };
    },
    async tick(config, runtime, now) {
      const data = runtimeData(runtime);
      if (!config.enabled) return { status: 'disabled', renderedText: '', nextTransitionAt: null, details: {} };
      if (!data.metrics || now >= data.dueAt) {
        data.metrics = await sampler.sample(config.networkEnabled, config.networkInterfaceId);
        data.dueAt = now + config.sampleIntervalSeconds * 1_000;
      }
      const metrics = data.metrics;
      const used = config.roundRamUsedPercent ? Math.round(metrics.ramPercentInUse) : Number(metrics.ramPercentInUse.toFixed(1));
      const available = config.roundRamAvailablePercent ? Math.round(metrics.ramPercentAvailable) : Number(metrics.ramPercentAvailable.toFixed(1));
      const renderedText = applyTemplate(config.format, {
        '$CPU_USAGE': String(Math.round(metrics.cpuUsage)),
        '$RAM_MB_AVAIL': String(Math.round(metrics.ramMbAvailable)),
        '$RAM_%_IN_USE': String(used),
        '$RAM_%_AVAIL': String(available),
        '$AMOUNT_PROCESSES': String(metrics.processCount),
        '$UPLOAD': rate(metrics.uploadBytesPerSecond),
        '$DOWNLOAD': rate(metrics.downloadBytesPerSecond),
      });
      return {
        status: metrics.networkError && config.networkEnabled ? 'degraded' : 'running',
        renderedText,
        nextTransitionAt: new Date(data.dueAt).toISOString(),
        details: metrics as unknown as Record<string, unknown>,
      };
    },
  };
}
