import { create } from 'zustand';

import type { ChatMessage, ObsStatsSnapshot, ProfilesSnapshot, StreamEvent, TwitchConnectionStatus, TwitchLiveStats } from '../shared/types.js';

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
  obsStats: ObsStatsSnapshot;
  twitchStatus: TwitchConnectionStatus;
  twitchChannel: string | null;
  twitchLiveStats: TwitchLiveStats | null;
  youtubeStatus: number;
  setProfiles: (snapshot: ProfilesSnapshot) => void;
  setObsStats: (stats: ObsStatsSnapshot | ((current: ObsStatsSnapshot) => ObsStatsSnapshot)) => void;
  setChatSnapshot: (snapshot: { messages: ChatMessage[]; events: StreamEvent[] }) => void;
  appendChatMessage: (message: ChatMessage) => void;
  appendChatEvent: (event: StreamEvent) => void;
  setTwitchStatus: (status: TwitchConnectionStatus) => void;
  setTwitchChannel: (channel: string | null) => void;
  setTwitchLiveStats: (stats: TwitchLiveStats) => void;
  setYoutubeStatus: (status: number) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeProfileId: '',
  chatMessages: [],
  chatEvents: [],
  profiles: [],
  obsStats: DEFAULT_OBS_STATS,
  twitchStatus: 'disconnected',
  twitchChannel: null,
  twitchLiveStats: null,
  youtubeStatus: 0,
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
    set({
      chatMessages: snapshot.messages,
      chatEvents: snapshot.events,
    }),
  appendChatMessage: (message) =>
    set((state) => {
      const next = [...state.chatMessages, message];
      if (next.length > 100) next.shift();
      return { chatMessages: next };
    }),
  appendChatEvent: (event) =>
    set((state) => {
      const next = [...state.chatEvents, event];
      if (next.length > 100) next.shift();
      return { chatEvents: next };
    }),
  setTwitchStatus: (status) => set({ twitchStatus: status }),
  setTwitchChannel: (channel) => set({ twitchChannel: channel }),
  setTwitchLiveStats: (stats) => set({ twitchLiveStats: stats }),
  setYoutubeStatus: (status) => set({ youtubeStatus: status }),
}));
