import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  PlatformId,
  Raffle,
  RaffleCreateInput,
  RaffleEntry,
  RaffleRoundActionType,
  RaffleRoundResult,
  RaffleRoundResultType,
  RaffleSnapshot,
  RaffleStatus,
  RaffleUpdateInput,
} from '../../shared/types.js';

interface RaffleRow {
  id: string;
  title: string;
  entry_command: string;
  mode: Raffle['mode'];
  status: RaffleStatus;
  entry_deadline_at: string | null;
  accepted_platforms_json: string;
  staff_trigger_command: string;
  winner_announcement_template: string;
  winner_entry_id: string | null;
  top2_entry_ids_json: string;
  last_spin_at: string | null;
  current_round: number;
  overlay_session_id: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
  entries_count: number;
  active_entries_count: number;
}

interface RaffleEntryRow {
  id: string;
  raffle_id: string;
  platform: PlatformId;
  user_key: string;
  display_name: string;
  source_message_id: string | null;
  entered_at: string;
  is_eliminated: number;
  elimination_order: number | null;
  is_winner: number;
}

interface RaffleRoundRow {
  id: string;
  raffle_id: string;
  round_number: number;
  action_type: RaffleRoundActionType;
  selected_entry_id: string;
  selected_entry_name: string;
  result_type: RaffleRoundResultType;
  participant_count_before: number;
  participant_count_after: number;
  animation_seed_json: string | null;
  created_at: string;
}

export interface RecordRoundInput {
  raffleId: string;
  roundNumber: number;
  actionType: RaffleRoundActionType;
  selectedEntryId: string;
  selectedEntryName: string;
  resultType: RaffleRoundResultType;
  participantCountBefore: number;
  participantCountAfter: number;
  animationSeedJson: string | null;
}

export interface RegisterEntryInput {
  raffleId: string;
  platform: PlatformId;
  userKey: string;
  displayName: string;
  sourceMessageId: string | null;
  enteredAt: string;
}

export class RaffleRepository {
  constructor(private readonly db: Database.Database) {}

  list(): Raffle[] {
    return this.listRows().map((row) => this.mapRaffleRow(row));
  }

  getById(id: string): Raffle | null {
    const row = this.getRaffleRow(id);
    return row ? this.mapRaffleRow(row) : null;
  }

  getActive(): Raffle | null {
    const row = this.db
      .prepare(
        `
          SELECT
            r.*,
            (SELECT COUNT(*) FROM raffle_entries e WHERE e.raffle_id = r.id) AS entries_count,
            (SELECT COUNT(*) FROM raffle_entries e WHERE e.raffle_id = r.id AND e.is_eliminated = 0) AS active_entries_count
          FROM raffles r
          WHERE r.status IN ('collecting', 'ready_to_spin', 'spinning', 'paused_top2')
          ORDER BY r.updated_at DESC, r.created_at DESC
          LIMIT 1
        `,
      )
      .get() as RaffleRow | undefined;

    return row ? this.mapRaffleRow(row) : null;
  }

  create(input: RaffleCreateInput): Raffle[] {
    const id = randomUUID();
    this.db
      .prepare(
        `
          INSERT INTO raffles (
            id,
            title,
            entry_command,
            mode,
            status,
            entry_deadline_at,
            accepted_platforms_json,
            staff_trigger_command,
            winner_announcement_template,
            enabled,
            top2_entry_ids_json,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, '[]', datetime('now'), datetime('now'))
        `,
      )
      .run(
        id,
        input.title,
        input.entryCommand,
        input.mode,
        input.entryDeadlineAt,
        JSON.stringify(input.acceptedPlatforms),
        input.staffTriggerCommand,
        input.winnerAnnouncementTemplate,
        input.enabled ? 1 : 0,
      );

    return this.list();
  }

  update(input: RaffleUpdateInput): Raffle[] {
    this.db
      .prepare(
        `
          UPDATE raffles
          SET title = ?,
              entry_command = ?,
              mode = ?,
              entry_deadline_at = ?,
              accepted_platforms_json = ?,
              staff_trigger_command = ?,
              winner_announcement_template = ?,
              enabled = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `,
      )
      .run(
        input.title,
        input.entryCommand,
        input.mode,
        input.entryDeadlineAt,
        JSON.stringify(input.acceptedPlatforms),
        input.staffTriggerCommand,
        input.winnerAnnouncementTemplate,
        input.enabled ? 1 : 0,
        input.id,
      );

    return this.list();
  }

