import type { ChatMessage, PlatformId, SoundPlayPayload, WelcomeSettings } from '../../shared/types.js';

interface WelcomeServiceOptions {
  getSettings: () => WelcomeSettings;
  sendMessage: (platform: PlatformId, content: string) => Promise<void>;
  playSound: (payload: SoundPlayPayload) => void;
  logInfo: (message: string, metadata?: unknown) => void;
  logError: (message: string, metadata?: unknown) => void;
}

export class WelcomeService {
  /** Tracks authors already seen this session, keyed by `platform:author`. */
  private readonly seenUsers = new Set<string>();

  constructor(private readonly options: WelcomeServiceOptions) {}

  /**
   * Call for every incoming chat message. If the author has not been seen
   * before in this session, and the welcome feature is enabled, sends a
   * welcome message and optionally plays a sound.
   */
  handleMessage(message: ChatMessage): void {
    const key = `${message.platform}:${message.author}`;
    if (this.seenUsers.has(key)) return;
    this.seenUsers.add(key);

    const settings = this.options.getSettings();
    if (!settings.enabled) return;

    const content = settings.messageTemplate.replace(/\{username\}/g, message.author);

    if (content) {
      void this.options.sendMessage(message.platform, content).then(
        () => this.options.logInfo('Sent welcome message', { platform: message.platform, author: message.author }),
        (cause) => this.options.logError('Failed to send welcome message', {
          platform: message.platform,
          author: message.author,
          error: cause instanceof Error ? cause.message : String(cause),
        }),
      );
    }

    if (settings.soundFilePath) {
      this.options.playSound({ filePath: settings.soundFilePath });
    }
  }

  /** Resets tracked users (e.g. on profile switch). */
  reset(): void {
    this.seenUsers.clear();
  }
}
