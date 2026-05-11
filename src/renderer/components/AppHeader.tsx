import { useState } from 'react';

import logoUrl from '../assets/logo.svg';
import type { AppInfo, KickConnectionStatus, KickLiveStats, TikTokConnectionStatus, TikTokLiveStats, TwitchLiveStats, YouTubeStreamInfo } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { getPlatformProviderOrFallback } from '../platforms/registry.js';
import type { AppSection } from './SectionTabs.js';

interface AppHeaderProps {
  appInfo: AppInfo | null;
  currentSection: AppSection;
  onChangeSection: (section: AppSection) => void;
  onOpenProfileSelector?: () => void;
  twitchLiveStatsByChannel: Record<string, TwitchLiveStats>;
  youtubeStreams: YouTubeStreamInfo[];
  tiktokStatus: TikTokConnectionStatus;
  tiktokUsername: string | null;
  /** Per-username TikTok stats — one entry per connected host. */
  tiktokLiveStatsByUsername: Record<string, TikTokLiveStats>;
  kickStatus: KickConnectionStatus;
  kickSlug: string | null;
  /** Per-channel Kick stats — one entry per connected channel. */
  kickLiveStatsByChannel: Record<string, KickLiveStats>;
}

/** Build a single live-link row using the platform registry — every
 *  consumer of this helper just supplies the per-row label / URL pair. */