  delete(id: string): Raffle[] {
    this.db.prepare('DELETE FROM raffles WHERE id = ?').run(id);
    return this.list();
  }

  listEntries(raffleId: string): RaffleEntry[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, raffle_id, platform, user_key, display_name, source_message_id, entered_at, is_eliminated, elimination_order, is_winner
          FROM raffle_entries
          WHERE raffle_id = ?
          ORDER BY entered_at ASC, id ASC
        `,
      )
      .all(raffleId) as RaffleEntryRow[];

    return rows.map((row) => this.mapEntryRow(row));
  }

  listActiveEntries(raffleId: string): RaffleEntry[] {
    return this.listEntries(raffleId).filter((entry) => !entry.isEliminated && !entry.isWinner);
  }

  listRounds(raffleId: string): RaffleRoundResult[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, raffle_id, round_number, action_type, selected_entry_id, selected_entry_name, result_type, participant_count_before, participant_count_after, animation_seed_json, created_at
          FROM raffle_rounds
          WHERE raffle_id = ?
          ORDER BY round_number ASC, created_at ASC, id ASC
        `,
      )
      .all(raffleId) as RaffleRoundRow[];

    return rows.map((row) => this.mapRoundRow(row));
  }

  getSnapshot(raffleId: string): RaffleSnapshot | null {
    const raffle = this.getById(raffleId);
    if (!raffle) return null;
    const entries = this.listEntries(raffleId);
    const activeEntries = entries.filter((entry) => !entry.isEliminated && !entry.isWinner);
    return {
      raffle,
      entries,
      activeEntries,
      overlay: null,
      history: this.listRounds(raffleId),
    };
  }

  registerEntry(input: RegisterEntryInput): RaffleEntry | null {
    try {
      this.db
        .prepare(
          `
            INSERT INTO raffle_entries (
              id,
              raffle_id,
              platform,
              user_key,
              display_name,
              source_message_id,
              entered_at,
              is_eliminated,
              is_winner
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
          `,
        )
        .run(randomUUID(), input.raffleId, input.platform, input.userKey, input.displayName, input.sourceMessageId, input.enteredAt);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) return null;
      throw error;
    }

    const row = this.db
      .prepare(
        `
          SELECT id, raffle_id, platform, user_key, display_name, source_message_id, entered_at, is_eliminated, elimination_order, is_winner
          FROM raffle_entries
          WHERE raffle_id = ? AND user_key = ?
        `,
      )
      .get(input.raffleId, input.userKey) as RaffleEntryRow | undefined;

    return row ? this.mapEntryRow(row) : null;
  }

  transitionStatus(raffleId: string, status: RaffleStatus, extras: {
    winnerEntryId?: string | null;
    top2EntryIds?: string[];
    lastSpinAt?: string | null;
    currentRound?: number;
    overlaySessionId?: string | null;
  } = {}): void {
    const current = this.getById(raffleId);
    if (!current) throw new Error(`Raffle "${raffleId}" not found`);

    this.db
      .prepare(
        `
          UPDATE raffles
          SET status = ?,
              winner_entry_id = ?,
              top2_entry_ids_json = ?,
              last_spin_at = ?,
              current_round = ?,
              overlay_session_id = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `,
      )
      .run(
        status,
        extras.winnerEntryId ?? current.winnerEntryId,
        JSON.stringify(extras.top2EntryIds ?? current.top2EntryIds),
        extras.lastSpinAt ?? current.lastSpinAt,
        extras.currentRound ?? current.currentRound,
        extras.overlaySessionId ?? current.overlaySessionId,
        raffleId,
      );
  }

  eliminateEntry(raffleId: string, entryId: string, eliminationOrder: number): void {
    this.db
      .prepare(
        `
          UPDATE raffle_entries
          SET is_eliminated = 1,
              elimination_order = ?
          WHERE raffle_id = ? AND id = ?
        `,
      )
      .run(eliminationOrder, raffleId, entryId);
  }

  markWinner(raffleId: string, entryId: string): void {
    this.db
      .prepare(
        `
          UPDATE raffle_entries
          SET is_winner = CASE WHEN id = ? THEN 1 ELSE is_winner END
          WHERE raffle_id = ?
        `,
      )
      .run(entryId, raffleId);
  }

  recordRound(input: RecordRoundInput): RaffleRoundResult {
    const id = randomUUID();
    this.db
      .prepare(
        `
          INSERT INTO raffle_rounds (
            id,
            raffle_id,
            round_number,
            action_type,
            selected_entry_id,
            selected_entry_name,
            result_type,
            participant_count_before,
            participant_count_after,
            animation_seed_json,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
      )
      .run(
        id,
        input.raffleId,
        input.roundNumber,
        input.actionType,
        input.selectedEntryId,
        input.selectedEntryName,
        input.resultType,
        input.participantCountBefore,
        input.participantCountAfter,
        input.animationSeedJson,
      );

    return this.listRounds(input.raffleId).at(-1) as RaffleRoundResult;
  }

  reset(raffleId: string): void {
    const tx = this.db.transaction((id: string) => {
      this.db.prepare('DELETE FROM raffle_entries WHERE raffle_id = ?').run(id);
      this.db.prepare('DELETE FROM raffle_rounds WHERE raffle_id = ?').run(id);
      this.db
        .prepare(
          `
            UPDATE raffles
            SET status = 'draft',
                winner_entry_id = NULL,
                top2_entry_ids_json = '[]',
                last_spin_at = NULL,
                current_round = 0,
                overlay_session_id = NULL,
                updated_at = datetime('now')
            WHERE id = ?
          `,
        )
        .run(id);
    });
    tx(raffleId);
  }

  private listRows(): RaffleRow[] {
    return this.db
      .prepare(
        `
          SELECT
            r.*,
            (SELECT COUNT(*) FROM raffle_entries e WHERE e.raffle_id = r.id) AS entries_count,
            (SELECT COUNT(*) FROM raffle_entries e WHERE e.raffle_id = r.id AND e.is_eliminated = 0 AND e.is_winner = 0) AS active_entries_count
          FROM raffles r
          ORDER BY r.created_at DESC, r.id DESC
        `,
      )
      .all() as RaffleRow[];
  }

  private getRaffleRow(id: string): RaffleRow | null {
    const row = this.db
      .prepare(
        `
          SELECT
            r.*,
            (SELECT COUNT(*) FROM raffle_entries e WHERE e.raffle_id = r.id) AS entries_count,
            (SELECT COUNT(*) FROM raffle_entries e WHERE e.raffle_id = r.id AND e.is_eliminated = 0 AND e.is_winner = 0) AS active_entries_count
          FROM raffles r
          WHERE r.id = ?
        `,
      )
      .get(id) as RaffleRow | undefined;

    return row ?? null;
  }

  private mapRaffleRow(row: RaffleRow): Raffle {
    return {
      id: row.id,
      title: row.title,
      entryCommand: row.entry_command,
      mode: row.mode,
      status: row.status,
      entryDeadlineAt: row.entry_deadline_at,
      acceptedPlatforms: JSON.parse(row.accepted_platforms_json) as PlatformId[],
      staffTriggerCommand: row.staff_trigger_command,
      winnerAnnouncementTemplate: row.winner_announcement_template,
      winnerEntryId: row.winner_entry_id,
      top2EntryIds: JSON.parse(row.top2_entry_ids_json || '[]') as string[],
      entriesCount: row.entries_count ?? 0,
      activeEntriesCount: row.active_entries_count ?? 0,
      lastSpinAt: row.last_spin_at,
      currentRound: row.current_round,
      overlaySessionId: row.overlay_session_id,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapEntryRow(row: RaffleEntryRow): RaffleEntry {
    return {
      id: row.id,
      raffleId: row.raffle_id,
      platform: row.platform,
      userKey: row.user_key,
      displayName: row.display_name,
      sourceMessageId: row.source_message_id,
      enteredAt: row.entered_at,
      isEliminated: row.is_eliminated === 1,
      eliminationOrder: row.elimination_order,
      isWinner: row.is_winner === 1,
    };
  }

  private mapRoundRow(row: RaffleRoundRow): RaffleRoundResult {
    return {
      id: row.id,
      raffleId: row.raffle_id,
      roundNumber: row.round_number,
      actionType: row.action_type,
      selectedEntryId: row.selected_entry_id,
      selectedEntryName: row.selected_entry_name,
      resultType: row.result_type,
      participantCountBefore: row.participant_count_before,
      participantCountAfter: row.participant_count_after,
      animationSeedJson: row.animation_seed_json,
      createdAt: row.created_at,
    };
  }
}
