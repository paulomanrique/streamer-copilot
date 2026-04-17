import type { KickConnectionStatus, TikTokConnectionStatus, TwitchConnectionStatus, YouTubeStreamInfo } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';

interface StatusBarProps {
  activeProfileName: string;
  obsConnected: boolean;
  twitchStatus: TwitchConnectionStatus;
  twitchChannel: string | null;
  youtubeStreams: YouTubeStreamInfo[];
  tiktokStatus: TikTokConnectionStatus;
  tiktokUsername: string | null;
  kickStatus: KickConnectionStatus;
  kickSlug: string | null;
}

const TWITCH_DOT: Record<TwitchConnectionStatus, string> = {
  disconnected: 'bg-gray-600',
  connecting: 'bg-yellow-400 animate-pulse',
  connected: 'bg-purple-500 pulse-dot',
  error: 'bg-red-500',
};

export function StatusBar({ activeProfileName, obsConnected, twitchStatus, twitchChannel, youtubeStreams, tiktokStatus, tiktokUsername, kickStatus, kickSlug }: StatusBarProps) {
  const { messages, t } = useI18n();
  const statusLabel = (status: TwitchConnectionStatus | TikTokConnectionStatus | KickConnectionStatus) => {
    if (status === 'connecting') return t('Connecting...');
    return messages.common.status[status] ?? status;
  };
  const twitchLabel = twitchStatus === 'connected' && twitchChannel
    ? `#${twitchChannel}`
    : statusLabel(twitchStatus);
  const liveYoutubeChannels = Array.from(
    new Set(
      youtubeStreams
        .map((stream) => stream.channelHandle)
        .filter((channel): channel is string => Boolean(channel)),
    ),
  );
  const youtubeLabel = liveYoutubeChannels.length > 0
    ? liveYoutubeChannels.join(', ')
    : messages.common.status.offline;

  return (
    <footer className="h-8 bg-gray-900 border-t border-gray-800 flex items-center px-4 gap-4 shrink-0 text-xs text-gray-500">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${TWITCH_DOT[twitchStatus]}`} />
        <span>
          Twitch: <span className="text-gray-300">{twitchLabel}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 ml-2">
        <span className={`w-2 h-2 rounded-full ${obsConnected ? 'bg-cyan-500' : 'bg-gray-600'}`} />
        <span>
          OBS: <span className="text-gray-300">{obsConnected ? messages.common.status.connected : messages.common.status.offline}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 ml-2">
        <span className={`w-2 h-2 rounded-full ${liveYoutubeChannels.length > 0 ? 'bg-red-500 pulse-dot' : 'bg-gray-600'}`} />
        <span>
          YouTube: <span className="text-gray-300">{youtubeLabel}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 ml-2">
        <span className={`w-2 h-2 rounded-full ${tiktokStatus === 'connected' ? 'bg-pink-500 pulse-dot' : tiktokStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : tiktokStatus === 'error' ? 'bg-red-500' : 'bg-gray-600'}`} />
        <span>
          TikTok: <span className="text-gray-300">{tiktokStatus === 'connected' && tiktokUsername ? `@${tiktokUsername}` : statusLabel(tiktokStatus)}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 ml-2">
        <span className={`w-2 h-2 rounded-full ${kickStatus === 'connected' ? 'bg-green-500 pulse-dot' : kickStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : kickStatus === 'error' ? 'bg-red-500' : 'bg-gray-600'}`} />
        <span>
          Kick: <span className="text-gray-300">{kickStatus === 'connected' ? (kickSlug ?? messages.common.status.connected) : statusLabel(kickStatus)}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-violet-500" />
        <span>
          {t('Profile')}: <span className="text-gray-300">{activeProfileName}</span>
        </span>
      </div>
    </footer>
  );
}
