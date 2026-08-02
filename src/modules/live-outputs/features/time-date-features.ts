import type { DateLiveOutputConfig, TimeLiveOutputConfig } from '../../../shared/types.js';
import type { LiveOutputFeature, LiveOutputFeatureRuntime } from '../feature-registry.js';
import { descriptor } from '../feature-registry.js';
import { applyTemplate, formatDotNetDate, renderClock } from '../template-engine.js';

const passiveRuntime = (enabled: boolean): LiveOutputFeatureRuntime => ({
  status: enabled ? 'running' : 'disabled',
  data: {},
});

export const timeFeature: LiveOutputFeature<TimeLiveOutputConfig> = {
  descriptor: descriptor('time', 'time', 'TextFiles/Time.txt', [
    ['$h', 'Hour', '21'], ['$m', 'Minute', '05'], ['$s', 'Second', '09'], ['$tt', 'AM/PM', 'PM'],
  ], []),
  createRuntime: (config) => passiveRuntime(config.enabled),
  tick(config, _runtime, now) {
    return {
      status: config.enabled ? 'running' : 'disabled',
      renderedText: config.enabled ? renderClock(new Date(now), config) : '',
      nextTransitionAt: new Date(Math.floor(now / 1_000) * 1_000 + 1_000).toISOString(),
      details: {},
    };
  },
};

export const dateFeature: LiveOutputFeature<DateLiveOutputConfig> = {
  descriptor: descriptor('date', 'date', 'TextFiles/Date.txt', [
    ['$date', 'Formatted date', 'Sunday 02 August 2026'],
  ], []),
  createRuntime: (config) => passiveRuntime(config.enabled),
  tick(config, _runtime, now) {
    const formatted = formatDotNetDate(new Date(now), config.dateFormat, config.locale, config.timeZone);
    return {
      status: config.enabled ? 'running' : 'disabled',
      renderedText: config.enabled ? applyTemplate(config.template, { '$date': formatted }) : '',
      nextTransitionAt: new Date(Math.floor(now / 1_000) * 1_000 + 1_000).toISOString(),
      details: { formattedDate: formatted },
    };
  },
};
