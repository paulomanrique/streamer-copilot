import { useMemo, useState } from 'react';

import type { ChatMessage, KickConnectionStatus, KickLiveStats, ObsStatsSnapshot, StreamEvent, TikTokConnectionStatus, TikTokLiveStats, TwitchConnectionStatus, TwitchLiveStats, YouTubeStreamInfo } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { useAppStore } from '../store.js';
import { ChatFeed } from './ChatFeed.js';
import { EventBanner } from './EventBanner.js';
import { ObsStatsPanel } from './ObsStatsPanel.js';
import { StatusBar } from './StatusBar.js';

interface DashboardSummaryProps {
  activeProfileName: string;
  chatEvents: StreamEvent[];
  chatMessages: ChatMessage[];
  obsStats: ObsStatsSnapshot;
  twitchStatus: TwitchConnectionStatus;
  twitchChannel: string | null;
  twitchLiveStatsByChannel: Record<string, TwitchLiveStats>;
  youtubeStreams: YouTubeStreamInfo[];
  tiktokStatus: TikTokConnectionStatus;
  tiktokUsername: string | null;
  tiktokLiveStatsByUsername: Record<string, TikTokLiveStats>;
  kickStatus: KickConnectionStatus;
  kickSlug: string | null;
  kickLiveStatsByChannel: Record<string, KickLiveStats>;
  recommendationTemplate: string;
}

export function DashboardSummary({ activeProfileName, chatEvents, chatMessages, obsStats, twitchStatus, twitchChannel, twitchLiveStatsByChannel, youtubeStreams, tiktokStatus, tiktokUsername, tiktokLiveStatsByUsername, kickStatus, kickSlug, kickLiveStatsByChannel, recommendationTemplate }: DashboardSummaryProps) {
  const { messages, t } = useI18n();
  const visibleMessages = chatMessages;
  const visibleEvents = chatEvents;
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [enabledTypes, setEnabledTypes] = useState<Record<StreamEvent['type'], boolean>>({
    subscription: true,
    superchat: true,
    raid: true,
    cheer: true,
    follow: true,
    gift: true,
  });

  const activityConfig = useMemo(
    () => ({
      subscription: { icon: '⭐', label: t('Subscriptions') },
      superchat: { icon: '💸', label: t('Super Chats') },
      raid: { icon: '⚔️', label: t('Raids') },
      cheer: { icon: '✨', label: t('Cheers') },
      follow: { icon: '👋', label: t('Follows') },
      gift: { icon: '🎁', label: t('Gift Subs') },
    }),
    [t],
  );

  // Derive the connected-platforms list from the symmetric stores: any
  // platform whose status is 'connected' OR which has at least one
  // live-stats entry (covers YouTube's per-stream entries — the driver id
  // is the map key, so each driver still counts independently with no
  // driver-family check).
  const platformStatus = useAppStore((s) => s.platformStatus);
  const platformLiveStats = useAppStore((s) => s.platformLiveStats);
  const connectedPlatforms = useMemo(() => {
    const seen = new Set<import('../../shared/types.js').PlatformId>();
    for (const [id, status] of Object.entries(platformStatus)) {
      if (status === 'connected') seen.add(id as import('../../shared/types.js').PlatformId);
    }
    for (const [id, byChannel] of Object.entries(platformLiveStats)) {
      if (byChannel && Object.keys(byChannel).length > 0) seen.add(id as import('../../shared/types.js').PlatformId);
    }
    return [...seen];
  }, [platformStatus, platformLiveStats]);

  const filteredActivity = visibleEvents.filter((event) => enabledTypes[event.type] !== false);

  const setAllFilters = (enabled: boolean) => {
    setEnabledTypes({
      subscription: enabled,
      superchat: enabled,
      raid: enabled,
      cheer: enabled,
      follow: enabled,
      gift: enabled,
    });
  };

  return (
    <section className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <ChatFeed
            messages={visibleMessages}
            events={visibleEvents}
            connectedPlatforms={connectedPlatforms}
            recommendationTemplate={recommendationTemplate}
          />

        <div className="flex flex-col w-[40%] overflow-hidden">
          <ObsStatsPanel
            stats={obsStats}
            twitchLiveStatsByChannel={twitchLiveStatsByChannel}
            twitchConnectedChannels={Object.keys(twitchLiveStatsByChannel)}
            twitchConnected={twitchStatus === 'connected'}
            youtubeStreams={youtubeStreams}
            tiktokStatus={tiktokStatus}
            tiktokUsername={tiktokUsername}
            tiktokLiveStatsByUsername={tiktokLiveStatsByUsername}
            kickStatus={kickStatus}
            kickSlug={kickSlug}
            kickLiveStatsByChannel={kickLiveStatsByChannel}
          />

          <div className="flex flex-col flex-1 overflow-hidden p-4">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="text-sm font-semibold text-gray-200">{t('Activity Log')}</h2>
              <div className="relative">
                <button
                  type="button"
                  id="activity-filter-btn"
                  onClick={() => setIsFilterOpen((current) => !current)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                  </svg>
                  {t('Filter')}
                </button>
                {isFilterOpen ? (
                  <div id="activity-filter-panel" className="absolute right-0 top-full mt-1 w-52 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-20 p-3">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">{t('Show in Log')}</p>
                    <div className="space-y-1" id="activity-filter-list">
                      {Object.entries(activityConfig).map(([type, config]) => (
                        <label key={type} className="flex items-center gap-2 cursor-pointer py-0.5 group">
                          <input
                            type="checkbox"
                            checked={enabledTypes[type as StreamEvent['type']]}
                            onChange={(event) =>
                              setEnabledTypes((current) => ({
                                ...current,
                                [type]: event.target.checked,
                              }))
                            }
                            className="accent-violet-500 cursor-pointer"
                          />
                          <span className="text-sm">{config.icon}</span>
                          <span className="text-xs text-gray-300 group-hover:text-white transition-colors">{config.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="border-t border-gray-700 mt-2 pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAllFilters(true)}
                        className="flex-1 text-xs py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                      >
                        {t('All')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllFilters(false)}
                        className="flex-1 text-xs py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                      >
                        {messages.common.none}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto text-xs">
              {filteredActivity.length > 0 ? filteredActivity.map((event) => (
                <EventBanner key={event.id} event={event} variant="activity" />
              )) : <p className="text-gray-600 text-xs text-center py-4">{t('No event types are enabled.')}</p>}
            </div>
          </div>
        </div>
      </div>

      <StatusBar
        activeProfileName={activeProfileName}
        obsConnected={obsStats.connected}
      />
    </section>
  );
}
