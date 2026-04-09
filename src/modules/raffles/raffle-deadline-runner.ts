interface RaffleDeadlineRunnerOptions {
  onTick: () => void;
  intervalMs?: number;
}

export class RaffleDeadlineRunner {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: RaffleDeadlineRunnerOptions) {}

  start(): void {
    if (this.timer) return;
    this.options.onTick();
    this.timer = setInterval(() => {
      this.options.onTick();
    }, this.options.intervalMs ?? 1_000);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
