import type { BrowserWindow } from 'electron';

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
}
