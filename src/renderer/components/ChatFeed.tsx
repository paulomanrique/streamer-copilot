import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LegendList, type LegendListRef } from '@legendapp/list/react';

import type { ChatMessage, PlatformId, StreamEvent } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { EventBanner } from './EventBanner.js';
import {
  computeStableChatFeedRows,
  DEFAULT_MAX_CHAT_FEED_ROWS,
  deriveChatFeedRows,
  type ChatFeedRow,
  type FeedMode,
  type StableChatFeedRowsState,
} from './ChatFeed.logic.js';

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
  recommendationTemplate: string;
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
const DEFAULT_RECOMMENDATION_TEMPLATE = 'Pessoal, visitem o {username}';

const PLATFORM_BADGE_META: Record<string, { bg: string; text: string; label: string }> = {
  twitch:      { bg: 'bg-purple-500/20', text: 'text-purple-300', label: 'Twitch' },
  youtube:     { bg: 'bg-red-500/20',    text: 'text-red-300',    label: 'YouTube' },
  'youtube-v': { bg: 'bg-rose-400/20',   text: 'text-rose-300',   label: 'YouTube Vertical' },
  kick:        { bg: 'bg-green-500/20',  text: 'text-green-300',  label: 'Kick' },
  tiktok:      { bg: 'bg-pink-500/20',   text: 'text-pink-300',   label: 'TikTok' },
};

function getYtBadgeLabel(platform: string, hasMultipleYouTubeStreams: boolean): string {
  if (!hasMultipleYouTubeStreams) return 'YouTube';
  return platform === 'youtube-v' ? 'YouTube Vertical' : 'YouTube Horizontal';
}

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
    nodes.push(<span key={`text-${key}`}>{content.slice(lastIndex)}</span>);
  }

  if (nodes.length === 0) nodes.push(<span key="text-0">{content}</span>);
  return nodes;
}

