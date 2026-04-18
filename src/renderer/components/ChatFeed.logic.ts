import type { ChatMessage, StreamEvent } from '../../shared/types.js';

export type FeedMode = 'all' | 'superchat';

export type ChatFeedRow =
  | { kind: 'message'; id: string; order: number; message: ChatMessage }
  | { kind: 'event'; id: string; order: number; event: StreamEvent };

export interface StableChatFeedRowsState {
  byId: Map<string, ChatFeedRow>;
  result: ChatFeedRow[];
}

export const DEFAULT_MAX_CHAT_FEED_ROWS = 500;

export function deriveChatFeedRows(input: {
  messages: ChatMessage[];
  events: StreamEvent[];
  feedMode: FeedMode;
  platformEnabled: (platform: string) => boolean;
  maxRows?: number;
}): ChatFeedRow[] {
  const maxRows = input.maxRows ?? DEFAULT_MAX_CHAT_FEED_ROWS;
  const rows: ChatFeedRow[] = [];

  if (input.feedMode !== 'superchat') {
    for (const message of input.messages) {
      if (!input.platformEnabled(message.platform)) continue;
      rows.push({
        kind: 'message',
        id: `message:${message.id}`,
        order: getReceivedOrder(message),
        message,
      });
    }
  }

  for (const event of input.events) {
    if (!input.platformEnabled(event.platform)) continue;
    if (input.feedMode === 'superchat' && event.type !== 'superchat') continue;
    if (input.feedMode !== 'superchat' && event.type !== 'raid' && event.type !== 'superchat') continue;
    rows.push({
      kind: 'event',
      id: `event:${event.id}`,
      order: getReceivedOrder(event),
      event,
    });
  }

  return rows.sort((a, b) => a.order - b.order).slice(-maxRows);
}

export function computeStableChatFeedRows(
  rows: ChatFeedRow[],
  previous: StableChatFeedRowsState,
): StableChatFeedRowsState {
  const next = new Map<string, ChatFeedRow>();
  let changed = rows.length !== previous.result.length;

  const result = rows.map((row, index) => {
    const previousRow = previous.byId.get(row.id);
    const nextRow = previousRow && isSameRow(previousRow, row) ? previousRow : row;
    next.set(row.id, nextRow);
    if (!changed && previous.result[index] !== nextRow) changed = true;
    return nextRow;
  });

  return changed ? { byId: next, result } : previous;
}

export function getReceivedOrder(item: ChatMessage | StreamEvent): number {
  const withOrder = item as (ChatMessage | StreamEvent) & { receivedOrder?: number };
  if (typeof withOrder.receivedOrder === 'number') return withOrder.receivedOrder;

  const timestampPrefix = Number(item.id.match(/^\D*?(\d{10,})/)?.[1]);
  return Number.isFinite(timestampPrefix) ? timestampPrefix : 0;
}

function isSameRow(left: ChatFeedRow, right: ChatFeedRow): boolean {
  if (left.kind !== right.kind || left.id !== right.id || left.order !== right.order) return false;
  return left.kind === 'message'
    ? left.message === (right as typeof left).message
    : left.event === (right as typeof left).event;
}
