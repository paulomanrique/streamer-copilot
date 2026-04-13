import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { ChatMessage, StreamEvent } from '../../shared/types.js';
import { EventBanner } from './EventBanner.js';

type FeedMode = 'all' | 'superchat';
type OrderedFeedItem =
  | { kind: 'message'; id: string; order: number; message: ChatMessage }
  | { kind: 'event'; id: string; order: number; event: StreamEvent };

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  platform: string;
  author: string;
}

interface ChatFeedProps {
  messages: ChatMessage[];
  events: StreamEvent[];
  connectedPlatforms: string[];
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
  { id: 'twitch' },
  { id: 'youtube' },
  { id: 'youtube-v' },
  { id: 'kick' },
  { id: 'tiktok' },
] as const;

type ContextMenuAction = { separator: true } | { id: string; label: string; danger?: boolean };

const CONTEXT_MENU_ACTIONS: Record<string, ContextMenuAction[]> = {
  twitch: [
    { id: 'vip',    label: 'Add VIP' },
    { id: 'unvip',  label: 'Remove VIP' },
    { separator: true },
    { id: 'mod',    label: 'Add Moderator' },
    { id: 'unmod',  label: 'Remove Moderator' },
    { separator: true },
    { id: 'to1',    label: 'Timeout — 1 minute' },
    { id: 'to10',   label: 'Timeout — 10 minutes' },
    { id: 'to60',   label: 'Timeout — 1 hour' },
    { id: 'to1440', label: 'Timeout — 24 hours' },
    { separator: true },
    { id: 'ban',    label: 'Ban user', danger: true },
  ],
  youtube: [
    { id: 'hide',   label: 'Hide user on channel' },
    { id: 'block',  label: 'Block user', danger: true },
    { separator: true },
    { id: 'report', label: 'Report message', danger: true },
  ],
  'youtube-v': [
    { id: 'hide',   label: 'Hide user on channel' },
    { id: 'block',  label: 'Block user', danger: true },
    { separator: true },
    { id: 'report', label: 'Report message', danger: true },
  ],
  kick: [
    { id: 'mute',  label: 'Mute user' },
    { separator: true },
    { id: 'to5',   label: 'Timeout — 5 minutes' },
    { id: 'to30',  label: 'Timeout — 30 minutes' },
    { separator: true },
    { id: 'ban',   label: 'Ban user', danger: true },
  ],
  tiktok: [
    { id: 'mute',   label: 'Mute user' },
    { id: 'report', label: 'Report comment', danger: true },
  ],
};

// Twitch's default color palette assigned when a user has no color set
const TWITCH_DEFAULT_COLORS = [
  '#FF0000', '#0000FF', '#008000', '#B22222', '#FF7F50',
  '#9ACD32', '#FF4500', '#2E8B57', '#DAA520', '#D2691E',
  '#5F9EA0', '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F',
];

function resolveAuthorColor(message: ChatMessage): string {
  if (message.color) return message.color;
  // Deterministic color from username (matches Twitch's own fallback algorithm)
  let hash = 0;
  for (let i = 0; i < message.author.length; i++) {
    hash = message.author.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TWITCH_DEFAULT_COLORS[Math.abs(hash) % TWITCH_DEFAULT_COLORS.length];
}

const URL_REGEX = /https?:\/\/[^\s]+/gi;

function trimUrlTrailingPunctuation(raw: string): { url: string; trailing: string } {
  const match = raw.match(/[),.!?:;]+$/);
  if (!match) return { url: raw, trailing: '' };
  const trailing = match[0];
  return {
    url: raw.slice(0, raw.length - trailing.length),
    trailing,
  };
}

