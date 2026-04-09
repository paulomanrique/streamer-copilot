import type { PlatformId, ScheduledMessage, ScheduledStatusItem } from '../../shared/types.js';
import { ScheduledMessageRepository } from './scheduled-repository.js';

export interface ScheduledRunState {
  runAt: string;
  result: 'sent' | 'skipped' | 'failed';
  detail: string | null;
}

interface SchedulerServiceOptions {
  repository: ScheduledMessageRepository;
  onStatus: (items: ScheduledStatusItem[]) => void;
  onDueMessage?: (message: ScheduledMessage) => Promise<ScheduledRunState | void> | ScheduledRunState | void;
  resolveEffectiveTargets?: (message: ScheduledMessage) => PlatformId[];
  now?: () => number;
}

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private readonly lastRunState = new Map<string, ScheduledRunState>();

  constructor(private readonly options: SchedulerServiceOptions) {}

  start(): void {
    if (this.timer) return;
    this.emitStatus();
    this.timer = setInterval(() => {
      void this.tick();
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
    const validIds = new Set(scheduled.map((item) => item.id));
    for (const id of this.lastRunState.keys()) {
      if (!validIds.has(id)) this.lastRunState.delete(id);
    }
    this.emitStatusFrom(scheduled);
    return scheduled;
  }

  delete(id: string): ScheduledMessage[] {
    const scheduled = this.options.repository.delete(id);
    this.lastRunState.delete(id);
    this.emitStatusFrom(scheduled);
    return scheduled;
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    const scheduled = this.options.repository.list();
    const currentTime = this.now();

    try {
      for (const message of scheduled) {
        if (!message.enabled) continue;

        const nextFireTime = this.computeNextFireTime(message, currentTime);
        if (nextFireTime === null || currentTime < nextFireTime) continue;

        const runAt = new Date(currentTime).toISOString();
        this.options.repository.markSent(message.id, runAt);

        try {
          const result = await this.options.onDueMessage?.({ ...message, lastSentAt: runAt });
          this.lastRunState.set(message.id, result ?? { runAt, result: 'sent', detail: null });
        } catch (error) {
          this.lastRunState.set(message.id, {
            runAt,
            result: 'failed',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      this.emitStatus();
      this.ticking = false;
    }
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
        lastRunAt: this.lastRunState.get(message.id)?.runAt ?? null,
        lastResult: this.lastRunState.get(message.id)?.result ?? null,
        lastResultDetail: this.lastRunState.get(message.id)?.detail ?? null,
        effectiveTargets: this.options.resolveEffectiveTargets?.(message) ?? [...message.targetPlatforms],
      })),
    );
  }

  private computeNextFireTime(message: ScheduledMessage, currentTime: number): number | null {
    if (!message.enabled) return null;
    if (!message.lastSentAt) return currentTime;

    const lastSentAt = new Date(message.lastSentAt).getTime();
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
