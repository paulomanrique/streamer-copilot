import type { ObsStatsSnapshot } from '../../shared/types.js';

interface ObsStatsPanelProps {
  stats: ObsStatsSnapshot;
}

const PLATFORM_STATS = {
  twitch: { viewers: '1.247' },
  youtube: { viewers: '834', likes: '2.1k' },
  'youtube-v': { viewers: '291', likes: '876' },
  kick: { viewers: '392' },
  tiktok: { viewers: '1.8k', likes: '5.3k' },
} as const;

const ICONS = {
  twitch: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
  youtube: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
  kick: 'M2 2h4v8l4-4h4l-6 6 6 6h-4l-4-4v4H2V2zm14 0h4v20h-4z',
  tiktok: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.67a8.17 8.17 0 0 0 4.79 1.53V6.75a4.85 4.85 0 0 1-1.02-.06z',
} as const;

export function ObsStatsPanel({ stats }: ObsStatsPanelProps) {
  const totalFrames = Math.max(1, stats.droppedFrames + stats.droppedFramesRender + 100);
  const connectionPct = Math.max(0, Math.min(100, (1 - stats.droppedFrames / totalFrames) * 100));
  const connectionTone = connectionPct >= 95 ? 'text-green-400' : connectionPct >= 80 ? 'text-yellow-400' : 'text-red-400';
  const connectionLabel = connectionPct >= 95 ? 'Good' : connectionPct >= 80 ? 'Fair' : 'Poor';
  const connectionBar = connectionPct >= 95 ? 'bg-green-500' : connectionPct >= 80 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="border-b border-gray-800 p-4 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-200">OBS Studio</h2>
          <span className={`text-xs font-medium ${stats.connected ? 'text-red-400' : 'text-gray-500'}`}>
            {stats.connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          Scene: <span className="text-gray-300">{stats.sceneName}</span>
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
          <div className="text-base font-mono font-bold text-violet-400">{stats.uptimeLabel}</div>
          <div className="text-xs text-gray-500 mt-0.5">Time</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
          <div className="text-base font-mono font-bold text-red-400">{stats.droppedFrames}</div>
          <div className="text-xs text-gray-500 mt-0.5 leading-tight">Dropped Frames<br />(network)</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
          <div className="text-base font-mono font-bold text-orange-400">{stats.droppedFrames}</div>
          <div className="text-xs text-gray-500 mt-0.5 leading-tight">Dropped Frames<br />(encoder)</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
          <div className="text-base font-mono font-bold text-yellow-400">{stats.droppedFramesRender}</div>
          <div className="text-xs text-gray-500 mt-0.5 leading-tight">Dropped Frames<br />(render)</div>
        </div>

        <div className="col-span-4 bg-gray-800/60 rounded-lg px-3 py-2 flex items-center gap-3">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-gray-500">Connection</span>
            <span className={`text-xs font-semibold ${connectionTone}`}>● {connectionLabel}</span>
          </div>
          <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${connectionBar}`} style={{ width: `${connectionPct.toFixed(1)}%` }} />
          </div>
          <span className="text-xs font-mono text-gray-300">{connectionPct.toFixed(1)}%</span>
        </div>

        <div className="col-span-4 grid grid-cols-5 gap-2">
          <ViewerCard label="Twitch" icon={ICONS.twitch} classes="bg-purple-500/10 border-purple-500/20 text-purple-300" metaClass="text-purple-400" value={PLATFORM_STATS.twitch.viewers} />
          <ViewerCard label="YT Horizontal" icon={ICONS.youtube} classes="bg-red-500/10 border-red-500/20 text-red-300" metaClass="text-red-400" value={PLATFORM_STATS.youtube.viewers} likes={PLATFORM_STATS.youtube.likes} />
          <ViewerCard label="YT Vertical" icon={ICONS.youtube} classes="bg-rose-500/10 border-rose-500/20 text-rose-300" metaClass="text-rose-400" value={PLATFORM_STATS['youtube-v'].viewers} likes={PLATFORM_STATS['youtube-v'].likes} />
          <ViewerCard label="Kick" icon={ICONS.kick} classes="bg-green-500/10 border-green-500/20 text-green-300" metaClass="text-green-400" value={PLATFORM_STATS.kick.viewers} />
          <ViewerCard label="TikTok" icon={ICONS.tiktok} classes="bg-pink-500/10 border-pink-500/20 text-pink-300" metaClass="text-pink-400" value={PLATFORM_STATS.tiktok.viewers} likes={PLATFORM_STATS.tiktok.likes} />
        </div>
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
  likes,
}: {
  label: string;
  icon: string;
  classes: string;
  metaClass: string;
  value: string;
  likes?: string;
}) {
  return (
    <div className={`border rounded-lg p-2.5 text-center ${classes}`}>
      <div className="flex items-center justify-center gap-1 mb-0.5">
        <svg className={`w-3 h-3 ${metaClass}`} viewBox="0 0 24 24" fill="currentColor">
          <path d={icon} />
        </svg>
        <span className={`text-xs ${metaClass}`}>{label}</span>
      </div>
      <div className="text-base font-mono font-bold">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">viewers</div>
      {likes ? (
        <div className="text-xs mt-0.5">
          <span className="text-pink-400">{likes}</span> <span className="text-gray-500">likes</span>
        </div>
      ) : null}
    </div>
  );
}
