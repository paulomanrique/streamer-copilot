import { create } from 'zustand';

import type { ChatMessage, ObsStatsSnapshot, ProfilesSnapshot, StreamEvent, TikTokConnectionStatus, TwitchConnectionStatus, TwitchLiveStats, YouTubeStreamInfo } from '../shared/types.js';

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

interface AppStore extends ProfilesSnapshot {
  chatMessages: ChatMessage[];
  chatEvents: StreamEvent[];
  chatSequence: number;
  obsStats: ObsStatsSnapshot;
  twitchStatus: TwitchConnectionStatus;
  twitchChannel: string | null;
  twitchLiveStats: TwitchLiveStats | null;
  youtubeStreams: YouTubeStreamInfo[];
  tiktokStatus: TikTokConnectionStatus;
  tiktokUsername: string | null;
  setProfiles: (snapshot: ProfilesSnapshot) => void;
  setObsStats: (stats: ObsStatsSnapshot | ((current: ObsStatsSnapshot) => ObsStatsSnapshot)) => void;
  setChatSnapshot: (snapshot: { messages: ChatMessage[]; events: StreamEvent[] }) => void;
  appendChatMessage: (message: ChatMessage) => void;
  appendChatEvent: (event: StreamEvent) => void;
  setTwitchStatus: (status: TwitchConnectionStatus) => void;
  setTwitchChannel: (channel: string | null) => void;
  setTwitchLiveStats: (stats: TwitchLiveStats) => void;
  setYoutubeStreams: (streams: YouTubeStreamInfo[]) => void;
  setTiktokStatus: (status: TikTokConnectionStatus) => void;
  setTiktokUsername: (username: string | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeProfileId: '',
  chatMessages: [],
  chatEvents: [],
  chatSequence: 0,
  profiles: [],
  obsStats: DEFAULT_OBS_STATS,
  twitchStatus: 'disconnected',
  twitchChannel: null,
  twitchLiveStats: null,
  youtubeStreams: [],
  tiktokStatus: 'disconnected',
  tiktokUsername: null,
  setProfiles: (snapshot) =>
    set({
      activeProfileId: snapshot.activeProfileId,
      profiles: snapshot.profiles,
    }),
  setObsStats: (next) =>
    set((state) => ({
      obsStats: typeof next === 'function' ? next(state.obsStats) : next,
    })),
  setChatSnapshot: (snapshot) =>
    set((state) => {
      let chatSequence = state.chatSequence;
      return {
        chatMessages: snapshot.messages.map((message) => ({ ...message, receivedOrder: chatSequence++ })),
        chatEvents: snapshot.events.map((event) => ({ ...event, receivedOrder: chatSequence++ })),
        chatSequence,
      };
    }),
  appendChatMessage: (message) =>
    set((state) => {
      const next = [...state.chatMessages, { ...message, receivedOrder: state.chatSequence }];
      if (next.length > 100) next.shift();
      return { chatMessages: next, chatSequence: state.chatSequence + 1 };
    }),
  appendChatEvent: (event) =>
    set((state) => {
      const next = [...state.chatEvents, { ...event, receivedOrder: state.chatSequence }];
      if (next.length > 100) next.shift();
      return { chatEvents: next, chatSequence: state.chatSequence + 1 };
    }),
  setTwitchStatus: (status) => set({ twitchStatus: status }),
  setTwitchChannel: (channel) => set({ twitchChannel: channel }),
  setTwitchLiveStats: (stats) => set({ twitchLiveStats: stats }),
  setYoutubeStreams: (streams) => set({ youtubeStreams: streams }),
  setTiktokStatus: (status) => set({ tiktokStatus: status }),
  setTiktokUsername: (username) => set({ tiktokUsername: username }),
}));