function renderContentWithLinks(content: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of content.matchAll(URL_REGEX)) {
    const full = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(<span key={`text-${key++}`}>{content.slice(lastIndex, index)}</span>);
    }

    const { url, trailing } = trimUrlTrailingPunctuation(full);
    nodes.push(
      <a
        key={`link-${key++}`}
        href={url}
        className="underline underline-offset-2 text-sky-300 hover:text-sky-200"
        onClick={(event) => {
          event.preventDefault();
          void window.copilot.openExternalUrl(url);
        }}
      >
        {url}
      </a>,
    );
    if (trailing) nodes.push(<span key={`trail-${key++}`}>{trailing}</span>);

    lastIndex = index + full.length;
  }

  if (lastIndex < content.length) {
    nodes.push(<span key={`text-${key++}`}>{content.slice(lastIndex)}</span>);
  }

  if (nodes.length === 0) nodes.push(<span key="text-0">{content}</span>);
  return nodes;
}

function platformKey(platform: string): keyof typeof PLATFORM_META {
  if (platform === 'youtube-v') return 'youtube-v';
  if (platform in PLATFORM_META) return platform as keyof typeof PLATFORM_META;
  return 'twitch';
}

function getPlatformDisplayName(platformId: string, connectedPlatforms: string[]): string {
  if (platformId === 'youtube') {
    return connectedPlatforms.includes('youtube-v') ? 'YouTube Horizontal' : 'YouTube';
  }
  if (platformId === 'youtube-v') return 'YouTube Vertical';
  if (platformId === 'twitch') return 'Twitch';
  if (platformId === 'kick') return 'Kick';
  if (platformId === 'tiktok') return 'TikTok';
  return platformId;
}

function getReceivedOrder(item: ChatMessage | StreamEvent): number {
  const withOrder = item as (ChatMessage | StreamEvent) & { receivedOrder?: number };
  if (typeof withOrder.receivedOrder === 'number') return withOrder.receivedOrder;

  const timestampPrefix = Number(item.id.match(/^\D*?(\d{10,})/)?.[1]);
  return Number.isFinite(timestampPrefix) ? timestampPrefix : 0;
}