function makeLiveLink(
  platformId: string,
  id: string,
  label: string,
  full: string,
): {
  id: string;
  label: string;
  url: string;
  full: string;
  icon: string;
  color: string;
  border: string;
  btnBg: string;
} {
  const meta = getPlatformProviderOrFallback(platformId);
  return {
    id,
    label,
    url: full.replace(/^https?:\/\//, ''),
    full,
    icon: meta.icon,
    color: meta.liveLink.color,
    border: meta.liveLink.border,
    btnBg: meta.liveLink.btnBg,
  };
}

export function AppHeader({
  appInfo,
  currentSection,
  onChangeSection,
  onOpenProfileSelector,
  twitchLiveStatsByChannel,
  youtubeStreams,
  tiktokStatus,
  tiktokUsername,
  tiktokLiveStatsByUsername,
  kickStatus,
  kickSlug,
  kickLiveStatsByChannel,
}: AppHeaderProps) {
  const { messages, t } = useI18n();
  const [liveOpen, setLiveOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const appName = appInfo?.appName ?? 'Streamer Copilot';

  const liveTwitchChannels = Object.entries(twitchLiveStatsByChannel)
    .filter(([, stats]) => stats.isLive)
    .map(([channel]) => channel);

  // Kick: prefer per-channel stats; fall back to the legacy single-status flag
  // when no stats have arrived yet so a freshly-connected channel still surfaces.
  const liveKickChannels = (() => {
    const fromStats = Object.entries(kickLiveStatsByChannel)
      .filter(([, stats]) => stats.isLive !== false)
      .map(([channel]) => channel);
    if (fromStats.length > 0) return fromStats;
    return kickStatus === 'connected' && kickSlug ? [kickSlug] : [];
  })();

  // TikTok: connected username keys carry "is live now". Stats arrive only
  // when the host is actually live, so any entry here qualifies.
  const liveTiktokUsernames = (() => {
    const fromStats = Object.keys(tiktokLiveStatsByUsername);
    if (fromStats.length > 0) return fromStats;
    return tiktokStatus === 'connected' && tiktokUsername ? [tiktokUsername] : [];
  })();

  const isAnyLive = liveTwitchChannels.length > 0
    || youtubeStreams.length > 0
    || liveKickChannels.length > 0
    || liveTiktokUsernames.length > 0;

  const liveLinks = [
    ...liveTwitchChannels.map((channel) =>
      makeLiveLink('twitch', `twitch-${channel}`, `Twitch #${channel}`, `https://twitch.tv/${channel}`),
    ),
    // stream.label already carries the "YouTube" prefix when needed
    // (e.g. "YouTube Horizontal", "YouTube @user", "YouTube-1") and is
    // just "YouTube" for the single-stream case — see
    // computeYouTubeStreamLabels in the main process.
    ...youtubeStreams.map((stream) =>
      makeLiveLink(stream.platform, `yt-${stream.videoId}`, stream.label || 'YouTube', stream.liveUrl),
    ),
    ...liveKickChannels.map((channel) =>
      makeLiveLink('kick', `kick-${channel}`, `Kick ${channel}`, `https://kick.com/${channel}`),
    ),
    ...liveTiktokUsernames.map((username) =>
      makeLiveLink('tiktok', `tiktok-${username}`, `TikTok @${username}`, `https://www.tiktok.com/@${username}/live`),
    ),
  ];

  const copyLink = (id: string, url: string) => {
    navigator.clipboard.writeText(url).catch(() => null);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const copyAll = () => {
    const text = liveLinks.map((l) => `${l.label}: ${l.full}`).join('\n');
    navigator.clipboard.writeText(text).catch(() => null);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <>
      <header className="flex items-center gap-4 px-4 h-12 bg-gray-900 border-b border-gray-800 shrink-0 z-10">
        {/* Brand */}
        <div className="flex items-center gap-2 mr-2">
          <img src={logoUrl} alt="Streamer Copilot" className="w-7 h-7 rounded-lg" />
          <span className="font-semibold text-sm hidden sm:block">{appName}</span>
        </div>

        {/* Nav */}
        <nav className="flex gap-1">
          <button type="button" onClick={() => onChangeSection('dashboard')}
            className={currentSection === 'dashboard'
              ? 'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-violet-600 text-white'
              : 'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-gray-400 hover:text-white transition-colors'}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7"/>
            </svg>
            {t('Dashboard')}
          </button>
          <button type="button" onClick={() => onChangeSection('settings')}
            className={currentSection === 'settings'
              ? 'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-violet-600 text-white'
              : 'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-gray-400 hover:text-white transition-colors'}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            {messages.settings.title}
          </button>
        </nav>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-3">
          {onOpenProfileSelector ? (
            <button type="button" onClick={onOpenProfileSelector}
              className="px-3 py-1.5 rounded text-sm font-medium text-gray-400 hover:text-white transition-colors">
              {messages.profile.profiles}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setLiveOpen(true)}
            disabled={!isAnyLive}
            className={isAnyLive
              ? 'flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-sm font-medium transition-colors'
              : 'flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700/60 text-gray-400 text-sm font-medium opacity-60 cursor-not-allowed'}
          >
            <span className={`w-2 h-2 rounded-full ${isAnyLive ? 'pulse-dot bg-white' : 'bg-gray-400'}`} />
            {isAnyLive ? messages.common.status.live : messages.common.status.offline}
          </button>
        </div>
      </header>

      {/* ── Go Live modal ────────────────────────────────────────── */}
      {liveOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setLiveOpen(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <span className="pulse-dot w-2 h-2 rounded-full bg-red-500" />
                <h3 className="font-semibold text-gray-100">{t('Live Links')}</h3>
              </div>
              <button type="button" onClick={() => setLiveOpen(false)}
                className="text-gray-400 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>

            {/* body */}
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500 mb-4">{t('Copy links to share each live output on social media.')}</p>

              {liveLinks.length === 0 ? (
                <div className="text-sm text-gray-500 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5">
                  {t('No live outputs detected.')}
                </div>
              ) : null}

              {liveLinks.map(({ id, label, url, full, icon, color, border, btnBg }) => (
                <div key={id} className={`flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2.5 border ${border}`}>
                  <span className={`${color} shrink-0`}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d={icon} /></svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide leading-none mb-0.5">{label}</p>
                    <p className="text-sm text-gray-300 font-mono truncate">{url}</p>
                  </div>
                  <button type="button" onClick={() => copyLink(id, full)}
                    className={`shrink-0 text-xs px-2 py-1 rounded transition-colors ${btnBg}`}>
                    {copiedId === id ? '✓' : t('Copy')}
                  </button>
                </div>
              ))}

              <button type="button" onClick={copyAll} disabled={liveLinks.length === 0}
                className="w-full py-2 rounded bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 text-sm border border-violet-600/30 transition-colors mt-1 disabled:opacity-40 disabled:cursor-not-allowed">
                {copiedId === 'all' ? `✓ ${t('Copied!')}` : t('Copy all links')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
