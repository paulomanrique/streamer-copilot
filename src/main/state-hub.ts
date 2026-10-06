import type { BrowserWindow, WebContents } from 'electron';

import { IPC_CHANNELS } from '../shared/ipc.js';
import type {
  ChatMessage,
  MusicPlayCommand,
  MusicPlayerState,
  ObsStatsSnapshot,
  PollSnapshot,
  PollVote,
  RaffleEntry,
  RaffleRoundResult,
  RaffleSnapshot,
  ScheduledStatusItem,
  SoundPlayPayload,
  OverlayDefaults,
  OverlayPreferencesMap,
  StreamEvent,
  SubscriberTierCatalog,
  SuggestionSnapshot,
  UserList,
  PlatformId,
  PlatformLinkStatus,
  VoiceSpeakPayload,
  LiveOutputsSnapshot,
  PlatformAccountStatus,
  WindowSyncEvent,
} from '../shared/types.js';

// Push-based state sync to the renderer windows. The main window is the one
// that plays media (sounds, TTS, music); auxiliary app windows (settings) get
// every state push so their views stay live, but never the playback commands —
// otherwise each open window would play the same sound.
export class StateHub {
  private rendererWindow: BrowserWindow | null = null;
  private auxWindows = new Set<BrowserWindow>();
  private pendingChatMessages: ChatMessage[] = [];
  private pendingChatEvents: StreamEvent[] = [];
  private chatMessagesFlushTimer: NodeJS.Timeout | null = null;
  private chatEventsFlushTimer: NodeJS.Timeout | null = null;

  attachWindow(window: BrowserWindow): void {
    this.rendererWindow = window;
  }

  detachWindow(): void {
    this.rendererWindow = null;
    this.clearPendingChatFlushes();
  }

  hasWindow(): boolean {
    return this.rendererWindow !== null;
  }

  attachAuxWindow(window: BrowserWindow): void {
    this.auxWindows.add(window);
  }

  detachAuxWindow(window: BrowserWindow): void {
    this.auxWindows.delete(window);
  }

  pushAccountStatus(payload: PlatformAccountStatus): void {
    this.broadcast(IPC_CHANNELS.accountsStatus, payload);
  }

  /** Main-originated catalog change, sent to every app window. */
  pushWindowSync(payload: WindowSyncEvent): void {
    this.broadcast(IPC_CHANNELS.windowSyncUpdate, payload);
  }

  /** Relays a renderer-originated sync event to every app window except the
   *  one that sent it. */
  relayWindowSync(sender: WebContents, payload: WindowSyncEvent): void {
    for (const window of this.appWindows()) {
      if (window.webContents === sender) continue;
      window.webContents.send(IPC_CHANNELS.windowSyncUpdate, payload);
    }
  }

  private appWindows(): BrowserWindow[] {
    const windows = this.rendererWindow ? [this.rendererWindow, ...this.auxWindows] : [...this.auxWindows];
    return windows.filter((window) => !window.isDestroyed());
  }

  private broadcast(channel: string, ...args: unknown[]): void {
    for (const window of this.appWindows()) window.webContents.send(channel, ...args);
  }

  private sendToMain(channel: string, ...args: unknown[]): void {
    if (this.rendererWindow && !this.rendererWindow.isDestroyed()) this.rendererWindow.webContents.send(channel, ...args);
  }

  pushScheduledStatus(items: ScheduledStatusItem[]): void {
    this.broadcast(IPC_CHANNELS.scheduledStatus, items);
  }

  pushRaffleState(payload: RaffleSnapshot | null): void {
    this.broadcast(IPC_CHANNELS.rafflesState, payload);
  }

  pushRaffleEntry(payload: RaffleEntry): void {
    this.broadcast(IPC_CHANNELS.rafflesEntry, payload);
  }

  pushRaffleResult(payload: RaffleRoundResult): void {
    this.broadcast(IPC_CHANNELS.rafflesResult, payload);
  }

  pushPollState(payload: PollSnapshot | null): void {
    this.broadcast(IPC_CHANNELS.pollsState, payload);
  }

  pushPollVote(payload: PollVote): void {
    this.broadcast(IPC_CHANNELS.pollsVote, payload);
  }

  pushPollResult(payload: PollSnapshot): void {
    this.broadcast(IPC_CHANNELS.pollsResult, payload);
  }

  pushVoiceSpeak(payload: VoiceSpeakPayload): void {
    this.sendToMain(IPC_CHANNELS.voiceSpeak, payload);
  }

  pushSoundPlay(payload: SoundPlayPayload): void {
    this.sendToMain(IPC_CHANNELS.soundsPlay, payload);
  }

