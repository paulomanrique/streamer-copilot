import type {
  ChronoDownLiveOutputConfig,
  ChronoUpLiveOutputConfig,
  CountdownLiveOutputConfig,
  DateLiveOutputConfig,
  LiveOutputConfig,
  LiveOutputDestinationConfig,
  LiveOutputHotkeyAction,
  LiveOutputsSettings,
  PlayingNowLiveOutputConfig,
  SystemInfoLiveOutputConfig,
  TextRotatorLiveOutputConfig,
  TimeLiveOutputConfig,
} from '../../shared/types.js';

const defaultStyle = () => ({
  backgroundColor: '#111827',
  backgroundOpacity: 0.8,
  borderRadius: 12,
  borderColor: '#374151',
  borderWidth: 1,
  fontColor: '#f9fafb',
  fontSize: 28,
  accentColor: '#22d3ee',
});

function destinations(relativePath: string): LiveOutputDestinationConfig {
  return {
    file: { enabled: true, relativePath },
    browser: { enabled: true, style: defaultStyle() },
  };
}

export function createDefaultTimeOutput(): TimeLiveOutputConfig {
  return {
    id: 'time', kind: 'time', enabled: false, startOnProfileLoad: true,
    destinations: destinations('TextFiles/Time.txt'),
    format: 'Time: $h:$m:$s', use24Hour: true, removeLeadingHourZero: false, timeZone: 'system',
  };
}

export function createDefaultDateOutput(): DateLiveOutputConfig {
  return {
    id: 'date', kind: 'date', enabled: false, startOnProfileLoad: true,
    destinations: destinations('TextFiles/Date.txt'),
    template: 'Today: $date', dateFormat: 'dddd dd MMMM yyyy', locale: 'system', timeZone: 'system',
  };
}

export function createDefaultCountdownOutput(): CountdownLiveOutputConfig {
  return {
    id: 'countdown', kind: 'countdown', enabled: false, startOnProfileLoad: false,
    destinations: destinations('TextFiles/Countdown.txt'),
    format: '$d:$h:$m:$s', targetAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    useTodayOnProfileLoad: false, doubleDigits: true, omitLeadingZeroUnits: false, timeZone: 'system',
    doneText: 'Countdown is done!', playSound: false, soundPath: null,
  };
}

export function createDefaultChronoDownOutput(): ChronoDownLiveOutputConfig {
  return {
    id: 'chrono-down', kind: 'chrono-down', enabled: false, startOnProfileLoad: false,
    destinations: destinations('TextFiles/ChronoDown.txt'),
    format: '$h:$m:$s', initialSeconds: 300, adjustmentMinutes: 1,
    doubleDigits: true, omitLeadingZeroUnits: false, startChronoUpOnComplete: false,
    doneText: 'Chrono Down is done!', playSound: false, soundPath: null,
  };
}

export function createDefaultChronoUpOutput(): ChronoUpLiveOutputConfig {
  return {
    id: 'chrono-up', kind: 'chrono-up', enabled: false, startOnProfileLoad: false,
    destinations: destinations('TextFiles/ChronoUp.txt'),
    format: '$h:$m:$s', initialSeconds: 0, adjustmentMinutes: 1, useDays: false, resetOnStart: false,
  };
}

export function createDefaultTextRotatorOutput(): TextRotatorLiveOutputConfig {
  return {
    id: 'text-rotator', kind: 'text-rotator', enabled: false, startOnProfileLoad: false,
    destinations: destinations('TextFiles/LineChangerExt.txt'),
    intervalSeconds: 5, order: 'sequential', loop: true, lines: [],
  };
}

export function createDefaultSystemInfoOutput(): SystemInfoLiveOutputConfig {
  return {
    id: 'system-info', kind: 'system-info', enabled: false, startOnProfileLoad: true,
    destinations: destinations('TextFiles/SystemInfo.txt'),
    format: 'CPU: $CPU_USAGE% | RAM: $RAM_%_IN_USE%', sampleIntervalSeconds: 1,
    networkEnabled: true, networkInterfaceId: null,
    roundRamUsedPercent: true, roundRamAvailablePercent: true,
  };
}

export function createDefaultPlayingNowOutput(): PlayingNowLiveOutputConfig {
  return {
    id: 'playing-now', kind: 'playing-now', enabled: false, startOnProfileLoad: true,
    destinations: destinations('TextFiles/TrackInfo.txt'),
    format: "$artist - '$song'\n$album", noMediaText: '', sourceMode: 'auto', sourceId: null,
    fallbackToSystemSession: true, truncate: { artist: 0, song: 0, album: 0 },
    writeSeparateFiles: false, writeJson: true, writeArtwork: true,
    overlayLayout: 'artwork-left', showProgress: true, spotifyEnrichmentEnabled: false,
  };
}

export function createDefaultLiveOutputs(): LiveOutputConfig[] {
  return [
    createDefaultTimeOutput(),
    createDefaultDateOutput(),
    createDefaultCountdownOutput(),
    createDefaultChronoDownOutput(),
    createDefaultChronoUpOutput(),
    createDefaultTextRotatorOutput(),
    createDefaultSystemInfoOutput(),
    createDefaultPlayingNowOutput(),
  ];
}

const HOTKEY_ACTIONS: LiveOutputHotkeyAction[] = [
  'chrono-down.toggle', 'chrono-down.stop', 'chrono-down.increment', 'chrono-down.decrement',
  'chrono-up.toggle', 'chrono-up.stop', 'chrono-up.increment', 'chrono-up.decrement',
];

export function createDefaultLiveOutputsSettings(): LiveOutputsSettings {
  return {
    schemaVersion: 1,
    hotkeysEnabled: false,
    hotkeys: HOTKEY_ACTIONS.map((action) => ({ action, accelerator: null })),
    outputs: createDefaultLiveOutputs(),
    metadataPresets: [],
  };
}
