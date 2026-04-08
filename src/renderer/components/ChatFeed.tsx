import { useEffect, useRef, useState } from 'react';

import type { ChatMessage, StreamEvent } from '../../shared/types.js';
import { EventBanner } from './EventBanner.js';

type FeedMode = 'all' | 'superchat';

interface ChatFeedProps {
  messages: ChatMessage[];
  events: StreamEvent[];
}

const PLATFORM_META = {
  twitch: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-300',
    border: 'border-purple-500/20',
    icon: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
  },
  youtube: {
    bg: 'bg-red-500/20',
    text: 'text-red-300',
    border: 'border-red-500/20',
    icon: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
  },
  'youtube-v': {
    bg: 'bg-rose-400/20',
    text: 'text-rose-300',
    border: 'border-rose-400/20',
    icon: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
  },
  kick: {
    bg: 'bg-green-500/20',
    text: 'text-green-300',
    border: 'border-green-500/20',
    icon: 'M2 2h4v8l4-4h4l-6 6 6 6h-4l-4-4v4H2V2zm14 0h4v20h-4z',
  },
  tiktok: {
    bg: 'bg-pink-500/20',
    text: 'text-pink-300',
    border: 'border-pink-500/20',
    icon: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.67a8.17 8.17 0 0 0 4.79 1.53V6.75a4.85 4.85 0 0 1-1.02-.06z',
  },
} as const;

const PLATFORM_BUTTONS = [
  { id: 'twitch', title: 'Twitch' },
  { id: 'youtube', title: 'YouTube Horizontal' },
  { id: 'youtube-v', title: 'YouTube Vertical' },
  { id: 'kick', title: 'Kick' },
  { id: 'tiktok', title: 'TikTok' },
] as const;

function platformKey(platform: string): keyof typeof PLATFORM_META {
  if (platform === 'youtube-v') return 'youtube-v';
  if (platform in PLATFORM_META) return platform as keyof typeof PLATFORM_META;
  return 'twitch';
}

export function ChatFeed({ messages, events }: ChatFeedProps) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [feedMode, setFeedMode] = useState<FeedMode>('all');
  const [platformFilter, setPlatformFilter] = useState<Record<string, boolean>>({
    twitch: true,
    youtube: true,
    'youtube-v': true,
    kick: true,
    tiktok: true,
  });

  const allowedEventTypes = feedMode === 'superchat' ? new Set(['superchat']) : new Set(['raid', 'superchat']);
  const visibleMessages = feedMode === 'superchat'
    ? []
    : messages.filter((message) => platformFilter[platformKey(message.platform)] !== false);
  const visibleEvents = events.filter(
    (event) => allowedEventTypes.has(event.type) && platformFilter[platformKey(event.platform)] !== false,
  );

  const items = [
    ...visibleMessages.map((message) => ({ kind: 'message' as const, id: message.id, time: message.timestampLabel, message })),
    ...visibleEvents.map((event) => ({ kind: 'event' as const, id: event.id, time: event.timestampLabel, event })),
  ].sort((left, right) => left.time.localeCompare(right.time));

  useEffect(() => {
    if (!feedRef.current) return;
    feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [items]);

  return (
    <div className="flex flex-col w-[60%] border-r border-gray-800">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-200">Unified Chat</h2>
          <div className="inline-flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFeedMode('all')}
              className={feedMode === 'all' ? 'px-2 py-1 rounded bg-violet-600 text-white transition-colors' : 'px-2 py-1 rounded text-gray-400 hover:text-white transition-colors'}
            >
              All Chats
            </button>
            <button
              type="button"
              onClick={() => setFeedMode('superchat')}
              className={feedMode === 'superchat' ? 'px-2 py-1 rounded bg-violet-600 text-white transition-colors' : 'px-2 py-1 rounded text-gray-400 hover:text-white transition-colors'}
            >
              Super Chats Only
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {PLATFORM_BUTTONS.map(({ id, title }) => {
            const meta = PLATFORM_META[platformKey(id)];
            const enabled = platformFilter[id] !== false;
            return (
              <button
                key={id}
                type="button"
                title={title}
                aria-label={title}
                onClick={() =>
                  setPlatformFilter((current) => ({
                    ...current,
                    [id]: !current[id],
                  }))
                }
                className={`flex items-center justify-center w-8 h-8 rounded transition-all ${enabled ? `${meta.bg} ${meta.text} hover:opacity-90` : 'grayscale opacity-40 bg-gray-700/30 text-gray-500'}`}
              >
                <svg className="w-3.5 h-3.5" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                  <path d={meta.icon} />
                </svg>
              </button>
            );
          })}
        </div>
      </div>

      <div ref={feedRef} id="chat-feed" className="flex-1 overflow-y-auto py-1 space-y-0.5">
        {items.map((item) =>
          item.kind === 'event' ? (
            <EventBanner key={item.id} event={item.event} />
          ) : (
            <ChatMessageRow key={item.id} message={item.message} />
          ),
        )}
      </div>

      <div className="px-3 py-2 border-t border-gray-800 shrink-0">
        <div className="flex gap-2">
          <select className="bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 px-2 py-1.5 focus:outline-none focus:border-violet-500">
            <option value="twitch">Twitch</option>
            <option value="youtube">YouTube (Horizontal)</option>
            <option value="youtube-v">YouTube (Vertical)</option>
            <option value="kick">Kick</option>
            <option value="tiktok">TikTok</option>
          </select>
          <input
            type="text"
            placeholder="Send message... (Press Enter)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500 placeholder-gray-600"
          />
          <button type="button" className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatMessageRow({ message }: { message: ChatMessage }) {
  const meta = PLATFORM_META[platformKey(message.platform)];
  const isCommand = message.content.startsWith('!');
  const isSub = message.badges.includes('subscriber') || message.badges.includes('member');
  const isMod = message.badges.includes('moderator');
  return (
    <div
      className={`chat-message flex gap-2 px-3 py-1.5 border-l-2 hover:bg-white/[0.02] ${meta.border} transition-all duration-75 cursor-default select-text`}
      data-platform={platformKey(message.platform)}
      data-author={message.author}
    >
      <span className="text-gray-600 text-xs mt-0.5 shrink-0 font-mono w-[54px] text-right">{message.timestampLabel}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          {/* Platform icon badge */}
          <span className={`inline-flex items-center justify-center w-5 h-5 rounded ${meta.bg}`}>
            <svg className={`w-3 h-3 ${meta.text}`} viewBox="0 0 24 24" fill="currentColor">
              <path d={meta.icon} />
            </svg>
          </span>
          {/* Subscriber star badge */}
          {isSub ? <span className="text-yellow-400 text-xs leading-none">★</span> : null}
          {/* Author name */}
          <span className={`font-semibold text-sm ${meta.text}`}>{message.author}</span>
          {/* MOD badge */}
          {isMod ? <span className="text-xs text-emerald-400 font-semibold">MOD</span> : null}
        </div>
        <p className={`text-sm mt-0.5 break-words leading-snug ${isCommand ? 'text-violet-300 font-mono' : 'text-gray-300'}`}>{message.content}</p>
      </div>
    </div>
  );
}
