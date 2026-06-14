import { useEffect, useState } from 'react';
import type { ObsStatsSnapshot, PlatformLiveEntry, TwitchLiveStats } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { getPlatformProviderOrFallback } from '../platforms/registry.js';

interface ObsStatsPanelProps {
  stats: ObsStatsSnapshot;
  /** Uniform live entries from the registry — drives the viewer cards. */
  liveEntries: PlatformLiveEntry[];
  /** Twitch-only hype-train slice (no cross-platform analog). */
  twitchLiveStatsByChannel: Record<string, TwitchLiveStats>;
}

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
    <div className="border-b border-gray-800 p-4 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-200">OBS Studio</h2>
          <span className={`text-xs font-medium ${stats.connected ? 'text-cyan-400' : 'text-gray-500'}`}>
            {stats.connected ? t('CONNECTED') : t('OFFLINE')}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {t('Scene')}: <span className="text-gray-300">{stats.sceneName}</span>
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
          <div className="text-base font-mono font-bold text-violet-400">{stats.uptimeLabel}</div>
          <div className="text-xs text-gray-500 mt-0.5">{t('Time')}</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
          <div className="text-base font-mono font-bold text-red-400">{stats.droppedFrames}</div>
          <div className="text-xs text-gray-500 mt-0.5 leading-tight">{t('Dropped Frames')}<br />({t('network')})</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
          <div className="text-base font-mono font-bold text-orange-400">{stats.droppedFrames}</div>
          <div className="text-xs text-gray-500 mt-0.5 leading-tight">{t('Dropped Frames')}<br />({t('encoder')})</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
          <div className="text-base font-mono font-bold text-yellow-400">{stats.droppedFramesRender}</div>
          <div className="text-xs text-gray-500 mt-0.5 leading-tight">{t('Dropped Frames')}<br />({t('render')})</div>
        </div>

        {liveEntries.length > 0 ? (
          <div className="col-span-4 grid grid-cols-2 gap-2">
            {liveEntries.map((entry) => (
              <ViewerCard
                key={entry.key}
                label={entry.cardLabel}
                meta={getPlatformProviderOrFallback(entry.platformId)}
                value={entry.value}
                valueLabel={t(entry.valueLabel)}
                isLive={entry.isLive}
                secondaryValue={entry.secondaryValue}
                secondaryLabel={entry.secondaryLabel ? t(entry.secondaryLabel) : undefined}
              />
            ))}
          </div>
        ) : null}

        {/* Hype Train Indicator */}
        {hype && (
          <div className="col-span-4 mt-2 bg-gradient-to-r from-purple-900/40 to-blue-900/40 border border-purple-500/30 rounded-lg p-2.5 shadow-lg shadow-purple-500/5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base leading-none">🚂</span>
                <span className="text-[10px] font-bold text-purple-200 uppercase tracking-widest">{t('Hype Train lvl')} {hype.level}</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/20">
                {timeLeft}
              </span>
            </div>
            <div className="relative h-1.5 bg-gray-950 rounded-full overflow-hidden border border-white/5">
              <div 
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-purple-500 via-blue-400 to-cyan-400 transition-all duration-1000 ease-out"
                style={{ width: `${Math.min(100, (hype.progress / hype.goal) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-tighter">
              <span className="text-purple-400/80">{hype.progress.toLocaleString()} pts</span>
              <span>{t('Goal')}: {hype.goal.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ViewerCard({
  label,
  meta,
  value,
  isLive,
  secondaryValue,
  secondaryLabel,
  valueLabel = 'viewers',
}: {
  label: string;
  meta: import('../platforms/registry.js').PlatformProvider;
  value: string;
  isLive?: boolean;
  secondaryValue?: string;
  secondaryLabel?: string;
  valueLabel?: string;
}) {
  return (
    <div className={`border rounded-lg p-2.5 text-center ${meta.card.classes}`}>
      <div className="flex items-center justify-center gap-1 mb-0.5">
        <svg className={`w-3 h-3 ${meta.card.metaClass}`} viewBox="0 0 24 24" fill="currentColor">
          <path d={meta.icon} />
        </svg>
        <span className={`text-xs ${meta.card.metaClass}`}>{label}</span>
        {isLive ? <span className="text-[10px] text-red-400 font-bold ml-0.5">LIVE</span> : null}
      </div>
      <div className="text-base font-mono font-bold">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{valueLabel}</div>
      {secondaryValue !== undefined && secondaryLabel ? (
        <div className="text-xs mt-0.5">
          <span className={meta.card.metaClass}>{secondaryValue}</span> <span className="text-gray-500">{secondaryLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
