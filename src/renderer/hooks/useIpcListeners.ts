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
  const setTwitchStatus = useAppStore((s) => s.setTwitchStatus);
  const setTwitchChannel = useAppStore((s) => s.setTwitchChannel);
  const setTwitchLiveStatsForChannel = useAppStore((s) => s.setTwitchLiveStatsForChannel);
  const setYoutubeStreams = useAppStore((s) => s.setYoutubeStreams);
  const setTiktokStatus = useAppStore((s) => s.setTiktokStatus);
  const setTiktokUsername = useAppStore((s) => s.setTiktokUsername);
  const setTiktokLiveStatsForUsername = useAppStore((s) => s.setTiktokLiveStatsForUsername);
  const setKickStatus = useAppStore((s) => s.setKickStatus);
  const setKickSlug = useAppStore((s) => s.setKickSlug);
  const setKickLiveStatsForChannel = useAppStore((s) => s.setKickLiveStatsForChannel);

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

  // Platform status listeners
  useEffect(() => {
    const unsubTwitchStatus = window.copilot.onTwitchStatus((status, channel) => {
      setTwitchStatus(status);
      setTwitchChannel(channel);
    });
    const unsubTwitchStats = window.copilot.onTwitchLiveStats(({ channel, stats }) => {
      setTwitchLiveStatsForChannel(channel, stats);
    });
    const unsubYt = window.copilot.onYoutubeStatus(setYoutubeStreams);
    const unsubTiktok = window.copilot.onTiktokStatus((status, username) => {
      setTiktokStatus(status);
      setTiktokUsername(username);
    });
    const unsubTiktokStats = window.copilot.onTiktokLiveStats(({ username, stats }) => {
      setTiktokLiveStatsForUsername(username, stats);
    });
    const unsubKick = window.copilot.onKickStatus((status, slug) => {
      setKickStatus(status);
      setKickSlug(slug);
    });
    const unsubKickStats = window.copilot.onKickLiveStats(({ channel, stats }) => {
      setKickLiveStatsForChannel(channel, stats);
    });
    return () => { unsubTwitchStatus(); unsubTwitchStats(); unsubYt(); unsubTiktok(); unsubTiktokStats(); unsubKick(); unsubKickStats(); };
  }, [setTwitchStatus, setTwitchChannel, setTwitchLiveStatsForChannel, setYoutubeStreams, setTiktokStatus, setTiktokUsername, setTiktokLiveStatsForUsername, setKickStatus, setKickSlug, setKickLiveStatsForChannel]);

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
