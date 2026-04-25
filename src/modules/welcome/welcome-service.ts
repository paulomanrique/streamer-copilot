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
    const settings = this.options.getSettings();
    if (!settings.enabled) return;

    const key = `${message.platform}:${message.author}`;
    if (this.seenUsers.has(key)) return;
    this.seenUsers.add(key);

    // Look up per-user override (case-insensitive)
    const override = settings.userOverrides?.find(
      (o) => o.username.toLowerCase() === message.author.toLowerCase(),
    );

    // Resolve the global message first (with {username} replaced)
    const globalMessage = settings.messageTemplate.replace(/\{username\}/g, message.author);

    // Determine the effective message template
    let effectiveTemplate: string;
    if (override?.messageTemplate) {
      // Override template — resolve {global-welcome-message} first, then {username}
      effectiveTemplate = override.messageTemplate
        .replace(/\{global-welcome-message\}/g, globalMessage)
        .replace(/\{username\}/g, message.author);
    } else {
      effectiveTemplate = globalMessage;
    }

    if (effectiveTemplate) {
      void this.options.sendMessage(message.platform, effectiveTemplate).then(
        () => this.options.logInfo('Sent welcome message', { platform: message.platform, author: message.author }),
        (cause) => this.options.logError('Failed to send welcome message', {
          platform: message.platform,
          author: message.author,
          error: cause instanceof Error ? cause.message : String(cause),
        }),
      );
    }

    // Override sound takes priority; fallback to global
    const soundFilePath = override?.soundFilePath ?? settings.soundFilePath;
    if (soundFilePath) {
      this.options.playSound({ filePath: soundFilePath });
    }
  }

  /** Resets tracked users (e.g. on profile switch). */
  reset(): void {
    this.seenUsers.clear();
  }
}
