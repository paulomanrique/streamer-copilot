import type {
  ChatMessage,
  PermissionLevel,
  PlatformId,
  Poll,
  PollControlInput,
  PollOverlayInfo,
  PollOverlayState,
  PollSnapshot,
  PollTallyEntry,
  PollUpsertInput,
  PollVote,
} from '../../shared/types.js';
import type { CommandModule } from '../commands/command-dispatcher.js';
import type { PollRepository } from './poll-repository.js';

interface PollServiceOptions {
  repository: PollRepository;
  getOverlayInfo: () => PollOverlayInfo;
  onState: (snapshot: PollSnapshot | null) => void;
  onVote: (vote: PollVote) => void;
  onAnnounceResult: (poll: Poll, snapshot: PollSnapshot) => Promise<void>;
  now?: () => number;
  onLog?: (level: 'info' | 'warn' | 'error', message: string, metadata?: Record<string, unknown>) => void;
}

export class PollService implements CommandModule {
  readonly name = 'poll';

  constructor(private readonly options: PollServiceOptions) {}

  list(): Poll[] {
    return this.options.repository.list();
  }

  upsert(input: PollUpsertInput): Poll[] {
    return this.options.repository.upsert(input);
  }

  delete(id: string): Poll[] {
    const active = this.options.repository.getActive();
    if (active && active.id === id) {
      throw new Error('Cannot delete an active poll');
    }
    return this.options.repository.delete(id);
  }

  getActive(): Poll | null {
    return this.options.repository.getActive();
  }

  getSnapshot(pollId: string): PollSnapshot {
    const poll = this.options.repository.get(pollId);
    if (!poll) throw new Error(`Poll "${pollId}" not found`);
    const votes = this.options.repository.listVotes(pollId);
    return this.buildSnapshot(poll, votes);
  }

  getOverlayInfo(): PollOverlayInfo {
    return this.options.getOverlayInfo();
  }

  buildOverlayState(): PollOverlayState | null {
    const active = this.options.repository.getActive();
    if (!active) return null;
    const snapshot = this.getSnapshot(active.id);
    return this.toOverlayState(snapshot);
  }

  async control(input: PollControlInput): Promise<PollSnapshot> {
    this.syncDeadlines();
    const poll = this.options.repository.get(input.pollId);
    if (!poll) throw new Error(`Poll "${input.pollId}" not found`);

    switch (input.action) {
      case 'start':
        return this.start(poll);
      case 'cancel':
        return this.cancel(poll);
      case 'force_close':
        return this.forceClose(poll);
      default:
        throw new Error(`Unsupported action "${(input as { action: string }).action}"`);
    }
  }

