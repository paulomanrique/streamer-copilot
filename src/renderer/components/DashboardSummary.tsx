import type { ObsStatsSnapshot } from '../../shared/types.js';
import { DASHBOARD_EVENTS, DASHBOARD_MESSAGES } from '../dashboard-mock-data.js';
import { ChatFeed } from './ChatFeed.js';
import { EventBanner } from './EventBanner.js';
import { ObsStatsPanel } from './ObsStatsPanel.js';
import { StatusBar } from './StatusBar.js';

interface DashboardSummaryProps {
  activeProfileName: string;
  chatEvents: typeof DASHBOARD_EVENTS;
  chatMessages: typeof DASHBOARD_MESSAGES;
  obsStats: ObsStatsSnapshot;
}

export function DashboardSummary({ activeProfileName, chatEvents, chatMessages, obsStats }: DashboardSummaryProps) {
  const visibleMessages = chatMessages.length > 0 ? chatMessages : DASHBOARD_MESSAGES;
  const visibleEvents = chatEvents.length > 0 ? chatEvents : DASHBOARD_EVENTS;

  return (
    <section className="h-full flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <ChatFeed messages={visibleMessages} events={visibleEvents} />

        <div className="flex flex-col w-[40%] overflow-hidden">
          <ObsStatsPanel stats={obsStats} />

          <div className="flex flex-col flex-1 overflow-hidden p-4">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="text-sm font-semibold text-gray-200">Activity Log</h2>
              <div className="relative">
                <button
                  type="button"
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                  </svg>
                  Filter
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto text-xs">
              {visibleEvents.map((event) => (
                <EventBanner key={event.id} event={event} variant="activity" />
              ))}
              <div className="pt-2 text-[10px] text-gray-600">Active profile: {activeProfileName}</div>
            </div>
          </div>
        </div>
      </div>

      <StatusBar activeProfileName={activeProfileName} obsConnected={obsStats.connected} />
    </section>
  );
}
