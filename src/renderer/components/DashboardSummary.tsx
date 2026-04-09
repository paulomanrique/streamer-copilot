import { useMemo, useState } from 'react';

import type { ChatMessage, ObsStatsSnapshot, StreamEvent, TwitchConnectionStatus, TwitchLiveStats } from '../../shared/types.js';
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
  twitchLiveStats: TwitchLiveStats | null;
  youtubeStatus: boolean;
}

export function DashboardSummary({ activeProfileName, chatEvents, chatMessages, obsStats, twitchStatus, twitchChannel, twitchLiveStats, youtubeStatus }: DashboardSummaryProps) {
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
      subscription: { icon: '⭐', label: 'Subscriptions' },
      superchat: { icon: '💸', label: 'Super Chats' },
      raid: { icon: '⚔️', label: 'Raids' },
      cheer: { icon: '✨', label: 'Cheers' },
      follow: { icon: '👋', label: 'Follows' },
      gift: { icon: '🎁', label: 'Gift Subs' },
    }),
    [],
  );

  const connectedPlatforms = useMemo(() => {
    const list: import('../../shared/types.js').PlatformId[] = [];
    if (twitchStatus === 'connected') list.push('twitch');
    if (youtubeStatus) list.push('youtube');
    return list;
  }, [twitchStatus, youtubeStatus]);

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
          />

        <div className="flex flex-col w-[40%] overflow-hidden">
          <ObsStatsPanel 
            stats={obsStats} 
            twitchLiveStats={twitchLiveStats} 
            twitchConnected={twitchStatus === 'connected'} 
            youtubeConnected={youtubeStatus}
          />

          <div className="flex flex-col flex-1 overflow-hidden p-4">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="text-sm font-semibold text-gray-200">Activity Log</h2>
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
                  Filter
                </button>
                {isFilterOpen ? (
                  <div id="activity-filter-panel" className="absolute right-0 top-full mt-1 w-52 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-20 p-3">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Show in Log</p>
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
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllFilters(false)}
                        className="flex-1 text-xs py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                      >
                        None
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto text-xs">
              {filteredActivity.length > 0 ? filteredActivity.map((event) => (
                <EventBanner key={event.id} event={event} variant="activity" />
              )) : <p className="text-gray-600 text-xs text-center py-4">No event types are enabled.</p>}
            </div>
          </div>
        </div>
      </div>

      <StatusBar
        activeProfileName={activeProfileName}
        obsConnected={obsStats.connected}
        twitchStatus={twitchStatus}
        twitchChannel={twitchChannel}
      />
    </section>
  );
}
