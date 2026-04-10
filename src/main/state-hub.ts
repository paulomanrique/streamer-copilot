import type { BrowserWindow } from 'electron';

import { IPC_CHANNELS } from '../shared/ipc.js';
import type {
  ChatMessage,
  ObsStatsSnapshot,
  RaffleEntry,
  RaffleRoundResult,
  RaffleSnapshot,
  ScheduledStatusItem,
  SoundPlayPayload,
  StreamEvent,
  TwitchConnectionStatus,
  TwitchLiveStats,
  VoiceSpeakPayload,
  YouTubeStreamInfo,
} from '../shared/types.js';

// Foundation placeholder for future push-based state sync to renderer.
export class StateHub {
  private rendererWindow: BrowserWindow | null = null;

  attachWindow(window: BrowserWindow): void {
    this.rendererWindow = window;
  }

  detachWindow(): void {
    this.rendererWindow = null;
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

  pushVoiceSpeak(payload: VoiceSpeakPayload): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.voiceSpeak, payload);
  }

  pushSoundPlay(payload: SoundPlayPayload): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.soundsPlay, payload);
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
    this.rendererWindow?.webContents.send(IPC_CHANNELS.chatMessage, payload);
  }

  pushChatEvent(payload: StreamEvent): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.chatEvent, payload);
  }

  pushTwitchStatus(status: TwitchConnectionStatus, channel?: string | null): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.twitchStatus, status, channel ?? null);
  }

  pushTwitchLiveStats(stats: TwitchLiveStats): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.twitchLiveStats, stats);
  }

  pushYoutubeStatus(streams: YouTubeStreamInfo[]): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.youtubeGetStatus, streams);
  }
}
