import { randomUUID } from 'node:crypto';

import type {
  ChatMessage,
  PermissionLevel,
  PlatformId,
  Raffle,
  RaffleControlAction,
  RaffleControlActionInput,
  RaffleCreateInput,
  RaffleEntry,
  RaffleOverlayInfo,
  RaffleOverlayState,
  RaffleRoundActionType,
  RaffleRoundResult,
  RaffleSnapshot,
  RaffleStatus,
  RaffleUpdateInput,
} from '../../shared/types.js';
import type { CommandModule } from '../commands/command-dispatcher.js';
import { type RaffleRepository, type RecordRoundInput } from './raffle-repository.js';

const ACTIVE_STATUSES: RaffleStatus[] = ['collecting', 'ready_to_spin', 'spinning', 'paused_top2'];
const SPIN_DURATION_MS = 7_000;

interface PendingAnimation {
  raffleId: string;
  sessionId: string;
  targetEntryId: string;
  targetEntryLabel: string;
  targetRotationDeg: number;
  durationMs: number;
  startedAt: string;
  actionType: RaffleRoundActionType;
  resultType: 'winner' | 'eliminated';
  roundNumber: number;
  participantCountBefore: number;
  participantCountAfter: number;
  nextStatus: RaffleStatus;
  top2EntryIds: string[];
}

interface RaffleServiceOptions {
  repository: RaffleRepository;
  getOverlayInfo: (raffleId: string) => RaffleOverlayInfo;
  onState: (payload: RaffleSnapshot | null) => void;
  onEntry: (payload: RaffleEntry) => void;
  onResult: (payload: RaffleRoundResult) => void;
  onAnnounceOpen: (raffle: Raffle) => Promise<void>;
  onAnnounceEliminated: (raffle: Raffle, eliminated: RaffleEntry) => Promise<void>;
  onAnnounceWinner: (raffle: Raffle, winner: RaffleEntry) => Promise<void>;
  onSoundEvent?: (raffle: Raffle, event: 'spin' | 'eliminated' | 'winner') => void;
  getSpinDurationMs?: (raffle: Raffle) => Promise<number>;
  onLog?: (level: 'info' | 'warn' | 'error', message: string, metadata?: Record<string, unknown>) => void;
  now?: () => number;
  random?: () => number;
}

export class RaffleService implements CommandModule {
  readonly name = 'raffle';

