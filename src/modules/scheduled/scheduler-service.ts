import type { ScheduledMessage, ScheduledStatusItem } from '../../shared/types.js';
import { ScheduledMessageRepository } from './scheduled-repository.js';

interface SchedulerServiceOptions {
  repository: ScheduledMessageRepository;
  onStatus: (items: ScheduledStatusItem[]) => void;
  onDueMessage?: (message: ScheduledMessage) => void;
  now?: () => number;
}

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: SchedulerServiceOptions) {}

  start(): void {
    if (this.timer) return;
    this.emitStatus();
    this.timer = setInterval(() => {
      this.tick();
    }, 5000);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  list(): ScheduledMessage[] {
    return this.options.repository.list();
  }

  upsert(input: Parameters<ScheduledMessageRepository['upsert']>[0]): ScheduledMessage[] {
    const scheduled = this.options.repository.upsert(input);
    this.emitStatusFrom(scheduled);
    return scheduled;
  }

  delete(id: string): ScheduledMessage[] {
    const scheduled = this.options.repository.delete(id);
    this.emitStatusFrom(scheduled);
    return scheduled;
  }

  private tick(): void {
    const scheduled = this.options.repository.list();
    const currentTime = this.now();

    for (const message of scheduled) {
      if (!message.enabled) continue;

      const nextFireTime = this.computeNextFireTime(message, currentTime);
      if (nextFireTime === null || currentTime < nextFireTime) continue;

      const sentAt = new Date(currentTime).toISOString();
      this.options.repository.markSent(message.id, sentAt);
      this.options.onDueMessage?.({ ...message, lastSentAt: sentAt });
    }

    this.emitStatus();
  }

  private emitStatus(): void {
    this.emitStatusFrom(this.options.repository.list());
  }

  private emitStatusFrom(scheduled: ScheduledMessage[]): void {
    const currentTime = this.now();
    this.options.onStatus(
      scheduled.map((message) => ({
        id: message.id,
        enabled: message.enabled,
        nextFireAt: this.toIsoOrNull(this.computeNextFireTime(message, currentTime)),
      })),
    );
  }

  private computeNextFireTime(message: ScheduledMessage, currentTime: number): number | null {
    if (!message.enabled) return null;

    const lastSentAt = message.lastSentAt ? new Date(message.lastSentAt).getTime() : currentTime;
    const jitterWindow = message.randomWindowSeconds * 1000;
    const deterministicJitter = this.computeDeterministicJitter(message.id, lastSentAt, jitterWindow);

    return lastSentAt + message.intervalSeconds * 1000 + deterministicJitter;
  }

  private computeDeterministicJitter(id: string, seedTime: number, jitterWindow: number): number {
    if (jitterWindow <= 0) return 0;

    let hash = 0;
    const source = `${id}:${seedTime}`;
    for (let index = 0; index < source.length; index += 1) {
      hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
    }

    return hash % (jitterWindow + 1);
  }

  private toIsoOrNull(timestamp: number | null): string | null {
    return timestamp === null ? null : new Date(timestamp).toISOString();
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }
}