function renderMessageContent(message: ChatMessage): ReactNode[] {
  if (!message.contentParts?.length) {
    return renderContentWithLinks(message.content);
  }

  const nodes: ReactNode[] = [];
  let key = 0;

  for (const part of message.contentParts) {
    if (part.type === 'text') {
      nodes.push(...renderContentWithLinks(part.text).map((node) => <span key={`part-${key++}`}>{node}</span>));
      continue;
    }

    nodes.push(
      part.imageUrl ? (
        <img
          key={`part-${key++}`}
          src={part.imageUrl}
          alt={part.name}
          title={part.name}
          className="mx-[1px] inline-block h-5 max-w-none align-text-bottom"
          loading="lazy"
        />
      ) : (
        <span key={`part-${key++}`}>{`:${part.name}:`}</span>
      ),
    );
  }

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

function resolveProfileUrl(platform: string, author: string): string {
  const username = author.replace(/^@+/, '').trim();
  if (!username) return '';

  switch (platform) {
    case 'twitch':
      return `https://twitch.tv/${encodeURIComponent(username)}`;
    case 'kick':
      return `https://kick.com/${encodeURIComponent(username.toLowerCase())}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${encodeURIComponent(username)}`;
    case 'youtube':
    case 'youtube-v':
      return `https://www.youtube.com/@${encodeURIComponent(username)}`;
    default:
      return '';
  }
}

export function ChatFeed({ messages, events, connectedPlatforms, recommendationTemplate }: ChatFeedProps) {
  const { t } = useI18n();
  const listRef  = useRef<LegendListRef | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef  = useRef<HTMLDivElement | null>(null);

  const [feedMode,       setFeedMode]       = useState<FeedMode>('all');
  const [platformFilter, setPlatformFilter] = useState<Record<string, boolean>>({
    twitch: true, youtube: true, 'youtube-v': true, kick: true, tiktok: true,
  });
  const [inputValue,    setInputValue]    = useState('');
  const [inputPlatform, setInputPlatform] = useState(() => connectedPlatforms[0] ?? 'twitch');
  const [sendError, setSendError] = useState<string | null>(null);
  const [avatarCache,   setAvatarCache]   = useState<Map<string, string>>(new Map());
  const requestedAvatarsRef = useRef<Set<string>>(new Set());
  const [highlighted,   setHighlighted]   = useState<string | null>(null);
  const [isAtBottom,    setIsAtBottom]    = useState(true);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({
    visible: false, x: 0, y: 0, platform: '', author: '',
  });
  const hasMultipleYouTubeStreams = connectedPlatforms.includes('youtube') && connectedPlatforms.includes('youtube-v');

  useEffect(() => {
    if (connectedPlatforms.length === 0) return;
    if (!connectedPlatforms.includes(inputPlatform)) {
      setInputPlatform(connectedPlatforms[0]);
    }
  }, [connectedPlatforms, inputPlatform]);

  useEffect(() => {
    if (!sendError) return;
    const timeout = window.setTimeout(() => setSendError(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [sendError]);

  // ── scroll management ──────────────────────────────────────────────
  const onScroll = useCallback(() => {
    const state = listRef.current?.getState();
    if (!state) return;
    setIsAtBottom((current) => current === state.isAtEnd ? current : state.isAtEnd);
  }, []);

  const jumpToBottom = () => {
    void listRef.current?.scrollToEnd({ animated: true });
    setIsAtBottom(true);
  };

  // ── filtering ──────────────────────────────────────────────────────
  const platformEnabled = useCallback(
    (platform: string) => platformFilter[platformKey(platform)] !== false,
    [platformFilter],
  );

  const rawItems = useMemo(
    () => deriveChatFeedRows({
      messages,
      events,
      feedMode,
      platformEnabled,
      maxRows: DEFAULT_MAX_CHAT_FEED_ROWS,
    }),
    [events, feedMode, messages, platformEnabled],
  );
  const items = useStableRows(rawItems);

  // ── auto-scroll ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAtBottom) return;
    void listRef.current?.scrollToEnd({ animated: false });
  }, [items.length, isAtBottom]);

  // ── batch-fetch avatars for non-Twitch platforms ──────────────────
  useEffect(() => {
    const seen = new Set<string>();
    const toFetch: string[] = [];
    for (const item of items) {
      if (item.kind !== 'message') continue;
      const { message } = item;
      if (message.platform === 'twitch' || message.avatarUrl) continue;
      const login = message.author.toLowerCase();
      if (!seen.has(login) && !requestedAvatarsRef.current.has(login)) {
        seen.add(login);
        toFetch.push(login);
      }
    }
    if (toFetch.length === 0) return;
    toFetch.forEach((l) => requestedAvatarsRef.current.add(l));
    void window.copilot.twitchGetUserAvatars(toFetch).then((result) => {
      setAvatarCache((prev) => {
        const next = new Map(prev);
        for (const [login, url] of Object.entries(result)) next.set(login.toLowerCase(), url);
        return next;
      });
    });
  // avatarCache intentionally omitted — requestedAvatarsRef is the guard against double-fetching
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // ── close context menu on outside click / Escape ───────────────────
  const hideMenu = useCallback(() => setCtxMenu((c) => ({ ...c, visible: false })), []);

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
  }, [ctxMenu.visible, hideMenu]);

  // ── adjust menu position after render ──────────────────────────────
  useEffect(() => {
    if (!ctxMenu.visible || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    let { x, y } = ctxMenu;
    if (r.right  > window.innerWidth)  x = x - r.width;
    if (r.bottom > window.innerHeight) y = y - r.height;
    if (x !== ctxMenu.x || y !== ctxMenu.y) setCtxMenu((c) => ({ ...c, x, y }));
  }, [ctxMenu]);

  const replyTo = useCallback((platform: string, author: string) => {
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
  }, [hideMenu]);

  const recommendUser = async (platform: string, author: string) => {
    let template = recommendationTemplate?.trim() || DEFAULT_RECOMMENDATION_TEMPLATE;
    try {
      const settings = await window.copilot.getGeneralSettings();
      template = settings.recommendationTemplate?.trim() || DEFAULT_RECOMMENDATION_TEMPLATE;
    } catch {
      // Keep the renderer prop/default fallback when settings cannot be read.
    }

    const username = platform === 'youtube' || platform === 'youtube-v'
      ? `@${author.replace(/^@+/, '')}`
      : author;
    const profileUrl = resolveProfileUrl(platform, author);
    const content = template
      .replaceAll('{username}', username)
      .replaceAll('{url}', profileUrl);

    setSendError(null);
    hideMenu();
    try {
      await window.copilot.sendChatMessage({ platform: platform as PlatformId, content });
    } catch (cause) {
      setSendError(cause instanceof Error ? cause.message : 'Failed to send recommendation');
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, platform: string, author: string) => {
    e.preventDefault();
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, platform, author });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ChatFeedRow }) =>
      item.kind === 'event' ? (
        <EventBanner event={item.event} />
      ) : (
        <ChatMessageRow
          message={item.message}
          avatarUrl={avatarCache.get(item.message.author.toLowerCase()) || undefined}
          highlighted={highlighted === item.message.author}
          hasMultipleYouTubeStreams={hasMultipleYouTubeStreams}
          onReplyTo={replyTo}
          onContextMenuRequest={handleContextMenu}
        />
      ),
    [avatarCache, handleContextMenu, hasMultipleYouTubeStreams, highlighted, replyTo],
  );

  const sendMessage = async () => {
    const content = inputValue.trim();
    if (!content) return;
    setSendError(null);
    setInputValue('');
    try {
      await window.copilot.sendChatMessage({
        platform: inputPlatform as import('../../shared/types.js').PlatformId,
        content,
      });
    } catch (cause) {
      setInputValue(content);
      setSendError(cause instanceof Error ? cause.message : 'Failed to send message');
    }
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
          {PLATFORM_BUTTONS.filter((b) => (connectedPlatforms as readonly string[]).includes(b.id)).map(({ id }) => {
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
      <div className="flex-1 min-h-0 relative">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            No messages yet.
          </div>
        ) : (
          <LegendList<ChatFeedRow>
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            estimatedItemSize={64}
            initialScrollAtEnd
            maintainScrollAtEnd
            maintainScrollAtEndThreshold={0.08}
            maintainVisibleContentPosition
            onScroll={onScroll}
            className="h-full overflow-y-auto overflow-x-hidden py-1"
          />
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
        {sendError ? (
          <div className="mb-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {sendError}
          </div>
        ) : null}
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

          {/* Recommend */}
          <button type="button"
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-green-600/20 text-green-300 flex items-center gap-2"
            onClick={() => void recommendUser(ctxMenu.platform, ctxMenu.author)}>
            <svg className="w-3.5 h-3.5 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            {t('Recommend')}
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

          {/* Copy username */}
          <button type="button"
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 text-gray-300 flex items-center gap-2"
            onClick={() => { void navigator.clipboard.writeText(ctxMenu.author); hideMenu(); }}>
            <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
            </svg>
            {t('Copy username')}
          </button>
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
  onReplyTo: (platform: string, author: string) => void;
  onContextMenuRequest: (event: React.MouseEvent, platform: string, author: string) => void;
}

const ChatMessageRow = memo(function ChatMessageRow({ message, avatarUrl, highlighted, hasMultipleYouTubeStreams, onReplyTo, onContextMenuRequest }: ChatMessageRowProps) {
  const pKey = platformKey(message.platform);
  const meta = PLATFORM_META[pKey];
  const badgeMeta = PLATFORM_BADGE_META[pKey] ?? PLATFORM_BADGE_META.twitch;
  const badgeLabel = (pKey === 'youtube' || pKey === 'youtube-v')
    ? getYtBadgeLabel(message.platform, hasMultipleYouTubeStreams)
    : badgeMeta.label;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const messageContent = useMemo(() => renderMessageContent(message), [message]);

  return (
    <div
      className={`chat-message flex gap-2 px-3 py-1.5 border-l-2 cursor-default select-text transition-all duration-75
        ${meta.border}
        ${highlighted ? 'ring-1 ring-yellow-400/70 bg-yellow-500/10' : 'hover:bg-white/[0.02]'}
        ${isCommand ? 'bg-violet-500/5' : ''}`}
      data-platform={platformKey(message.platform)}
      data-author={message.author}
      onDoubleClick={() => onReplyTo(message.platform, message.author)}
      onContextMenu={(event) => onContextMenuRequest(event, message.platform, message.author)}
    >
      <span className="text-gray-600 text-xs mt-0.5 shrink-0 font-mono w-[54px] text-right">{message.timestampLabel}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">

          {/* Platform Badge (Activity Log Style) */}
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold shrink-0 ${badgeMeta.bg} ${badgeMeta.text}`}>
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
              <path d={meta.icon} />
            </svg>
            {badgeLabel}
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

          <span className="font-semibold text-sm" style={{ color: authorColor }} data-no-i18n="true">
            {message.platform === 'youtube' || message.platform === 'youtube-v' ? `@${message.author}` : message.author}
          </span>

          {message.platform !== 'twitch' && isMod ? <span className="text-xs text-emerald-400 font-semibold">MOD</span> : null}
        </div>
        <p className={`text-sm mt-0.5 break-words leading-snug ${isCommand ? 'text-violet-300 font-mono' : 'text-gray-300'}`} data-no-i18n="true">
          {messageContent}
        </p>
      </div>
    </div>
  );
});

function useStableRows(rows: ChatFeedRow[]): ChatFeedRow[] {
  const previous = useRef<StableChatFeedRowsState>({ byId: new Map(), result: [] });

  return useMemo(() => {
    const next = computeStableChatFeedRows(rows, previous.current);
    previous.current = next;
    return next.result;
  }, [rows]);
}
