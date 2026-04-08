import { useEffect, useRef, useState } from 'react';

import type { ChatMessage, StreamEvent } from '../../shared/types.js';
import { EventBanner } from './EventBanner.js';
import { styles } from './app-styles.js';

type ChatFeedItem =
  | { id: string; type: 'message'; timestampLabel: string; message: ChatMessage }
  | { id: string; type: 'event'; timestampLabel: string; event: StreamEvent };

interface ChatFeedProps {
  messages: ChatMessage[];
  events: StreamEvent[];
}

const PLATFORM_ACCENTS: Record<ChatMessage['platform'], string> = {
  twitch: '#a855f7',
  youtube: '#ef4444',
  kick: '#22c55e',
  tiktok: '#ec4899',
};

const BADGE_LABELS: Record<NonNullable<ChatMessage['badges'][number]>, string> = {
  moderator: 'MOD',
  subscriber: 'SUB',
  member: 'MEMBER',
};

export function ChatFeed({ messages, events }: ChatFeedProps) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const items: ChatFeedItem[] = [
    ...messages.map((message) => ({
      id: message.id,
      type: 'message' as const,
      timestampLabel: message.timestampLabel,
      message,
    })),
    ...events.map((event) => ({
      id: event.id,
      type: 'event' as const,
      timestampLabel: event.timestampLabel,
      event,
    })),
  ].sort((left, right) => left.timestampLabel.localeCompare(right.timestampLabel));

  const visibleItems = items.slice(-40);

  useEffect(() => {
    if (isPaused || !feedRef.current) return;
    feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [isPaused, visibleItems]);

  return (
    <section style={styles.feedCard}>
      <div style={styles.feedHeader}>
        <div>
          <h3 style={styles.sectionTitle}>Chat Feed</h3>
          <p style={styles.helper}>Platform-colored messages with inline event banners and hover pause.</p>
        </div>
        <span style={styles.selectionPill}>{visibleItems.length} items</span>
      </div>

      <div
        ref={feedRef}
        style={styles.feedScroll}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {visibleItems.map((item) =>
          item.type === 'event' ? (
            <EventBanner key={item.id} event={item.event} />
          ) : (
            <ChatMessageCard key={item.id} message={item.message} />
          ),
        )}
      </div>
    </section>
  );
}

interface ChatMessageCardProps {
  message: ChatMessage;
}

function ChatMessageCard({ message }: ChatMessageCardProps) {
  return (
    <article
      style={{
        ...styles.chatItem,
        borderLeft: `3px solid ${PLATFORM_ACCENTS[message.platform]}`,
      }}
    >
      <div style={styles.chatMeta}>
        <span>{message.timestampLabel}</span>
        <strong>{message.author}</strong>
        <span>{message.platform}</span>
        {message.badges.map((badge) => (
          <span key={badge} style={styles.selectionPill}>
            {BADGE_LABELS[badge]}
          </span>
        ))}
      </div>
      <p style={styles.chatBody}>{message.content}</p>
    </article>
  );
}
