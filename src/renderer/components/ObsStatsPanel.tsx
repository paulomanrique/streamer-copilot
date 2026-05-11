import { useEffect, useState } from 'react';
import type { KickConnectionStatus, KickLiveStats, ObsStatsSnapshot, TikTokConnectionStatus, TikTokLiveStats, TwitchLiveStats, YouTubeStreamInfo } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { getPlatformProviderOrFallback } from '../platforms/registry.js';

interface ObsStatsPanelProps {
  stats: ObsStatsSnapshot;
  twitchLiveStatsByChannel: Record<string, TwitchLiveStats>;
  /** Distinct channels currently connected via the Twitch multi-adapter,
   *  in stable order (insertion). Drives one ViewerCard per channel even
   *  before the first stats poll lands. */
  twitchConnectedChannels: string[];
  twitchConnected: boolean;
  youtubeStreams: YouTubeStreamInfo[];
  tiktokStatus: TikTokConnectionStatus;
  tiktokUsername: string | null;
  /** Per-username TikTok stats — drives one ViewerCard per connected host. */
  tiktokLiveStatsByUsername: Record<string, TikTokLiveStats>;
  kickStatus: KickConnectionStatus;
  kickSlug: string | null;
  /** Per-channel Kick stats — drives one ViewerCard per connected channel. */
  kickLiveStatsByChannel: Record<string, KickLiveStats>;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function ObsStatsPanel({ stats, twitchLiveStatsByChannel, twitchConnectedChannels, twitchConnected, youtubeStreams, tiktokStatus, tiktokUsername, tiktokLiveStatsByUsername, kickStatus, kickSlug, kickLiveStatsByChannel }: ObsStatsPanelProps) {
  const { t } = useI18n();

  // Hype train is per-channel — pick whichever channel currently has one.
  // Multi-channel hype is rare enough that one indicator is fine.
  const hype = twitchConnectedChannels
    .map((c) => twitchLiveStatsByChannel[c]?.hypeTrain)
    .find((h): h is NonNullable<typeof h> => Boolean(h)) ?? null;
  const hasMultipleTwitch = twitchConnectedChannels.length > 1;
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

  // Stream labels are computed in the main process by computeYouTubeStreamLabels —
  // the card just renders what's resolved (channel handle, Horizontal/Vertical,
  // or the YouTube-N fallback). Avoids re-deriving from platform here, which
  // can't tell channels apart.
  const resolveYouTubeCardLabel = (stream: YouTubeStreamInfo): string => stream.label || 'YouTube';

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

        {(() => {
          const tiktokUsernames = Object.keys(tiktokLiveStatsByUsername);
          const tiktokFallback = tiktokStatus === 'connected' && tiktokUsernames.length === 0 && tiktokUsername ? [tiktokUsername] : [];
          const tiktokConnectedUsernames = tiktokUsernames.length > 0 ? tiktokUsernames : tiktokFallback;
          const hasMultipleTiktok = tiktokConnectedUsernames.length > 1;

          const kickChannels = Object.keys(kickLiveStatsByChannel);
          const kickFallback = kickStatus === 'connected' && kickChannels.length === 0 && kickSlug ? [kickSlug] : [];
          const kickConnectedChannels = kickChannels.length > 0 ? kickChannels : kickFallback;
          const hasMultipleKick = kickConnectedChannels.length > 1;

          const anyConnected = twitchConnected
            || youtubeStreams.length > 0
            || tiktokConnectedUsernames.length > 0
            || kickConnectedChannels.length > 0;
          if (!anyConnected) return null;

          return (
            <div className="col-span-4 grid grid-cols-2 gap-2">
              {twitchConnectedChannels.map((channel) => {
                const channelStats = twitchLiveStatsByChannel[channel] ?? null;
                const meta = getPlatformProviderOrFallback('twitch');
                return (
                  <ViewerCard
                    key={`twitch-${channel}`}
                    label={hasMultipleTwitch ? `Twitch · ${channel}` : 'Twitch'}
                    meta={meta}
                    value={channelStats ? fmtNum(channelStats.viewerCount) : '0'}
                    isLive={!!channelStats?.isLive}
                    secondaryValue={channelStats ? fmtNum(channelStats.followerCount) : undefined}
                    secondaryLabel={t('followers')}
                  />
                );
              })}
              {youtubeStreams.map((stream) => (
                <ViewerCard
                  key={stream.videoId}
                  label={resolveYouTubeCardLabel(stream)}
                  meta={getPlatformProviderOrFallback(stream.platform)}
                  value={stream.viewerCount !== null ? fmtNum(stream.viewerCount) : '—'}
                  isLive
                  secondaryValue={stream.subscriberCount !== null ? fmtNum(stream.subscriberCount) : '—'}
                  secondaryLabel={t('subscribers')}
                />
              ))}
              {tiktokConnectedUsernames.map((username) => {
                const usernameStats = tiktokLiveStatsByUsername[username] ?? null;
                return (
                  <ViewerCard
                    key={`tiktok-${username}`}
                    label={hasMultipleTiktok ? `TikTok · @${username}` : 'TikTok'}
                    meta={getPlatformProviderOrFallback('tiktok')}
                    value={usernameStats ? fmtNum(usernameStats.viewerCount) : '—'}
                    valueLabel={t('viewers')}
                    isLive
                  />
                );
              })}
              {kickConnectedChannels.map((channel) => {
                const channelStats = kickLiveStatsByChannel[channel] ?? null;
                return (
                  <ViewerCard
                    key={`kick-${channel}`}
                    label={hasMultipleKick ? `Kick · ${channel}` : 'Kick'}
                    meta={getPlatformProviderOrFallback('kick')}
                    value={channelStats ? fmtNum(channelStats.viewerCount) : '—'}
                    valueLabel={t('viewers')}
                    isLive={channelStats?.isLive ?? true}
                    secondaryValue={channelStats?.followerCount !== null && channelStats?.followerCount !== undefined
                      ? fmtNum(channelStats.followerCount)
                      : channelStats?.subscriberCount !== null && channelStats?.subscriberCount !== undefined
                        ? fmtNum(channelStats.subscriberCount)
                      : '—'}
                    secondaryLabel={channelStats?.followerCount !== null && channelStats?.followerCount !== undefined
                      ? t('followers')
                      : t('subscribers')}
                  />
                );
              })}
            </div>
          );
        })()}

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