  pushSubscriberTiers(payload: SubscriberTierCatalog): void {
    this.broadcast(IPC_CHANNELS.subscriberTiersUpdate, payload);
  }

  pushUserLists(payload: UserList[]): void {
    this.broadcast(IPC_CHANNELS.userListsUpdate, payload);
  }

  pushOverlayPreferences(payload: OverlayPreferencesMap): void {
    this.broadcast(IPC_CHANNELS.overlayPrefsUpdate, payload);
  }

  pushOverlayDefaults(payload: OverlayDefaults): void {
    this.broadcast(IPC_CHANNELS.overlayDefaultsUpdate, payload);
  }

  pushHighlightedMessage(payload: { messageId: string | null }): void {
    this.broadcast(IPC_CHANNELS.highlightMessageUpdate, payload);
  }

  pushGoogleTtsAudio(payload: { base64: string }): void {
    this.sendToMain(IPC_CHANNELS.voiceGoogleTtsAudio, payload);
  }

  pushSuggestionState(payload: SuggestionSnapshot): void {
    this.broadcast(IPC_CHANNELS.suggestionsState, payload);
  }

  pushObsStats(payload: ObsStatsSnapshot): void {
    this.broadcast(IPC_CHANNELS.obsStats, payload);
  }

  pushObsConnected(): void {
    this.broadcast(IPC_CHANNELS.obsConnected);
  }

  pushObsDisconnected(): void {
    this.broadcast(IPC_CHANNELS.obsDisconnected);
  }

  pushChatMessage(payload: ChatMessage): void {
    this.pendingChatMessages.push(payload);
    if (this.chatMessagesFlushTimer) return;
    this.chatMessagesFlushTimer = setTimeout(() => this.flushChatMessages(), 50);
  }

  pushChatEvent(payload: StreamEvent): void {
    this.pendingChatEvents.push(payload);
    if (this.chatEventsFlushTimer) return;
    this.chatEventsFlushTimer = setTimeout(() => this.flushChatEvents(), 50);
  }

  /** Unified, platform-agnostic status push. Every platform reports through
   *  this single channel keyed by `platformId`. */
  pushPlatformStatus(platformId: PlatformId, status: PlatformLinkStatus, primaryChannel: string | null = null): void {
    this.broadcast(IPC_CHANNELS.platformStatus, {
      platformId,
      status,
      primaryChannel,
    });
  }

  /** Unified live-stats push. `channelKey` is the per-account identifier
   *  (channel slug, username, video id, etc.) — meaningful only to the
   *  platform's own renderer code. */
  pushPlatformLiveStats(platformId: PlatformId, channelKey: string, stats: unknown | null): void {
    this.broadcast(IPC_CHANNELS.platformLiveStats, {
      platformId,
      channelKey,
      stats,
    });
  }

  pushMusicStateUpdate(state: MusicPlayerState): void {
    this.broadcast(IPC_CHANNELS.musicStateUpdate, state);
  }

  pushMusicPlay(cmd: MusicPlayCommand): void {
    this.sendToMain(IPC_CHANNELS.musicPlay, cmd);
  }

  pushMusicStop(): void {
    this.sendToMain(IPC_CHANNELS.musicStop);
  }

  pushMusicVolume(volume: number): void {
    this.sendToMain(IPC_CHANNELS.musicVolume, volume);
  }

  pushLiveOutputs(payload: LiveOutputsSnapshot): void {
    this.broadcast(IPC_CHANNELS.liveOutputsUpdate, payload);
  }

  private flushChatMessages(): void {
    this.chatMessagesFlushTimer = null;
    if (this.pendingChatMessages.length === 0) return;
    const payload = this.pendingChatMessages;
    this.pendingChatMessages = [];
    this.broadcast(IPC_CHANNELS.chatMessagesBatch, payload);
  }

  private flushChatEvents(): void {
    this.chatEventsFlushTimer = null;
    if (this.pendingChatEvents.length === 0) return;
    const payload = this.pendingChatEvents;
    this.pendingChatEvents = [];
    this.broadcast(IPC_CHANNELS.chatEventsBatch, payload);
  }

  private clearPendingChatFlushes(): void {
    if (this.chatMessagesFlushTimer) clearTimeout(this.chatMessagesFlushTimer);
    if (this.chatEventsFlushTimer) clearTimeout(this.chatEventsFlushTimer);
    this.chatMessagesFlushTimer = null;
    this.chatEventsFlushTimer = null;
    this.pendingChatMessages = [];
    this.pendingChatEvents = [];
  }
}