export function ChatFeed({ messages, events, connectedPlatforms }: ChatFeedProps) {
  const feedRef  = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef  = useRef<HTMLDivElement | null>(null);

  const [feedMode,       setFeedMode]       = useState<FeedMode>('all');
  const [platformFilter, setPlatformFilter] = useState<Record<string, boolean>>({
    twitch: true, youtube: true, 'youtube-v': true, kick: true, tiktok: true,
  });
  const [inputValue,    setInputValue]    = useState('');
  const [inputPlatform, setInputPlatform] = useState(() => connectedPlatforms[0] ?? 'twitch');
  const [avatarCache,   setAvatarCache]   = useState<Map<string, string>>(new Map());
  const [highlighted,   setHighlighted]   = useState<string | null>(null);
  const [isAtBottom,    setIsAtBottom]    = useState(true);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({
    visible: false, x: 0, y: 0, platform: '', author: '',
  });
  const hasMultipleYouTubeStreams = connectedPlatforms.includes('youtube') && connectedPlatforms.includes('youtube-v');

  // ── scroll management ──────────────────────────────────────────────
  const onScroll = () => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    // Consider "at bottom" if within 60px of the actual bottom
    const atBottom = scrollHeight - scrollTop - clientHeight < 60;
    setIsAtBottom(atBottom);
  };

  const jumpToBottom = () => {
    if (!feedRef.current) return;
    feedRef.current.scrollTop = feedRef.current.scrollHeight;
    setIsAtBottom(true);
  };

  // ── filtering ──────────────────────────────────────────────────────
  const allowedEventTypes = feedMode === 'superchat' ? new Set(['superchat']) : new Set(['raid', 'superchat']);
  const visibleMessages = feedMode === 'superchat'
    ? []
    : messages.filter((m) => platformFilter[platformKey(m.platform)] !== false);
  const visibleEvents = events.filter(
    (e) => allowedEventTypes.has(e.type) && platformFilter[platformKey(e.platform)] !== false,
  );

  const items: OrderedFeedItem[] = [
    ...visibleMessages.map((message) => ({
      kind: 'message' as const,
      id: message.id,
      order: getReceivedOrder(message),
      message,
    })),
    ...visibleEvents.map((event) => ({
      kind: 'event' as const,
      id: event.id,
      order: getReceivedOrder(event),
      event,
    })),
  ].sort((a, b) => a.order - b.order);

  // ── auto-scroll ────────────────────────────────────────────────────
  useEffect(() => {
    if (!feedRef.current || !isAtBottom) return;
    feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [items, isAtBottom]);

  // ── batch-fetch avatars for YouTube / non-Twitch platforms ──────────
  useEffect(() => {
    const logins = messages
      .filter((m) => m.platform !== 'twitch' && !m.avatarUrl)
      .map((m) => m.author.toLowerCase())
      .filter((login, i, arr) => arr.indexOf(login) === i)
      .filter((login) => !avatarCache.has(login));

    if (logins.length === 0) return;

    void window.copilot.twitchGetUserAvatars(logins).then((result) => {
      setAvatarCache((prev) => {
        const next = new Map(prev);
        for (const [login, url] of Object.entries(result)) next.set(login.toLowerCase(), url);
        for (const login of logins) { if (!next.has(login)) next.set(login, ''); }
        return next;
      });
    });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── close context menu on outside click / Escape ───────────────────
  useEffect(() => {
    if (!ctxMenu.visible) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) hideMenu();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hideMenu(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [ctxMenu.visible]);

  // ── adjust menu position after render ──────────────────────────────
  useEffect(() => {
    if (!ctxMenu.visible || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    let { x, y } = ctxMenu;
    if (r.right  > window.innerWidth)  x = x - r.width;
    if (r.bottom > window.innerHeight) y = y - r.height;
    if (x !== ctxMenu.x || y !== ctxMenu.y) setCtxMenu((c) => ({ ...c, x, y }));
  }, [ctxMenu]);

  const hideMenu = () => setCtxMenu((c) => ({ ...c, visible: false }));

  const replyTo = (platform: string, author: string) => {
    setInputPlatform(platform);
    setInputValue(`@${author} `);
    hideMenu();
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      }
    });
  };

  const handleContextMenu = (e: React.MouseEvent, platform: string, author: string) => {
    e.preventDefault();
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, platform, author });
  };

  const sendMessage = () => {
    const content = inputValue.trim();
    if (!content) return;
    setInputValue('');
    void window.copilot.sendChatMessage({
      platform: inputPlatform as import('../../shared/types.js').PlatformId,
      content,
    }).catch(() => null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') sendMessage();
  };

  return (
    <div className="flex flex-col w-[60%] border-r border-gray-800">
      {/* ── header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-200">Unified Chat</h2>
          <div className="inline-flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5 text-xs">
            <button type="button" onClick={() => setFeedMode('all')}
              className={feedMode === 'all' ? 'px-2 py-1 rounded bg-violet-600 text-white' : 'px-2 py-1 rounded text-gray-400 hover:text-white'}>
              All Chats
            </button>
            <button type="button" onClick={() => setFeedMode('superchat')}
              className={feedMode === 'superchat' ? 'px-2 py-1 rounded bg-violet-600 text-white' : 'px-2 py-1 rounded text-gray-400 hover:text-white'}>
              Super Chats Only
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {PLATFORM_BUTTONS.filter((b) => connectedPlatforms.includes(b.id as any)).map(({ id }) => {
            const meta = PLATFORM_META[platformKey(id)];
            const on = platformFilter[id] !== false;
            const title = getPlatformDisplayName(id, connectedPlatforms);
            return (
              <button key={id} type="button" title={title} aria-label={title}
                onClick={() => setPlatformFilter((c) => ({ ...c, [id]: !c[id] }))}
                className={`flex items-center justify-center w-8 h-8 rounded transition-all ${on ? `${meta.bg} ${meta.text} hover:opacity-90` : 'grayscale opacity-40 bg-gray-700/30 text-gray-500'}`}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d={meta.icon} /></svg>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── messages ───────────────────────────────────────────────── */}
      <div ref={feedRef} onScroll={onScroll} className="flex-1 overflow-y-auto py-1 space-y-0.5 relative">
        {items.map((item) =>
          item.kind === 'event' ? (
            <EventBanner key={item.id} event={item.event} />
          ) : (
            <ChatMessageRow
              key={item.id}
              message={item.message}
              avatarUrl={avatarCache.get(item.message.author.toLowerCase()) || undefined}
              highlighted={highlighted === item.message.author}
              hasMultipleYouTubeStreams={hasMultipleYouTubeStreams}
              onDoubleClick={() => replyTo(item.message.platform, item.message.author)}
              onContextMenu={(e) => handleContextMenu(e, item.message.platform, item.message.author)}
            />
          ),
        )}

        {/* Floating Scroll Button */}
        {!isAtBottom && (
          <button
            type="button"
            onClick={jumpToBottom}
            className="sticky bottom-4 left-1/2 -translate-x-1/2 z-10 bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-full shadow-2xl border border-violet-400/30 flex items-center gap-2 transition-all animate-bounce"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            New Messages Below
          </button>
        )}
      </div>

      {/* ── input ──────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-t border-gray-800 shrink-0">
        <div className="flex gap-2">
          {connectedPlatforms.length > 1 ? (
            <select
              value={inputPlatform}
              onChange={(e) => setInputPlatform(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 px-2 py-1.5 focus:outline-none focus:border-violet-500"
            >
              {PLATFORM_BUTTONS.filter((b) => connectedPlatforms.includes(b.id)).map(({ id }) => (
                <option key={id} value={id}>{getPlatformDisplayName(id, connectedPlatforms)}</option>
              ))}
            </select>
          ) : connectedPlatforms.length === 1 ? (
            <span className="text-xs text-gray-500 px-2 py-1.5">
              {getPlatformDisplayName(connectedPlatforms[0], connectedPlatforms)}
            </span>
          ) : null}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send message... (Press Enter)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 px-3 py-1.5 focus:outline-none focus:border-violet-500 placeholder-gray-600"
          />
          <button type="button" onClick={sendMessage}
            className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors">
            Send
          </button>
        </div>
      </div>

      {/* ── context menu ───────────────────────────────────────────── */}
      {ctxMenu.visible ? (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[180px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl py-1 text-sm overflow-hidden"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {/* Header */}
          <div className="px-3 py-1.5 border-b border-gray-700 mb-1">
            <span className="text-xs text-gray-500">@{ctxMenu.author}</span>
          </div>

          {/* Highlight */}
          <button type="button"
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-yellow-500/20 text-yellow-300 flex items-center gap-2"
            onClick={() => { setHighlighted((h) => h === ctxMenu.author ? null : ctxMenu.author); hideMenu(); }}>
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.95a1 1 0 00.95.69h4.153c.969 0 1.371 1.24.588 1.81l-3.36 2.44a1 1 0 00-.364 1.118l1.285 3.95c.3.922-.755 1.688-1.54 1.118l-3.359-2.44a1 1 0 00-1.176 0l-3.36 2.44c-.783.57-1.838-.196-1.539-1.118l1.285-3.95a1 1 0 00-.364-1.118l-3.36-2.44c-.782-.57-.38-1.81.588-1.81h4.154a1 1 0 00.95-.69l1.286-3.95z"/>
            </svg>
            Highlight
          </button>

          <div className="border-t border-gray-700 my-1" />

          {/* Reply */}
          <button type="button"
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-violet-600/30 text-gray-200 flex items-center gap-2"
            onClick={() => replyTo(ctxMenu.platform, ctxMenu.author)}>
            <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
            </svg>
            Reply
          </button>

          <div className="border-t border-gray-700 my-1" />

          {/* Platform actions */}
          {(CONTEXT_MENU_ACTIONS[ctxMenu.platform] ?? []).map((action, i) => {
            if ('separator' in action) return <div key={i} className="border-t border-gray-700/60 my-1" />;
            return (
              <button key={action.id} type="button"
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 ${action.danger ? 'text-red-400 hover:bg-red-600/20' : 'text-gray-300'}`}
                onClick={hideMenu}>
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

interface ChatMessageRowProps {
  message: ChatMessage;
  avatarUrl?: string;
  highlighted: boolean;
  hasMultipleYouTubeStreams: boolean;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function ChatMessageRow({ message, avatarUrl, highlighted, hasMultipleYouTubeStreams, onDoubleClick, onContextMenu }: ChatMessageRowProps) {
  const pKey = platformKey(message.platform);
  const meta = PLATFORM_META[pKey];

  // Platform badge metadata (matching Activity Log style)
  const ytLabel = hasMultipleYouTubeStreams
    ? (message.platform === 'youtube-v' ? 'YouTube Vertical' : 'YouTube Horizontal')
    : 'YouTube';
  const PLATFORM_BADGE_META: Record<string, { bg: string; text: string; label: string }> = {
    twitch: { bg: 'bg-purple-500/20', text: 'text-purple-300', label: 'Twitch' },
    youtube: { bg: 'bg-red-500/20', text: 'text-red-300', label: ytLabel },
    'youtube-v': { bg: 'bg-rose-400/20', text: 'text-rose-300', label: ytLabel },
    kick: { bg: 'bg-green-500/20', text: 'text-green-300', label: 'Kick' },
    tiktok: { bg: 'bg-pink-500/20', text: 'text-pink-300', label: 'TikTok' },
  };

  const badgeMeta = PLATFORM_BADGE_META[pKey] || PLATFORM_BADGE_META.twitch;
  const isCommand = message.content.startsWith('!');

  // STAR LOGIC: 
  // YouTube: ONLY if badge is 'member'
  // Others: if 'subscriber', 'member' or 'subscriber/'
  const isSub = message.platform === 'youtube' || message.platform === 'youtube-v'
    ? message.badges.includes('member')
    : message.badges.some((b) => b.startsWith('subscriber/') || b === 'subscriber' || b === 'member');

  const isMod = message.badges.some((b) => b.startsWith('moderator/') || b === 'moderator');
  const authorColor = resolveAuthorColor(message);

  const effectiveAvatarUrl = message.avatarUrl || avatarUrl;

  return (
    <div
      className={`chat-message flex gap-2 px-3 py-1.5 border-l-2 cursor-default select-text transition-all duration-75
        ${meta.border}
        ${highlighted ? 'ring-1 ring-yellow-400/70 bg-yellow-500/10' : 'hover:bg-white/[0.02]'}
        ${isCommand ? 'bg-violet-500/5' : ''}`}
      data-platform={platformKey(message.platform)}
      data-author={message.author}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <span className="text-gray-600 text-xs mt-0.5 shrink-0 font-mono w-[54px] text-right">{message.timestampLabel}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">

          {/* Platform Badge (Activity Log Style) */}
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold shrink-0 ${badgeMeta.bg} ${badgeMeta.text}`}>
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
              <path d={meta.icon} />
            </svg>
            {badgeMeta.label}
          </span>

          {/* Avatar (Shown for everyone except Twitch by default, or if available) */}
          {message.platform !== 'twitch' && (
            effectiveAvatarUrl ? (
              <img
                src={effectiveAvatarUrl}
                alt={message.author}
                className="w-5 h-5 rounded-full shrink-0 object-cover"
                style={{ outline: `1.5px solid ${authorColor}60` }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0"
                style={{ backgroundColor: `${authorColor}28` }}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" style={{ color: authorColor }}>
                  <path d={meta.icon} />
                </svg>
              </span>
            )
          )}

          {/* Twitch chat badges (broadcaster, moderator, subscriber, etc.) */}
          {message.platform === 'twitch' && message.badgeUrls?.map((url, i) => (
            <img key={i} src={url} alt="" className="w-4 h-4 rounded-sm shrink-0 object-contain" />
          ))}

          {/* Member Star */}
          {isSub ? <span className="text-yellow-400 text-xs leading-none">★</span> : null}

          <span className="font-semibold text-sm" style={{ color: authorColor }}>
            {message.platform === 'youtube' || message.platform === 'youtube-v' ? `@${message.author}` : message.author}
          </span>

          {message.platform !== 'twitch' && isMod ? <span className="text-xs text-emerald-400 font-semibold">MOD</span> : null}
        </div>
        <p className={`text-sm mt-0.5 break-words leading-snug ${isCommand ? 'text-violet-300 font-mono' : 'text-gray-300'}`}>
          {renderContentWithLinks(message.content)}
        </p>
      </div>
    </div>
  );
}
