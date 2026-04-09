import type { TwitchConnectionStatus, YouTubeStreamInfo } from '../../shared/types.js';

interface StatusBarProps {
  activeProfileName: string;
  obsConnected: boolean;
  twitchStatus: TwitchConnectionStatus;
  twitchChannel: string | null;
  youtubeStreams: YouTubeStreamInfo[];
}

const TWITCH_DOT: Record<TwitchConnectionStatus, string> = {
  disconnected: 'bg-gray-600',
  connecting: 'bg-yellow-400 animate-pulse',
  connected: 'bg-purple-500 pulse-dot',
  error: 'bg-red-500',
};

const TWITCH_LABEL: Record<TwitchConnectionStatus, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Error',
};

export function StatusBar({ activeProfileName, obsConnected, twitchStatus, twitchChannel, youtubeStreams }: StatusBarProps) {
  const twitchLabel = twitchStatus === 'connected' && twitchChannel
    ? `#${twitchChannel}`
    : TWITCH_LABEL[twitchStatus];
  const liveYoutubeChannels = Array.from(
    new Set(
      youtubeStreams
        .map((stream) => stream.channelHandle)
        .filter((channel): channel is string => Boolean(channel)),
    ),
  );
  const youtubeLabel = liveYoutubeChannels.length > 0
    ? liveYoutubeChannels.join(', ')
    : 'Offline';

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
          OBS: <span className="text-gray-300">{obsConnected ? 'Connected' : 'Offline'}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 ml-2">
        <span className={`w-2 h-2 rounded-full ${liveYoutubeChannels.length > 0 ? 'bg-red-500 pulse-dot' : 'bg-gray-600'}`} />
        <span>
          YouTube: <span className="text-gray-300">{youtubeLabel}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-violet-500" />
        <span>
          Profile: <span className="text-gray-300">{activeProfileName}</span>
        </span>
      </div>
    </footer>
  );
}
