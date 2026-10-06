import { useMemo } from 'react';

import type { ChatMessage, PlatformId, PlatformLiveEntry, StreamEvent } from '../../shared/types.js';
import { useAppStore } from '../store.js';
import { ChatFeed } from './ChatFeed.js';
import { StatusBar } from './StatusBar.js';

interface DashboardSummaryProps {
  activeProfileName: string;
  chatEvents: StreamEvent[];
  chatMessages: ChatMessage[];
  obsConnected: boolean;
  /** Uniform live entries from the registry, for the status-bar LIVE indicator. */
  liveEntries: PlatformLiveEntry[];
  recommendationTemplate: string;
}

export function DashboardSummary({ activeProfileName, chatEvents, chatMessages, obsConnected, liveEntries, recommendationTemplate }: DashboardSummaryProps) {
  // Derive the connected-platforms list from the symmetric stores: any
  // platform whose status is 'connected' OR which has at least one
  // live-stats entry (covers YouTube's per-stream entries — the driver id
  // is the map key, so each driver still counts independently with no
  // driver-family check).
  const platformStatus = useAppStore((s) => s.platformStatus);
  const platformLiveStats = useAppStore((s) => s.platformLiveStats);
  const connectedPlatforms = useMemo(() => {
    const seen = new Set<PlatformId>();
    for (const [id, status] of Object.entries(platformStatus)) {
      if (status === 'connected') seen.add(id as PlatformId);
    }
    for (const [id, byChannel] of Object.entries(platformLiveStats)) {
      if (byChannel && Object.keys(byChannel).length > 0) seen.add(id as PlatformId);
    }
    return [...seen];
  }, [platformStatus, platformLiveStats]);

  // The chat takes the whole dashboard for now; configurable widgets will
  // carve this area up later.
  return (
    <section className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <ChatFeed
          messages={chatMessages}
          events={chatEvents}
          connectedPlatforms={connectedPlatforms}
          recommendationTemplate={recommendationTemplate}
        />
      </div>

      <StatusBar
        activeProfileName={activeProfileName}
        obsConnected={obsConnected}
        liveEntries={liveEntries}
      />
    </section>
  );
}
