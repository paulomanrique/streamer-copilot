import { create } from 'zustand';

import type { ChatMessage, ObsStatsSnapshot, PlatformId, PlatformLinkStatus, ProfilesSnapshot, StreamEvent } from '../shared/types.js';

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
   * Symmetric, platform-agnostic connection state. Every consumer reads
   * from this map keyed by `PlatformId`. Adding/removing a platform only
   * touches the registry — never this store shape.
   */
  platformStatus: Partial<Record<PlatformId, PlatformLinkStatus>>;
  /** Primary-channel map for single-account UIs (Twitch login, Kick slug,
   *  TikTok username). Multi-account platforms iterate `platformLiveStats`. */
  platformPrimaryChannel: Partial<Record<PlatformId, string | null>>;
  /** Per-channel live stats keyed by `(platformId, channelKey)`. Stats
   *  payloads are platform-specific; consumers cast via the platform
   *  registry. Core plumbing keeps it `unknown` so cross-platform code
   *  never knows a platform's stat shape. */
  platformLiveStats: Partial<Record<PlatformId, Record<string, unknown>>>;
  /** Updates the symmetric `platformStatus` (and optionally
   *  `platformPrimaryChannel`) entries for one platform. */
  setPlatformStatus: (platformId: PlatformId, status: PlatformLinkStatus, primaryChannel?: string | null) => void;
  /** Updates one entry in `platformLiveStats[platformId][channelKey]`.
   *  Passing `null` removes the entry. */
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
}

export const useAppStore = create<AppStore>((set) => ({
  activeProfileId: '',
  autoSelectActiveProfile: false,
  chatMessages: [],
  chatEvents: [],
  chatSequence: 0,
  profiles: [],
  obsStats: DEFAULT_OBS_STATS,
  platformStatus: {},
  platformPrimaryChannel: {},
  platformLiveStats: {},
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
