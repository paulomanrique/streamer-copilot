import { useEffect } from 'react';

import type { ObsStatsSnapshot } from '../../shared/types.js';
import { useAppStore } from '../store.js';

/**
 * Sets up all push-based IPC listeners (OBS stats, platform statuses,
 * chat messages/events). Returns nothing — listeners auto-cleanup on unmount.
 */
export function useIpcListeners(): void {
  const setObsStats = useAppStore((s) => s.setObsStats);
  const appendChatMessages = useAppStore((s) => s.appendChatMessages);
  const appendChatEvents = useAppStore((s) => s.appendChatEvents);
  const setPlatformStatus = useAppStore((s) => s.setPlatformStatus);
  const setPlatformLiveStats = useAppStore((s) => s.setPlatformLiveStats);

  // OBS listeners
  useEffect(() => {
    const unsubStats = window.copilot.onObsStats((stats: ObsStatsSnapshot) => {
      setObsStats(stats);
    });
    const unsubConnected = window.copilot.onObsConnected(() => {
      setObsStats((current: ObsStatsSnapshot) => ({ ...current, connected: true }));
    });
    const unsubDisconnected = window.copilot.onObsDisconnected(() => {
      setObsStats((current: ObsStatsSnapshot) => ({ ...current, connected: false }));
    });
    return () => { unsubStats(); unsubConnected(); unsubDisconnected(); };
  }, [setObsStats]);

  // Platform status listeners — single subscription, all platforms route
  // through the symmetric `platformStatus` / `platformLiveStats` store maps.
  useEffect(() => {
    const unsubStatus = window.copilot.onPlatformStatus(({ platformId, status, primaryChannel }) => {
      setPlatformStatus(platformId, status, primaryChannel);
    });
    const unsubStats = window.copilot.onPlatformLiveStats(({ platformId, channelKey, stats }) => {
      setPlatformLiveStats(platformId, channelKey, stats);
    });
    return () => { unsubStatus(); unsubStats(); };
  }, [setPlatformStatus, setPlatformLiveStats]);

  // Chat message/event listeners
  useEffect(() => {
    const unsubMessages = window.copilot.onChatMessagesBatch((messages) => {
      appendChatMessages(messages);
    });
    const unsubEvents = window.copilot.onChatEventsBatch((events) => {
      appendChatEvents(events);
    });
    return () => { unsubMessages(); unsubEvents(); };
  }, [appendChatEvents, appendChatMessages]);
}