  private readonly pendingAnimations = new Map<string, PendingAnimation>();
  private readonly pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly options: RaffleServiceOptions) {}

  list(): Raffle[] {
    return this.options.repository.list();
  }

  create(input: RaffleCreateInput): Raffle[] {
    const rows = this.options.repository.create(this.normalizeInput(input));
    this.emitActiveState();
    return rows;
  }

  update(input: RaffleUpdateInput): Raffle[] {
    const raffle = this.requireRaffle(input.id);
    if (ACTIVE_STATUSES.includes(raffle.status)) {
      throw new Error('Active raffles cannot be edited while running');
    }
    const rows = this.options.repository.update({ ...input, ...this.normalizeInput(input) });
    this.emitActiveState();
    return rows;
  }

  delete(id: string): Raffle[] {
    this.cancelPendingAnimation(id);
    const rows = this.options.repository.delete(id);
    this.emitActiveState();
    return rows;
  }

  getActive(): Raffle | null {
    this.syncDeadlines();
    return this.options.repository.getActive();
  }

  getSnapshot(raffleId: string): RaffleSnapshot {
    const snapshot = this.options.repository.getSnapshot(raffleId);
    if (!snapshot) throw new Error(`Raffle "${raffleId}" not found`);
    return {
      ...snapshot,
      overlay: this.buildOverlayState(snapshot.raffle, snapshot.entries),
    };
  }

  getOverlayInfo(raffleId: string): RaffleOverlayInfo {
    this.requireRaffle(raffleId);
    return this.options.getOverlayInfo(raffleId);
  }

  async control(input: RaffleControlActionInput): Promise<RaffleSnapshot> {
    this.syncDeadlines();
    const raffle = this.requireRaffle(input.raffleId);

    switch (input.action) {
      case 'open_entries':
        this.openEntries(raffle);
        break;
      case 'close_entries':
        this.closeEntries(raffle);
        break;
      case 'spin':
        await this.startRound(raffle, 'spin');
        break;
      case 'finalize':
        await this.startRound(raffle, 'finalize');
        break;
      case 'cancel':
        this.cancelRaffle(raffle);
        break;
      case 'reset':
        this.resetRaffle(raffle);
        break;
      default:
        throw new Error(`Unsupported action "${(input as { action: string }).action}"`);
    }

    return this.getSnapshot(input.raffleId);
  }

  handle(message: ChatMessage, permissionLevel: PermissionLevel): void {
    this.syncDeadlines();
    const raffle = this.options.repository.getActive();
    if (!raffle || !raffle.enabled) return;

    if (this.matchesStaffTrigger(raffle, message.content) && this.canUseStaffTrigger(permissionLevel)) {
      const action = this.resolveStaffAction(raffle.status);
      if (!action) return;
      void this.control({ raffleId: raffle.id, action }).catch((error) => {
        this.log('warn', 'Failed to handle raffle staff trigger', {
          raffleId: raffle.id,
          action,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return;
    }

    if (raffle.status !== 'collecting') return;
    if (!message.content.startsWith(raffle.entryCommand)) return;
    if (!this.isAcceptedPlatform(raffle.acceptedPlatforms, message.platform)) return;

    if (raffle.entryDeadlineAt && new Date(raffle.entryDeadlineAt).getTime() <= this.now()) {
      try {
        this.closeEntries(raffle);
      } catch { /* deadline close can fail silently */ }
      return;
    }

    const entry = this.options.repository.registerEntry({
      raffleId: raffle.id,
      platform: this.normalizeEntryPlatform(message.platform),
      userKey: this.buildUserKey(message.platform, message.author),
      displayName: message.author,
      sourceMessageId: message.id,
      enteredAt: new Date(this.now()).toISOString(),
    });

    if (!entry) return;

    this.options.onEntry(entry);
    this.emitActiveState();
  }

  syncDeadlines(): void {
    const raffle = this.options.repository.getActive();
    if (!raffle || raffle.status !== 'collecting' || !raffle.entryDeadlineAt) return;
    const deadline = new Date(raffle.entryDeadlineAt).getTime();
    if (Number.isNaN(deadline) || deadline > this.now()) return;
    try {
      this.closeEntries(raffle);
    } catch (error) {
      this.log('warn', 'Failed to auto-close raffle entries', {
        raffleId: raffle.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  dispose(): void {
    for (const raffleId of this.pendingTimers.keys()) this.cancelPendingAnimation(raffleId);
  }

  private openEntries(raffle: Raffle): void {
    this.assertStatus(raffle, ['draft'], 'Only draft raffles can open entries');
    this.ensureNoOtherActiveRaffle(raffle.id);
    this.options.repository.transitionStatus(raffle.id, 'collecting', {
      winnerEntryId: null,
      top2EntryIds: [],
      currentRound: 0,
      lastSpinAt: null,
      overlaySessionId: null,
    });
    this.emitActiveState();

    if (raffle.openAnnouncementTemplate.trim()) {
      void this.options.onAnnounceOpen(raffle).catch((error) => {
        this.log('warn', 'Failed to send open announcement', {
          raffleId: raffle.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  private closeEntries(raffle: Raffle): void {
    this.assertStatus(raffle, ['collecting'], 'Entries can only be closed while collecting');
    const activeEntries = this.options.repository.listActiveEntries(raffle.id);
    const minimum = raffle.mode === 'survivor-final' ? 2 : 1;
    if (activeEntries.length < minimum) {
      throw new Error(`At least ${minimum} participant(s) are required before closing entries`);
    }
    this.options.repository.transitionStatus(raffle.id, 'ready_to_spin', {
      top2EntryIds: [],
    });
    this.emitActiveState();
  }

  private cancelRaffle(raffle: Raffle): void {
    if (!ACTIVE_STATUSES.includes(raffle.status) && raffle.status !== 'draft') {
      throw new Error('Only draft or active raffles can be cancelled');
    }
    this.cancelPendingAnimation(raffle.id);
    this.options.repository.transitionStatus(raffle.id, 'cancelled');
    this.emitActiveState();
  }

  private resetRaffle(raffle: Raffle): void {
    if (!['completed', 'cancelled'].includes(raffle.status)) {
      throw new Error('Only completed or cancelled raffles can be reset');
    }
    this.cancelPendingAnimation(raffle.id);
    this.options.repository.reset(raffle.id);
    this.emitActiveState();
  }

  private async startRound(raffle: Raffle, requestedAction: 'spin' | 'finalize'): Promise<void> {
    const entries = this.options.repository.listEntries(raffle.id);
    const activeEntries = entries.filter((entry) => !entry.isEliminated && !entry.isWinner);
    if (requestedAction === 'finalize') {
      this.assertStatus(raffle, ['paused_top2'], 'Final can only run after the top 2 pause');
    } else {
      this.assertStatus(raffle, ['ready_to_spin'], 'Spin can only run when the raffle is ready');
    }

    if (activeEntries.length === 0) {
      throw new Error('No active participants available');
    }

    if (requestedAction === 'finalize' && activeEntries.length !== 2) {
      throw new Error('Final requires exactly two active participants');
    }

    const selectedEntry = this.randomPick(activeEntries);
    const roundNumber = raffle.currentRound + 1;
    const startedAt = new Date(this.now()).toISOString();
    const rotation = this.computeRotation(activeEntries, selectedEntry.id, roundNumber);
    const actionType: RaffleRoundActionType = requestedAction === 'finalize' ? 'finalize' : 'spin';
    const isLastSurvivor = raffle.mode === 'survivor-final' && activeEntries.length <= 2;
    const resultType = requestedAction === 'finalize' || raffle.mode === 'single-winner' || isLastSurvivor ? 'winner' : 'eliminated';
    const participantCountAfter = resultType === 'winner' ? Math.max(activeEntries.length - 1, 0) : activeEntries.length - 1;
    const isTop2Pause = raffle.mode === 'survivor-final' && resultType === 'eliminated' && participantCountAfter === 2;
    const nextStatus: RaffleStatus = resultType === 'winner' ? 'completed' : (isTop2Pause ? 'paused_top2' : 'ready_to_spin');
    const top2Entries: string[] = isTop2Pause
      ? activeEntries.filter((e) => e.id !== selectedEntry.id).map((e) => e.id)
      : [];

    const durationMs = this.options.getSpinDurationMs
      ? await this.options.getSpinDurationMs(raffle)
      : SPIN_DURATION_MS;

    const pending: PendingAnimation = {
      raffleId: raffle.id,
      sessionId: randomUUID(),
      targetEntryId: selectedEntry.id,
      targetEntryLabel: selectedEntry.displayName,
      targetRotationDeg: rotation,
      durationMs,
      startedAt,
      actionType,
      resultType,
      roundNumber,
      participantCountBefore: activeEntries.length,
      participantCountAfter,
      nextStatus,
      top2EntryIds: top2Entries,
    };

    this.pendingAnimations.set(raffle.id, pending);
    this.options.repository.transitionStatus(raffle.id, 'spinning', {
      overlaySessionId: pending.sessionId,
      currentRound: roundNumber,
      lastSpinAt: startedAt,
      top2EntryIds: raffle.top2EntryIds,
    });
    this.options.onSoundEvent?.(raffle, 'spin');
    this.emitActiveState();

    const timer = setTimeout(() => {
      void this.finishRound(raffle.id, pending.targetEntryId);
    }, pending.durationMs);
    this.pendingTimers.set(raffle.id, timer);
  }

  private async finishRound(raffleId: string, entryId: string): Promise<void> {
    const pending = this.pendingAnimations.get(raffleId);
    if (!pending || pending.targetEntryId !== entryId) return;

    this.requireRaffle(raffleId);
    const entries = this.options.repository.listEntries(raffleId);
    const selectedEntry = entries.find((entry) => entry.id === entryId);
    if (!selectedEntry) throw new Error('Selected raffle entry no longer exists');

    if (pending.resultType === 'winner') {
      this.options.repository.markWinner(raffleId, entryId);
    } else {
      this.options.repository.eliminateEntry(raffleId, entryId, pending.roundNumber);
    }

    this.options.repository.transitionStatus(raffleId, pending.nextStatus, {
      winnerEntryId: pending.resultType === 'winner' ? entryId : null,
      top2EntryIds: pending.top2EntryIds,
      currentRound: pending.roundNumber,
      overlaySessionId: pending.sessionId,
      lastSpinAt: pending.startedAt,
    });

    // Clear pending only after DB writes so the overlay sees a consistent state
    this.pendingAnimations.delete(raffleId);
    const timer = this.pendingTimers.get(raffleId);
    if (timer) {
      clearTimeout(timer);
      this.pendingTimers.delete(raffleId);
    }

    const round = this.options.repository.recordRound({
      raffleId,
      roundNumber: pending.roundNumber,
      actionType: pending.actionType,
      selectedEntryId: entryId,
      selectedEntryName: selectedEntry.displayName,
      resultType: pending.resultType,
      participantCountBefore: pending.participantCountBefore,
      participantCountAfter: pending.participantCountAfter,
      animationSeedJson: JSON.stringify({
        sessionId: pending.sessionId,
        targetRotationDeg: pending.targetRotationDeg,
        durationMs: pending.durationMs,
      }),
    } satisfies RecordRoundInput);

    this.options.onResult(round);

    const nextSnapshot = this.getSnapshot(raffleId);
    this.options.onState(nextSnapshot);

    const affectedEntry = nextSnapshot.entries.find((entry) => entry.id === entryId);
    this.options.onSoundEvent?.(nextSnapshot.raffle, pending.resultType);
    if (pending.resultType === 'winner') {
      if (affectedEntry) {
        try {
          await this.options.onAnnounceWinner(nextSnapshot.raffle, affectedEntry);
        } catch (error) {
          this.log('warn', 'Failed to announce raffle winner', {
            raffleId,
            entryId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else {
      if (affectedEntry && nextSnapshot.raffle.eliminationAnnouncementTemplate.trim()) {
        try {
          await this.options.onAnnounceEliminated(nextSnapshot.raffle, affectedEntry);
        } catch (error) {
          this.log('warn', 'Failed to announce raffle elimination', {
            raffleId,
            entryId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  private emitActiveState(): void {
    const active = this.options.repository.getActive();
    if (!active) {
      this.options.onState(null);
      return;
    }
    this.options.onState(this.getSnapshot(active.id));
  }

  private buildOverlayState(raffle: Raffle, entries: RaffleEntry[]): RaffleOverlayState {
    const pending = this.pendingAnimations.get(raffle.id);
    const highlightedEntryId = pending?.targetEntryId ?? raffle.winnerEntryId ?? null;
    const highlightedEntryLabel = highlightedEntryId
      ? entries.find((entry) => entry.id === highlightedEntryId)?.displayName ?? null
      : null;
    const top2Entries = entries.filter((entry) => raffle.top2EntryIds.includes(entry.id));
    // Keep the winner visible on the wheel when the raffle is completed so the
    // highlighted segment still exists. Eliminations only apply to survivor mode.
    const activeEntries = entries.filter((entry) => {
      if (entry.isEliminated) return false;
      if (entry.isWinner && raffle.status !== 'completed') return false;
      return true;
    });
    return {
      raffleId: raffle.id,
      title: raffle.title,
      mode: raffle.mode,
      status: raffle.status,
      sessionId: pending?.sessionId ?? raffle.overlaySessionId,
      totalEntries: entries.length,
      activeEntries: activeEntries.map((entry) => ({ id: entry.id, label: entry.displayName })),
      highlightedEntryId,
      highlightedEntryLabel,
      top2EntryIds: raffle.top2EntryIds,
      top2Labels: top2Entries.map((entry) => entry.displayName),
      round: raffle.currentRound,
      animation: {
        targetEntryId: pending?.targetEntryId ?? null,
        targetRotationDeg: pending?.targetRotationDeg ?? 0,
        durationMs: pending?.durationMs ?? 0,
        startedAt: pending?.startedAt ?? null,
      },
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  private computeRotation(entries: RaffleEntry[], targetEntryId: string, _roundNumber: number): number {
    const index = Math.max(
      0,
      entries.findIndex((entry) => entry.id === targetEntryId),
    );
    const arc = 360 / Math.max(entries.length, 1);
    const targetCenterDeg = index * arc + arc / 2;
    const laps = 8;
    return laps * 360 + (360 - targetCenterDeg);
  }

  private randomPick<T>(items: T[]): T {
    const rng = this.options.random ? this.options.random() : Math.random();
    const index = Math.min(items.length - 1, Math.floor(rng * items.length));
    return items[index];
  }

  private requireRaffle(id: string): Raffle {
    const raffle = this.options.repository.getById(id);
    if (!raffle) throw new Error(`Raffle "${id}" not found`);
    return raffle;
  }

  private ensureNoOtherActiveRaffle(raffleId: string): void {
    const current = this.options.repository.getActive();
    if (current && current.id !== raffleId) {
      throw new Error(`Another raffle is already active: ${current.title}`);
    }
  }

  private assertStatus(raffle: Raffle, allowed: RaffleStatus[], message: string): void {
    if (!allowed.includes(raffle.status)) throw new Error(message);
  }

  private normalizeInput<T extends RaffleCreateInput>(input: T): T {
    return {
      ...input,
      title: input.title.trim(),
      entryCommand: input.entryCommand.trim(),
      acceptedPlatforms: Array.from(new Set(input.acceptedPlatforms.map((platform) => this.normalizeEntryPlatform(platform)))),
      staffTriggerCommand: input.staffTriggerCommand.trim(),
      winnerAnnouncementTemplate: input.winnerAnnouncementTemplate.trim(),
    };
  }

  private buildUserKey(platform: PlatformId, author: string): string {
    return `${this.normalizeEntryPlatform(platform)}:${author.trim().toLowerCase()}`;
  }

  private normalizeEntryPlatform(platform: PlatformId): PlatformId {
    return platform === 'youtube-v' ? 'youtube' : platform;
  }

  private isAcceptedPlatform(acceptedPlatforms: PlatformId[], platform: PlatformId): boolean {
    const normalized = this.normalizeEntryPlatform(platform);
    return acceptedPlatforms.some((item) => this.normalizeEntryPlatform(item) === normalized);
  }

  private matchesStaffTrigger(raffle: Raffle, content: string): boolean {
    return Boolean(raffle.staffTriggerCommand && content.startsWith(raffle.staffTriggerCommand));
  }

  private canUseStaffTrigger(level: PermissionLevel): boolean {
    return level === 'moderator' || level === 'broadcaster';
  }

  private resolveStaffAction(status: RaffleStatus): RaffleControlAction | null {
    switch (status) {
      case 'collecting':
        return 'close_entries';
      case 'ready_to_spin':
        return 'spin';
      case 'paused_top2':
        return 'finalize';
      default:
        return null;
    }
  }

  private cancelPendingAnimation(raffleId: string): void {
    const timer = this.pendingTimers.get(raffleId);
    if (timer) clearTimeout(timer);
    this.pendingTimers.delete(raffleId);
    this.pendingAnimations.delete(raffleId);
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private log(level: 'info' | 'warn' | 'error', message: string, metadata?: Record<string, unknown>): void {
    this.options.onLog?.(level, message, metadata);
  }
}
