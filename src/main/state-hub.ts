import type { BrowserWindow } from 'electron';

import { IPC_CHANNELS } from '../shared/ipc.js';
import type { ScheduledStatusItem, VoiceSpeakPayload } from '../shared/types.js';

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

  pushVoiceSpeak(payload: VoiceSpeakPayload): void {
    this.rendererWindow?.webContents.send(IPC_CHANNELS.voiceSpeak, payload);
  }
}
