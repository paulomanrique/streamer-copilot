import type {
  LiveOutputConfig,
  LiveOutputDestinationConfig,
  LiveOutputFeatureDescriptor,
  LiveOutputKind,
  PlatformStreamCapability,
} from '../../shared/types.js';

const DEFAULT_STYLE = {
  backgroundColor: '#111827',
  backgroundOpacity: 0.72,
  borderRadius: 12,
  borderColor: '#374151',
  borderWidth: 1,
  fontFamily: 'system',
  fontColor: '#f9fafb',
  fontSize: 24,
  accentColor: '#8b5cf6',
};

function destinations(descriptor: LiveOutputFeatureDescriptor): LiveOutputDestinationConfig {
  return {
    file: { enabled: true, relativePath: descriptor.defaultFileRelativePath },
    browser: { enabled: true, style: { ...DEFAULT_STYLE } },
  };
}

function base(descriptor: LiveOutputFeatureDescriptor) {
  return {
    id: descriptor.defaultId,
    kind: descriptor.kind,
    enabled: false,
    startOnProfileLoad: false,
    destinations: destinations(descriptor),
  };
}

export function createDefaultLiveOutput(
  descriptor: LiveOutputFeatureDescriptor,
  platformCapabilities: PlatformStreamCapability[],
): LiveOutputConfig | null {
  const common = base(descriptor);
  switch (descriptor.kind) {
    case 'time':
      return { ...common, kind: 'time', format: 'Time: $h:$m:$s', use24Hour: true, removeLeadingHourZero: true, timeZone: 'system' };
    case 'date':
      return { ...common, kind: 'date', template: 'Today: $date', dateFormat: 'dddd dd MMMM yyyy', locale: 'system', timeZone: 'system' };
    case 'countdown': {
      const tomorrow = new Date(Date.now() + 86_400_000);
      tomorrow.setMilliseconds(0);
      return {
        ...common, kind: 'countdown', format: '$d:$h:$m:$s', targetAt: tomorrow.toISOString(),
        useTodayOnProfileLoad: false, doubleDigits: true, omitLeadingZeroUnits: false,
        timeZone: 'system', doneText: 'Countdown complete', playSound: false, soundPath: null,
      };
    }
    case 'chrono-down':
      return {
        ...common, kind: 'chrono-down', format: '$h:$m:$s', initialSeconds: 300,
        adjustmentMinutes: 1, doubleDigits: true, omitLeadingZeroUnits: false,
        startChronoUpOnComplete: false, doneText: 'Time is up', playSound: false, soundPath: null,
      };
    case 'chrono-up':
      return {
        ...common, kind: 'chrono-up', format: '$h:$m:$s', initialSeconds: 0,
        adjustmentMinutes: 1, useDays: false, resetOnStart: false,
      };
    case 'text-rotator':
      return {
        ...common, kind: 'text-rotator', intervalSeconds: 5, order: 'sequential', loop: true,
        lines: [{ id: 'line-1', text: 'Welcome to the stream!', enabled: true, allowEmpty: false }],
      };
    case 'system-info':
      return {
        ...common, kind: 'system-info', format: 'CPU: $CPU_USAGE% | RAM: $RAM_%_IN_USE%',
        sampleIntervalSeconds: 1, networkEnabled: false, networkInterfaceId: null,
        roundRamUsedPercent: true, roundRamAvailablePercent: true,
      };
    case 'platform-live': {
      const capability = platformCapabilities.find((item) => item.targets.length > 0 && item.metrics.length > 0);
      const target = capability?.targets[0];
      const metric = capability?.metrics[0];
      if (!capability || !target || !metric) return null;
      return {
        ...common, kind: 'platform-live', platformId: target.platformId, accountId: target.accountId,
        channelId: target.channelId, metricId: metric.id, format: metric.token,
        refreshSeconds: metric.minimumRefreshSeconds,
      };
    }
    case 'playing-now':
      return {
        ...common, kind: 'playing-now', format: "$artist - '$song'\n$album", noMediaText: 'No media playing',
        sourceMode: 'auto', sourceId: null, fallbackToSystemSession: true,
        truncate: { artist: 0, song: 0, album: 0 }, writeSeparateFiles: true,
        writeJson: true, writeArtwork: true, overlayLayout: 'artwork-left',
        showProgress: true, spotifyEnrichmentEnabled: false,
      };
  }
}

export function findOutputByKind(outputs: LiveOutputConfig[], kind: LiveOutputKind): LiveOutputConfig | null {
  return outputs.find((output) => output.kind === kind) ?? null;
}
