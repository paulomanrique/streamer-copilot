import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ObsStatsSnapshot, PlatformLiveEntry, TwitchLiveStats } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { getPlatformProviderOrFallback, type PlatformProvider } from '../platforms/registry.js';

interface ObsStatsPanelProps {
  stats: ObsStatsSnapshot;
  /** Uniform live entries from the registry — drives the viewer chips. */
  liveEntries: PlatformLiveEntry[];
  /** Twitch-only hype-train slice (no cross-platform analog). */
  twitchLiveStatsByChannel: Record<string, TwitchLiveStats>;
}

/** Compact, single-row stream stats for the top bar: OBS (scene, uptime,
 *  dropped frames), one chip per live entry and the hype train when one runs. */
export function ObsStatsPanel({ stats, liveEntries, twitchLiveStatsByChannel }: ObsStatsPanelProps) {
  const { t } = useI18n();

  // Hype train is Twitch-only and per-channel — pick whichever channel
  // currently has one. Multi-channel hype is rare enough that one indicator
  // is fine.
  const hype = Object.values(twitchLiveStatsByChannel)
    .map((s) => s?.hypeTrain)
    .find((h): h is NonNullable<typeof h> => Boolean(h)) ?? null;
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!hype) {
      setTimeLeft('');
      return;
    }

    const update = () => {
      const remaining = new Date(hype.expiry).getTime() - Date.now();
      if (remaining <= 0) {
        setTimeLeft('0s');
        return;
      }
      const s = Math.floor(remaining / 1000);
      const m = Math.floor(s / 60);
      setTimeLeft(`${m}:${(s % 60).toString().padStart(2, '0')}`);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [hype]);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex items-center gap-4 h-9 px-3 rounded-lg bg-gray-800/60 border border-gray-700/50 shrink-0">
        <div className="flex items-center gap-1.5" title={stats.connected ? t('CONNECTED') : t('OFFLINE')}>
          <span className={`w-2 h-2 rounded-full ${stats.connected ? 'bg-cyan-400' : 'bg-gray-600'}`} />
          <span className="text-xs font-semibold text-gray-300">OBS</span>
        </div>
        <Stat label={t('Scene')}>
          <span className="block max-w-[160px] truncate text-gray-200" title={stats.sceneName}>{stats.sceneName}</span>
        </Stat>
        <Stat label={t('Time')}>
          <span className="font-mono text-violet-400">{stats.uptimeLabel}</span>
        </Stat>
        <Stat label={`${t('Dropped Frames')} (${t('network')})`} short={t('network')}>
          <span className="font-mono text-red-400">{stats.droppedFrames}</span>
        </Stat>
        <Stat label={`${t('Dropped Frames')} (${t('render')})`} short={t('render')}>
          <span className="font-mono text-yellow-400">{stats.droppedFramesRender}</span>
        </Stat>
      </div>

      {liveEntries.map((entry) => (
        <ViewerChip
          key={entry.key}
          label={entry.cardLabel}
          meta={getPlatformProviderOrFallback(entry.platformId)}
          value={entry.value}
          valueLabel={t(entry.valueLabel)}
          isLive={entry.isLive}
          secondaryValue={entry.secondaryValue}
          secondaryLabel={entry.secondaryLabel ? t(entry.secondaryLabel) : undefined}
          compactStats={entry.compactStats?.map((stat) => ({
            ...stat,
            label: t(stat.label),
            accessibleValue: stat.value === '—' ? t('unavailable') : stat.value,
          }))}
        />
      ))}

      {hype && (
        <div
          className="relative flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-lg overflow-hidden bg-gradient-to-r from-purple-900/40 to-blue-900/40 border border-purple-500/30 shrink-0"
          title={`${hype.progress.toLocaleString()} / ${hype.goal.toLocaleString()} pts`}
        >
          <span className="text-base leading-none">🚂</span>
          <div className="flex flex-col leading-none">
            <span className="text-[10px] font-bold text-purple-200 uppercase tracking-wider">{t('Hype Train lvl')} {hype.level}</span>
            <span className="text-[10px] font-mono font-bold text-purple-300 mt-1">{timeLeft}</span>
          </div>
          <div className="absolute left-0 bottom-0 h-0.5 w-full bg-gray-950/60">
            <div
              className="h-full bg-gradient-to-r from-purple-500 via-blue-400 to-cyan-400 transition-all duration-1000 ease-out"
              style={{ width: `${Math.min(100, (hype.progress / hype.goal) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Two-line stat: tiny caption over the value. `short` is the visible caption
 *  when the full label is too long for the bar; the full one stays in the tooltip. */
function Stat({ label, short, children }: { label: string; short?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col leading-none min-w-0" title={label}>
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">{short ?? label}</span>
      <span className="text-xs font-bold mt-1">{children}</span>
    </div>
  );
}

function ViewerChip({
  label,
  meta,
  value,
  isLive,
  secondaryValue,
  secondaryLabel,
  compactStats,
  valueLabel = 'viewers',
}: {
  label: string;
  meta: PlatformProvider;
  value: string;
  isLive?: boolean;
  secondaryValue?: string;
  secondaryLabel?: string;
  compactStats?: Array<{
    shortLabel: string;
    value: string;
    label: string;
    accessibleValue: string;
  }>;
  valueLabel?: string;
}) {
  return (
    <div className={`flex items-center gap-2 h-9 px-2.5 border rounded-lg shrink-0 ${meta.card.classes}`}>
      <svg className={`w-3.5 h-3.5 shrink-0 ${meta.card.metaClass}`} viewBox="0 0 24 24" fill="currentColor">
        <path d={meta.icon} />
      </svg>
      <div className="flex flex-col leading-none">
        <span className={`flex items-center gap-1 text-[10px] ${meta.card.metaClass}`}>
          {label}
          {isLive ? <span className="w-1.5 h-1.5 rounded-full bg-red-500 pulse-dot" title="LIVE" /> : null}
        </span>
        {compactStats && compactStats.length > 0 ? (
          <span className="mt-1 flex items-center gap-1 text-xs font-mono font-bold tabular-nums whitespace-nowrap">
            {compactStats.map((stat, index) => (
              <span
                key={`${stat.shortLabel}:${stat.label}`}
                className="inline-flex items-center gap-0.5"
                title={`${stat.label}: ${stat.accessibleValue}`}
                aria-label={`${stat.label}: ${stat.accessibleValue}`}
              >
                {index > 0 ? <span aria-hidden="true" className="mr-0.5 text-gray-600">/</span> : null}
                <span aria-hidden="true" className={meta.card.metaClass}>{stat.shortLabel}</span>
                <span aria-hidden="true">{stat.value}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="mt-1 text-xs font-mono font-bold whitespace-nowrap">
            {value}
            <span className="ml-1 font-sans font-normal text-[10px] text-gray-500">{valueLabel}</span>
            {secondaryValue !== undefined && secondaryLabel ? (
              <span className="ml-1.5 font-sans font-normal text-[10px]" title={secondaryLabel}>
                <span className={meta.card.metaClass}>{secondaryValue}</span> <span className="text-gray-500">{secondaryLabel}</span>
              </span>
            ) : null}
          </span>
        )}
      </div>
    </div>
  );
}
