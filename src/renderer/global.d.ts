import type { CopilotApi } from '../shared/ipc.js';

declare global {
  interface Window {
    copilot: CopilotApi;
  }
}

export {};
