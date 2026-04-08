import { useEffect, useRef, useState } from 'react';

import type { ChatMessage, StreamEvent } from '../../shared/types.js';
import { EventBanner } from './EventBanner.js';
import { styles } from './app-styles.js';

type ChatFeedItem =
  | { id: string; type: 'message'; timestampLabel: string; message: ChatMessage }
  | { id: string; type: 'event'; timestampLabel: string; event: StreamEvent };

type FeedMode = 'all' | 'superchat';

interface ChatFeedProps {
  messages: ChatMessage[];
  events: StreamEvent[];
}

const PLATFORM_FILTERS: Array<{ id: string; label: string; accent: string; icon: string }> = [
  {
    id: 'twitch',
    label: 'Twitch',
    accent: '#a855f7',
    icon: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
  },
  {
    id: 'youtube',
    label: 'YouTube H',
    accent: '#ef4444',
    icon: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
  },
  {
    id: 'youtube-v',
    label: 'YouTube V',
    accent: '#fb7185',
    icon: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
  },
  {
    id: 'kick',
    label: 'Kick',
    accent: '#22c55e',
    icon: 'M2 2h4v8l4-4h4l-6 6 6 6h-4l-4-4v4H2V2zm14 0h4v20h-4z',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    accent: '#ec4899',
    icon: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.67a8.17 8.17 0 0 0 4.79 1.53V6.75a4.85 4.85 0 0 1-1.02-.06z',
  },
];

const PLATFORM_ACCENTS: Record<string, string> = Object.fromEntries(
  PLATFORM_FILTERS.map((p) => [p.id, p.accent]),
);

const BADGE_LABELS: Record<NonNullable<ChatMessage['badges'][number]>, string> = {
  moderator: 'MOD',
  subscriber: 'SUB',
  member: 'MEMBER',
};

export function ChatFeed({ messages, events }: ChatFeedProps) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [feedMode, setFeedMode] = useState<FeedMode>('all');
  const [hiddenPlatforms, setHiddenPlatforms] = useState<Set<string>>(new Set());

  const togglePlatform = (platformId: string) => {
    setHiddenPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platformId)) next.delete(platformId);
      else next.add(platformId);
      return next;
    });
  };

  const allItems: ChatFeedItem[] = [
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

  const visibleItems = allItems
    .filter((item) => {
      if (item.type === 'message') {
        if (hiddenPlatforms.has(item.message.platform)) return false;
        if (feedMode === 'superchat') return false;
      }
      if (item.type === 'event') {
        if (feedMode === 'superchat' && item.event.type !== 'superchat') return false;
        if (hiddenPlatforms.has(item.event.platform)) return false;
      }
      return true;
    })
    .slice(-40);

  useEffect(() => {
    if (isPaused || !feedRef.current) return;
    feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [isPaused, visibleItems]);

  return (
    <section style={styles.feedCard}>
      <div style={styles.feedHeader}>
        <div style={styles.feedTitleRow}>
          <h3 style={styles.sectionTitle}>Unified Chat</h3>
          <div style={styles.chatModeToggle}>
            <button
              type="button"
              style={feedMode === 'all' ? styles.chatModeButtonActive : styles.chatModeButton}
              onClick={() => setFeedMode('all')}
            >
              All Chats
            </button>
            <button
              type="button"
              style={feedMode === 'superchat' ? styles.chatModeButtonActive : styles.chatModeButton}
              onClick={() => setFeedMode('superchat')}
            >
              Super Chats Only
            </button>
          </div>
        </div>

        <div style={styles.platformFilterRow}>
          {PLATFORM_FILTERS.map(({ id, label, accent, icon }) => {
            const isHidden = hiddenPlatforms.has(id);
            return (
              <button
                key={id}
                type="button"
                title={`${isHidden ? 'Show' : 'Hide'} ${label}`}
                onClick={() => togglePlatform(id)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isHidden ? 'rgba(55,65,81,0.4)' : `${accent}33`,
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  opacity: isHidden ? 0.4 : 1,
                  transition: 'opacity 0.15s, background 0.15s',
                  padding: 0,
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  style={{ width: '14px', height: '14px', fill: isHidden ? '#6b7280' : accent }}
                >
                  <path d={icon} />
                </svg>
              </button>
            );
          })}
        </div>
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
  const accent = PLATFORM_ACCENTS[message.platform] ?? '#6b7280';
  return (
    <article
      style={{
        ...styles.chatItem,
        borderLeft: `2px solid ${accent}`,
      }}
    >
      <div style={styles.chatMeta}>
        <strong>{message.author}</strong>
        <span style={{ color: accent, textTransform: 'capitalize', fontSize: '11px' }}>{message.platform}</span>
        <span>{message.timestampLabel}</span>
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
