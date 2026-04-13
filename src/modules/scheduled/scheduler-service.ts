import type { PlatformId, ScheduledStatusItem } from '../../shared/types.js';

export interface ScheduledRunState {
  runAt: string;
  result: 'sent' | 'skipped' | 'failed';
  detail: string | null;
}

export interface ScheduledTask {
  id: string;
  intervalSeconds: number;
  randomWindowSeconds: number;
  targetPlatforms: PlatformId[];
  enabled: boolean;
  lastSentAt: string | null;
}

interface SchedulerSource {
  list: () => ScheduledTask[];
  markSent: (id: string, sentAt: string) => void;
}

interface SchedulerServiceOptions {
  source: SchedulerSource;
  onStatus: (items: ScheduledStatusItem[]) => void;
  onDueTask?: (task: ScheduledTask) => Promise<ScheduledRunState | void> | ScheduledRunState | void;
  resolveEffectiveTargets?: (task: ScheduledTask) => PlatformId[];
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

  refreshStatus(): void {
    this.emitStatus();
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    const scheduled = this.options.source.list();
    const currentTime = this.now();

    try {
      for (const task of scheduled) {
        if (!task.enabled) continue;

        const nextFireTime = this.computeNextFireTime(task, currentTime);
        if (nextFireTime === null || currentTime < nextFireTime) continue;

        const runAt = new Date(currentTime).toISOString();
        this.options.source.markSent(task.id, runAt);

        try {
          const result = await this.options.onDueTask?.({ ...task, lastSentAt: runAt });
          this.lastRunState.set(task.id, result ?? { runAt, result: 'sent', detail: null });
        } catch (error) {
          this.lastRunState.set(task.id, {
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
    this.emitStatusFrom(this.options.source.list());
  }

  private emitStatusFrom(scheduled: ScheduledTask[]): void {
    const currentTime = this.now();
    this.options.onStatus(
      scheduled.map((task) => ({
        id: task.id,
        enabled: task.enabled,
        nextFireAt: this.toIsoOrNull(this.computeNextFireTime(task, currentTime)),
        lastRunAt: this.lastRunState.get(task.id)?.runAt ?? null,
        lastResult: this.lastRunState.get(task.id)?.result ?? null,
        lastResultDetail: this.lastRunState.get(task.id)?.detail ?? null,
        effectiveTargets: this.options.resolveEffectiveTargets?.(task) ?? [...task.targetPlatforms],
      })),
    );
  }

  private computeNextFireTime(task: ScheduledTask, currentTime: number): number | null {
    if (!task.enabled) return null;
    if (!task.lastSentAt) return currentTime;

    const lastSentAt = new Date(task.lastSentAt).getTime();
    const jitterWindow = task.randomWindowSeconds * 1000;
    const deterministicJitter = this.computeDeterministicJitter(task.id, lastSentAt, jitterWindow);

    return lastSentAt + task.intervalSeconds * 1000 + deterministicJitter;
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
