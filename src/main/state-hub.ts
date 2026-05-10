import type { BrowserWindow } from 'electron';

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
  StreamEvent,
  SuggestionSnapshot,
  KickConnectionStatus,
  KickLiveStats,
  TikTokConnectionStatus,
  TikTokLiveStats,
  TwitchConnectionStatus,
  TwitchLiveStats,
  VoiceSpeakPayload,
  YouTubeStreamInfo,
} from '../shared/types.js';

// Foundation placeholder for future push-based state sync to renderer.
export class StateHub {
  private rendererWindow: BrowserWindow | null = null;
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

  pushScheduledStatus(items: ScheduledStatusItem[]): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.scheduledStatus, items);
  }

  pushRaffleState(payload: RaffleSnapshot | null): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.rafflesState, payload);
  }

  pushRaffleEntry(payload: RaffleEntry): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.rafflesEntry, payload);
  }

  pushRaffleResult(payload: RaffleRoundResult): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.rafflesResult, payload);
  }

  pushPollState(payload: PollSnapshot | null): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.pollsState, payload);
  }

  pushPollVote(payload: PollVote): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.pollsVote, payload);
  }

  pushPollResult(payload: PollSnapshot): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.pollsResult, payload);
  }

  pushVoiceSpeak(payload: VoiceSpeakPayload): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.voiceSpeak, payload);
  }

  pushSoundPlay(payload: SoundPlayPayload): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.soundsPlay, payload);
  }

  pushGoogleTtsAudio(payload: { base64: string }): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.voiceGoogleTtsAudio, payload);
  }

  pushSuggestionState(payload: SuggestionSnapshot): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.suggestionsState, payload);
  }

  pushObsStats(payload: ObsStatsSnapshot): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.obsStats, payload);
  }

  pushObsConnected(): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.obsConnected);
  }

  pushObsDisconnected(): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.obsDisconnected);
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

  pushTwitchStatus(status: TwitchConnectionStatus, channel?: string | null): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.twitchStatus, status, channel ?? null);
  }

  pushTwitchLiveStats(channel: string, stats: TwitchLiveStats | null): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.twitchLiveStats, { channel, stats });
  }

  pushYoutubeStatus(streams: YouTubeStreamInfo[]): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.youtubeGetStatus, streams);
  }

  pushTiktokStatus(status: TikTokConnectionStatus, username?: string | null): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.tiktokStatus, status, username ?? null);
  }

  pushTiktokLiveStats(username: string, stats: TikTokLiveStats | null): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.tiktokLiveStats, { username, stats });
  }

  pushKickStatus(status: KickConnectionStatus, slug?: string | null): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.kickStatus, status, slug ?? null);
  }

  pushKickLiveStats(channel: string, stats: KickLiveStats | null): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.kickLiveStats, { channel, stats });
  }

  pushMusicStateUpdate(state: MusicPlayerState): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.musicStateUpdate, state);
  }

  pushMusicPlay(cmd: MusicPlayCommand): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.musicPlay, cmd);
  }

  pushMusicStop(): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.musicStop);
  }

  pushMusicVolume(volume: number): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.musicVolume, volume);
  }

  private flushChatMessages(): void {
    this.chatMessagesFlushTimer = null;
    if (this.pendingChatMessages.length === 0) return;
    const payload = this.pendingChatMessages;
    this.pendingChatMessages = [];
    this.rendererWindow?.webContents.send(IPC_CHANNELS.chatMessagesBatch, payload);
  }

  private flushChatEvents(): void {
    this.chatEventsFlushTimer = null;
    if (this.pendingChatEvents.length === 0) return;
    const payload = this.pendingChatEvents;
    this.pendingChatEvents = [];
    this.rendererWindow?.webContents.send(IPC_CHANNELS.chatEventsBatch, payload);
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