  syncDeadlines(): void {
    const active = this.options.repository.getActive();
    if (!active || !active.closesAt) return;
    const deadline = new Date(active.closesAt).getTime();
    if (Number.isNaN(deadline) || deadline > this.now()) return;
    void this.closeAndAnnounce(active).catch((error) => {
      this.log('warn', 'Failed to auto-close poll', {
        pollId: active.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  handle(message: ChatMessage, _permissionLevel: PermissionLevel): void {
    const active = this.options.repository.getActive();
    if (!active) return;

    if (active.closesAt && new Date(active.closesAt).getTime() <= this.now()) {
      void this.closeAndAnnounce(active).catch(() => { /* logged inside */ });
      return;
    }

    if (!this.isAcceptedPlatform(active.acceptedPlatforms, message.platform)) return;

    const trimmed = message.content.trim();
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== trimmed) return;

    const option = active.options.find((opt) => opt.index === parsed);
    if (!option) return;

    const userKey = `${message.platform}:${message.author.toLowerCase()}`;
    const vote = this.options.repository.recordVote({
      pollId: active.id,
      optionId: option.id,
      platform: message.platform,
      userKey,
      displayName: message.author,
      votedAt: new Date(this.now()).toISOString(),
    });

    if (!vote) return;

    this.options.onVote(vote);
    this.emitActiveState();
  }

  private start(poll: Poll): PollSnapshot {
    if (poll.status !== 'draft' && poll.status !== 'closed' && poll.status !== 'cancelled') {
      throw new Error('Only draft polls can be started');
    }
    const otherActive = this.options.repository.getActive();
    if (otherActive && otherActive.id !== poll.id) {
      throw new Error(`Another poll is already active: ${otherActive.title}`);
    }

    const startedAt = new Date(this.now()).toISOString();
    const closesAt = new Date(this.now() + poll.durationSeconds * 1_000).toISOString();
    this.options.repository.clearVotes(poll.id);
    this.options.repository.updateStatus(poll.id, {
      status: 'active',
      startedAt,
      closesAt,
      closedAt: null,
    });
    this.emitActiveState();
    return this.getSnapshot(poll.id);
  }

  private cancel(poll: Poll): PollSnapshot {
    if (poll.status !== 'active') throw new Error('Only active polls can be cancelled');
    this.options.repository.updateStatus(poll.id, {
      status: 'cancelled',
      closedAt: new Date(this.now()).toISOString(),
    });
    this.emitActiveState();
    return this.getSnapshot(poll.id);
  }

  private async forceClose(poll: Poll): Promise<PollSnapshot> {
    if (poll.status !== 'active') throw new Error('Only active polls can be force-closed');
    return this.closeAndAnnounce(poll);
  }

  private async closeAndAnnounce(poll: Poll): Promise<PollSnapshot> {
    const closedAt = new Date(this.now()).toISOString();
    const updated = this.options.repository.updateStatus(poll.id, {
      status: 'closed',
      closedAt,
    });
    if (!updated) throw new Error(`Poll "${poll.id}" disappeared during close`);

    const snapshot = this.getSnapshot(poll.id);
    this.options.onState(snapshot);
    try {
      await this.options.onAnnounceResult(updated, snapshot);
    } catch (error) {
      this.log('warn', 'Failed to announce poll result', {
        pollId: poll.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return snapshot;
  }

  private buildSnapshot(poll: Poll, votes: PollVote[]): PollSnapshot {
    const tally: PollTallyEntry[] = poll.options.map((option) => {
      const count = votes.filter((v) => v.optionId === option.id).length;
      return { optionId: option.id, index: option.index, label: option.label, votes: count, percent: 0 };
    });
    const total = tally.reduce((sum, entry) => sum + entry.votes, 0);
    if (total > 0) {
      for (const entry of tally) {
        entry.percent = Math.round((entry.votes / total) * 1_000) / 10;
      }
    }

    let winner: PollTallyEntry | null = null;
    if (poll.status === 'closed' && total > 0) {
      const sorted = [...tally].sort((a, b) => b.votes - a.votes);
      const top = sorted[0];
      const tied = sorted.filter((entry) => entry.votes === top.votes).length > 1;
      winner = tied ? null : top;
    }

    return { poll, totalVotes: total, tally, winner };
  }

  private toOverlayState(snapshot: PollSnapshot): PollOverlayState {
    return {
      pollId: snapshot.poll.id,
      title: snapshot.poll.title,
      status: snapshot.poll.status,
      totalVotes: snapshot.totalVotes,
      tally: snapshot.tally,
      winner: snapshot.winner,
      closesAt: snapshot.poll.closesAt,
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  private emitActiveState(): void {
    const active = this.options.repository.getActive();
    if (!active) {
      this.options.onState(null);
      return;
    }
    this.options.onState(this.getSnapshot(active.id));
  }

  private isAcceptedPlatform(accepted: PlatformId[], platform: PlatformId): boolean {
    if (accepted.length === 0) return true;
    return accepted.includes(platform);
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private log(level: 'info' | 'warn' | 'error', message: string, metadata?: Record<string, unknown>): void {
    this.options.onLog?.(level, message, metadata);
  }
}

export function formatPollResult(template: string, poll: Poll, snapshot: PollSnapshot): string {
  const winner = snapshot.winner;
  const results = snapshot.tally
    .map((t) => `${t.index}) ${t.label}: ${t.votes} (${t.percent}%)`)
    .join(' | ');
  return template
    .replaceAll('{title}', poll.title)
    .replaceAll('{winner}', winner?.label ?? '—')
    .replaceAll('{winner_votes}', String(winner?.votes ?? 0))
    .replaceAll('{winner_percent}', String(winner?.percent ?? 0))
    .replaceAll('{total_votes}', String(snapshot.totalVotes))
    .replaceAll('{results}', results)
    .trim();
}
