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
  const setTiktokLiveStats = useAppStore((s) => s.setTiktokLiveStats);
  const setKickStatus = useAppStore((s) => s.setKickStatus);
  const setKickSlug = useAppStore((s) => s.setKickSlug);
  const setKickLiveStats = useAppStore((s) => s.setKickLiveStats);

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
      if (status !== 'connected') setTiktokLiveStats(null);
    });
    const unsubTiktokStats = window.copilot.onTiktokLiveStats(setTiktokLiveStats);
    const unsubKick = window.copilot.onKickStatus((status, slug) => {
      setKickStatus(status);
      setKickSlug(slug);
      if (status !== 'connected') setKickLiveStats(null);
    });
    const unsubKickStats = window.copilot.onKickLiveStats(setKickLiveStats);
    return () => { unsubTwitchStatus(); unsubTwitchStats(); unsubYt(); unsubTiktok(); unsubTiktokStats(); unsubKick(); unsubKickStats(); };
  }, [setTwitchStatus, setTwitchChannel, setTwitchLiveStatsForChannel, setYoutubeStreams, setTiktokStatus, setTiktokUsername, setTiktokLiveStats, setKickStatus, setKickSlug, setKickLiveStats]);

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
