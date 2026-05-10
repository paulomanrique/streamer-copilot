import { create } from 'zustand';

import type { ChatMessage, KickConnectionStatus, KickLiveStats, ObsStatsSnapshot, ProfilesSnapshot, StreamEvent, TikTokConnectionStatus, TikTokLiveStats, TwitchConnectionStatus, TwitchLiveStats, YouTubeStreamInfo } from '../shared/types.js';

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
  twitchStatus: TwitchConnectionStatus;
  twitchChannel: string | null;
  /** Per-channel Twitch stats — one entry per connected account. The legacy
   *  `twitchLiveStats` getter exposes the latest entry for back-compat with
   *  callers that haven't been refactored yet. */
  twitchLiveStatsByChannel: Record<string, TwitchLiveStats>;
  youtubeStreams: YouTubeStreamInfo[];
  tiktokStatus: TikTokConnectionStatus;
  tiktokUsername: string | null;
  tiktokLiveStats: TikTokLiveStats | null;
  kickStatus: KickConnectionStatus;
  kickSlug: string | null;
  kickLiveStats: KickLiveStats | null;
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
  setTiktokLiveStats: (stats: TikTokLiveStats | null) => void;
  setKickStatus: (status: KickConnectionStatus) => void;
  setKickSlug: (slug: string | null) => void;
  setKickLiveStats: (stats: KickLiveStats | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeProfileId: '',
  autoSelectActiveProfile: false,
  chatMessages: [],
  chatEvents: [],
  chatSequence: 0,
  profiles: [],
  obsStats: DEFAULT_OBS_STATS,
  twitchStatus: 'disconnected',
  twitchChannel: null,
  twitchLiveStatsByChannel: {},
  youtubeStreams: [],
  tiktokStatus: 'disconnected',
  tiktokUsername: null,
  tiktokLiveStats: null,
  kickStatus: 'disconnected',
  kickSlug: null,
  kickLiveStats: null,
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
  setTiktokLiveStats: (stats) => set({ tiktokLiveStats: stats }),
  setKickStatus: (status) => set({ kickStatus: status }),
  setKickSlug: (slug) => set({ kickSlug: slug }),
  setKickLiveStats: (stats) => set({ kickLiveStats: stats }),
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
