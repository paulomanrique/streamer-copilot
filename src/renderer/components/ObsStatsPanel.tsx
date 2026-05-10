import { useEffect, useState } from 'react';
import type { KickConnectionStatus, KickLiveStats, ObsStatsSnapshot, TikTokConnectionStatus, TikTokLiveStats, TwitchLiveStats, YouTubeStreamInfo } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';

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

const ICONS = {
  twitch: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
  youtube: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
  kick: 'M2 2h4v8l4-4h4l-6 6 6 6h-4l-4-4v4H2V2zm14 0h4v20h-4z',
  tiktok: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.67a8.17 8.17 0 0 0 4.79 1.53V6.75a4.85 4.85 0 0 1-1.02-.06z',
} as const;

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
                return (
                  <ViewerCard
                    key={`twitch-${channel}`}
                    label={hasMultipleTwitch ? `Twitch · ${channel}` : 'Twitch'}
                    icon={ICONS.twitch}
                    classes="bg-purple-500/10 border-purple-500/20 text-purple-300"
                    metaClass="text-purple-400"
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
                  icon={ICONS.youtube}
                  classes={stream.platform === 'youtube-v'
                    ? 'bg-rose-400/10 border-rose-400/20 text-rose-300'
                    : 'bg-red-500/10 border-red-500/20 text-red-300'}
                  metaClass={stream.platform === 'youtube-v' ? 'text-rose-400' : 'text-red-400'}
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
                    icon={ICONS.tiktok}
                    classes="bg-pink-500/10 border-pink-500/20 text-pink-300"
                    metaClass="text-pink-400"
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
                    icon={ICONS.kick}
                    classes="bg-green-500/10 border-green-500/20 text-green-300"
                    metaClass="text-green-400"
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
  icon,
  classes,
  metaClass,
  value,
  isLive,
  secondaryValue,
  secondaryLabel,
  valueLabel = 'viewers',
}: {
  label: string;
  icon: string;
  classes: string;
  metaClass: string;
  value: string;
  isLive?: boolean;
  secondaryValue?: string;
  secondaryLabel?: string;
  valueLabel?: string;
}) {
  return (
    <div className={`border rounded-lg p-2.5 text-center ${classes}`}>
      <div className="flex items-center justify-center gap-1 mb-0.5">
        <svg className={`w-3 h-3 ${metaClass}`} viewBox="0 0 24 24" fill="currentColor">
          <path d={icon} />
        </svg>
        <span className={`text-xs ${metaClass}`}>{label}</span>
        {isLive ? <span className="text-[10px] text-red-400 font-bold ml-0.5">LIVE</span> : null}
      </div>
      <div className="text-base font-mono font-bold">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{valueLabel}</div>
      {secondaryValue !== undefined && secondaryLabel ? (
        <div className="text-xs mt-0.5">
          <span className={metaClass}>{secondaryValue}</span> <span className="text-gray-500">{secondaryLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
