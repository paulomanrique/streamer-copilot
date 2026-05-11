import { create } from 'zustand';

import type { ChatMessage, KickConnectionStatus, KickLiveStats, ObsStatsSnapshot, PlatformId, PlatformLinkStatus, ProfilesSnapshot, StreamEvent, TikTokConnectionStatus, TikTokLiveStats, TwitchConnectionStatus, TwitchLiveStats, YouTubeStreamInfo } from '../shared/types.js';

const DEFAULT_OBS_STATS: ObsStatsSnapshot = {
  connected: false,
  sceneName: 'Offline',
  uptimeLabel: '00:00:00',
  bitrateKbps: 0,
  fps: 0,
  cpuPercent: 0,
  ramMb: 0,
  droppedFrames: 0,
  droppedFramesRender: 0,
};
export const MAX_CHAT_MESSAGES = 100;
export const MAX_CHAT_EVENTS = 100;

interface AppStore extends ProfilesSnapshot {
  chatMessages: ChatMessage[];
  chatEvents: StreamEvent[];
  chatSequence: number;
  obsStats: ObsStatsSnapshot;
  /**
   * Symmetric, platform-agnostic connection state. Consumers must read from
   * this map instead of the per-platform fields below (`twitchStatus`,
   * `kickStatus`, `tiktokStatus`), which are legacy and being phased out.
   * Lookups for unregistered platforms return `'disconnected'` via the
   * `getPlatformStatus` selector.
   */
  platformStatus: Partial<Record<PlatformId, PlatformLinkStatus>>;
  /**
   * Symmetric primary-channel map. Stores the account identifier shown in
   * single-account UIs (Twitch login, Kick slug, TikTok username). For
   * platforms with many concurrent connections (YouTube scraper slots,
   * multi-account Twitch), prefer iterating `platformLiveStats` keys.
   */
  platformPrimaryChannel: Partial<Record<PlatformId, string | null>>;
  /**
   * Symmetric per-channel live stats keyed by `(platformId, channelKey)`.
   * The stats payload is platform-specific; consumers cast via the platform
   * registry. Core plumbing keeps it `unknown` to honour the rule that
   * cross-platform code never knows a platform's stat shape.
   */
  platformLiveStats: Partial<Record<PlatformId, Record<string, unknown>>>;
  twitchStatus: TwitchConnectionStatus;
  twitchChannel: string | null;
  /** Per-channel Twitch stats — one entry per connected account. The legacy
   *  `twitchLiveStats` getter exposes the latest entry for back-compat with
   *  callers that haven't been refactored yet. */
  twitchLiveStatsByChannel: Record<string, TwitchLiveStats>;
  youtubeStreams: YouTubeStreamInfo[];
  tiktokStatus: TikTokConnectionStatus;
  tiktokUsername: string | null;
  /** Per-username TikTok stats — one entry per connected account. */
  tiktokLiveStatsByUsername: Record<string, TikTokLiveStats>;
  kickStatus: KickConnectionStatus;
  kickSlug: string | null;
  /** Per-channel Kick stats — one entry per connected account. */
  kickLiveStatsByChannel: Record<string, KickLiveStats>;
  /** Updates the symmetric `platformStatus` (and optionally
   *  `platformPrimaryChannel`) entries for one platform. */
  setPlatformStatus: (platformId: PlatformId, status: PlatformLinkStatus, primaryChannel?: string | null) => void;
  /** Updates one entry in `platformLiveStats[platformId][channelKey]`. Passing
   *  `null` removes the entry — same convention as the legacy per-platform setters. */
  setPlatformLiveStats: (platformId: PlatformId, channelKey: string, stats: unknown | null) => void;
  /** Bulk loader for the initial snapshot delivered by `getPlatformStatuses`. */
  hydratePlatformStatuses: (snapshot: Partial<Record<PlatformId, { status: PlatformLinkStatus; primaryChannel: string | null }>>) => void;
  setProfiles: (snapshot: ProfilesSnapshot) => void;
  setObsStats: (stats: ObsStatsSnapshot | ((current: ObsStatsSnapshot) => ObsStatsSnapshot)) => void;
  setChatSnapshot: (snapshot: { messages: ChatMessage[]; events: StreamEvent[] }) => void;
  appendChatMessage: (message: ChatMessage) => void;
  appendChatMessages: (messages: ChatMessage[]) => void;
  appendChatEvent: (event: StreamEvent) => void;
  appendChatEvents: (events: StreamEvent[]) => void;
  setTwitchStatus: (status: TwitchConnectionStatus) => void;
  setTwitchChannel: (channel: string | null) => void;
  setTwitchLiveStatsForChannel: (channel: string, stats: TwitchLiveStats | null) => void;
  setYoutubeStreams: (streams: YouTubeStreamInfo[]) => void;
  setTiktokStatus: (status: TikTokConnectionStatus) => void;
  setTiktokUsername: (username: string | null) => void;
  setTiktokLiveStatsForUsername: (username: string, stats: TikTokLiveStats | null) => void;
  setKickStatus: (status: KickConnectionStatus) => void;
  setKickSlug: (slug: string | null) => void;
  setKickLiveStatsForChannel: (channel: string, stats: KickLiveStats | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeProfileId: '',
  autoSelectActiveProfile: false,
  chatMessages: [],
  chatEvents: [],
  chatSequence: 0,
  profiles: [],
  obsStats: DEFAULT_OBS_STATS,
  platformStatus: {} as Partial<Record<PlatformId, PlatformLinkStatus>>,
  platformPrimaryChannel: {} as Partial<Record<PlatformId, string | null>>,
  platformLiveStats: {} as Partial<Record<PlatformId, Record<string, unknown>>>,
  twitchStatus: 'disconnected',
  twitchChannel: null,
  twitchLiveStatsByChannel: {},
  youtubeStreams: [],
  tiktokStatus: 'disconnected',
  tiktokUsername: null,
  tiktokLiveStatsByUsername: {},
  kickStatus: 'disconnected',
  kickSlug: null,
  kickLiveStatsByChannel: {},
  setProfiles: (snapshot) =>
    set({
      activeProfileId: snapshot.activeProfileId,
      profiles: snapshot.profiles,
      autoSelectActiveProfile: snapshot.autoSelectActiveProfile,
    }),
  setObsStats: (next) =>
    set((state) => ({
      obsStats: typeof next === 'function' ? next(state.obsStats) : next,
    })),
  setChatSnapshot: (snapshot) =>
    set((state) => {
      let chatSequence = state.chatSequence;
      const messages = snapshot.messages.slice(-MAX_CHAT_MESSAGES);
      const events = snapshot.events.slice(-MAX_CHAT_EVENTS);
      return {
        chatMessages: messages.map((message) => ({ ...message, receivedOrder: chatSequence++ })),
        chatEvents: events.map((event) => ({ ...event, receivedOrder: chatSequence++ })),
        chatSequence,
      };
    }),
  appendChatMessage: (message) =>
    set((state) => appendChatMessagesToState(state, [message])),
  appendChatMessages: (messages) =>
    set((state) => appendChatMessagesToState(state, messages)),
  appendChatEvent: (event) =>
    set((state) => appendChatEventsToState(state, [event])),
  appendChatEvents: (events) =>
    set((state) => appendChatEventsToState(state, events)),
  setPlatformStatus: (platformId, status, primaryChannel) =>
    set((state) => {
      const nextStatus = { ...state.platformStatus, [platformId]: status };
      // Only touch primaryChannel when the caller actually supplied one — a
      // bare status push (no channel arg) must not wipe an existing label.
      if (primaryChannel === undefined) {
        return { platformStatus: nextStatus };
      }
      return {
        platformStatus: nextStatus,
        platformPrimaryChannel: { ...state.platformPrimaryChannel, [platformId]: primaryChannel },
      };
    }),
  setPlatformLiveStats: (platformId, channelKey, stats) =>
    set((state) => {
      const current = state.platformLiveStats[platformId] ?? {};
      const next = { ...current };
      if (stats === null) delete next[channelKey];
      else next[channelKey] = stats;
      return {
        platformLiveStats: { ...state.platformLiveStats, [platformId]: next },
      };
    }),
  hydratePlatformStatuses: (snapshot) =>
    set(() => {
      const nextStatus: Partial<Record<PlatformId, PlatformLinkStatus>> = {};
      const nextChannel: Partial<Record<PlatformId, string | null>> = {};
      for (const [platformId, entry] of Object.entries(snapshot)) {
        if (!entry) continue;
        nextStatus[platformId as PlatformId] = entry.status;
        nextChannel[platformId as PlatformId] = entry.primaryChannel;
      }
      return { platformStatus: nextStatus, platformPrimaryChannel: nextChannel };
    }),
  setTwitchStatus: (status) => set({ twitchStatus: status }),
  setTwitchChannel: (channel) => set({ twitchChannel: channel }),
  setTwitchLiveStatsForChannel: (channel, stats) =>
    set((state) => {
      const next = { ...state.twitchLiveStatsByChannel };
      if (stats === null) delete next[channel];
      else next[channel] = stats;
      return { twitchLiveStatsByChannel: next };
    }),
  setYoutubeStreams: (streams) => set({ youtubeStreams: streams }),
  setTiktokStatus: (status) => set({ tiktokStatus: status }),
  setTiktokUsername: (username) => set({ tiktokUsername: username }),
  setTiktokLiveStatsForUsername: (username, stats) =>
    set((state) => {
      const next = { ...state.tiktokLiveStatsByUsername };
      if (stats === null) delete next[username];
      else next[username] = stats;
      return { tiktokLiveStatsByUsername: next };
    }),
  setKickStatus: (status) => set({ kickStatus: status }),
  setKickSlug: (slug) => set({ kickSlug: slug }),
  setKickLiveStatsForChannel: (channel, stats) =>
    set((state) => {
      const next = { ...state.kickLiveStatsByChannel };
      if (stats === null) delete next[channel];
      else next[channel] = stats;
      return { kickLiveStatsByChannel: next };
    }),
}));

type ChatStateSlice = Pick<AppStore, 'chatMessages' | 'chatEvents' | 'chatSequence'>;

export function appendChatMessagesToState(state: ChatStateSlice, messages: ChatMessage[]): Partial<ChatStateSlice> {
  if (messages.length === 0) return {};
  let chatSequence = state.chatSequence;
  const received = messages.map((message) => ({ ...message, receivedOrder: chatSequence++ }));
  return {
    chatMessages: [...state.chatMessages, ...received].slice(-MAX_CHAT_MESSAGES),
    chatSequence,
  };
}

export function appendChatEventsToState(state: ChatStateSlice, events: StreamEvent[]): Partial<ChatStateSlice> {
  if (events.length === 0) return {};
  let chatSequence = state.chatSequence;
  const received = events.map((event) => ({ ...event, receivedOrder: chatSequence++ }));
  return {
    chatEvents: [...state.chatEvents, ...received].slice(-MAX_CHAT_EVENTS),
    chatSequence,
  };
}
