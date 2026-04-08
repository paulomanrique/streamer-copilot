import { create } from 'zustand';

import type { ChatMessage, ObsStatsSnapshot, ProfilesSnapshot, StreamEvent } from '../shared/types.js';

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
  setProfiles: (snapshot: ProfilesSnapshot) => void;
  setObsStats: (stats: ObsStatsSnapshot | ((current: ObsStatsSnapshot) => ObsStatsSnapshot)) => void;
  setChatSnapshot: (snapshot: { messages: ChatMessage[]; events: StreamEvent[] }) => void;
  appendChatMessage: (message: ChatMessage) => void;
  appendChatEvent: (event: StreamEvent) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeProfileId: '',
  chatMessages: [],
  chatEvents: [],
  profiles: [],
  obsStats: DEFAULT_OBS_STATS,
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
    set((state) => ({
      chatMessages: [message, ...state.chatMessages].slice(0, 100),
    })),
  appendChatEvent: (event) =>
    set((state) => ({
      chatEvents: [event, ...state.chatEvents].slice(0, 100),
    })),
}));
