import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatLogMessage, ChatSession } from '../../shared/ipc.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { getPlatformProviderOrFallback } from '../platforms/registry.js';

/** Single chip class from the registry — bg + text + border come straight
 *  from the provider's `badge` visuals so adding a new platform doesn't need
 *  a new chip color rule here. */
function platformChipClasses(platformId: string): string {
  const visuals = getPlatformProviderOrFallback(platformId);
  return `${visuals.badge.bg} ${visuals.badge.text} ${visuals.badge.rowBorder}`;
}

function platformLabel(platformId: string): string {
  return getPlatformProviderOrFallback(platformId).displayName;
}

const PAGE_SIZE = 100;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const mins = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function ChatLogsPage() {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatLogMessage[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const data = await window.copilot.chatLogListSessions(platformFilter ? { platform: platformFilter } : undefined);
      setSessions(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Failed to load sessions'));
    }
  }, [platformFilter, t]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const loadMessages = useCallback(async (session: ChatSession, newOffset: number) => {
    setLoadingMessages(true);
    try {
      const data = await window.copilot.chatLogGetMessages(session.id, { limit: PAGE_SIZE, offset: newOffset });
      if (newOffset === 0) {
        setMessages(data);
      } else {
        setMessages((prev) => [...prev, ...data]);
      }
      setHasMore(data.length === PAGE_SIZE);
      setOffset(newOffset + data.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Failed to load messages'));
    } finally {
      setLoadingMessages(false);
    }
  }, [t]);

  const selectSession = useCallback(
    (session: ChatSession) => {
      setSelectedSession(session);
      setMessages([]);
      setOffset(0);
      setHasMore(false);
      void loadMessages(session, 0);
    },
    [loadMessages],
  );

  const handleExport = async () => {
    if (!selectedSession) return;
    setExporting(true);
    try {
      await window.copilot.chatLogExportSession(selectedSession.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (session: ChatSession) => {
    const platform = platformLabel(session.platform);
    const confirmed = window.confirm(
      `${t('Delete this chat log?')}\n\n${platform} · ${session.channel}\n${formatDate(session.startedAt)}\n${session.messageCount.toLocaleString()} ${t('messages')}\n\n${t('This cannot be undone.')}`,
    );
    if (!confirmed) return;

    setDeletingId(session.id);
    try {
      await window.copilot.chatLogDeleteSession(session.id);
      if (selectedSession?.id === session.id) {
        setSelectedSession(null);
        setMessages([]);
      }
      await loadSessions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Delete failed'));
    } finally {
      setDeletingId(null);
    }
  };

  // Collect unique platforms from sessions for filter tabs
  const platforms = Array.from(new Set(sessions.map((s) => s.platform)));

  const filteredSessions = platformFilter ? sessions.filter((s) => s.platform === platformFilter) : sessions;

  const handleClearAll = async () => {
    if (sessions.length === 0) return;
    const total = sessions.reduce((acc, s) => acc + s.messageCount, 0);
    const confirmed = window.confirm(
      `${t('Delete every chat log?')}\n\n${sessions.length} ${t('sessions')} · ${total.toLocaleString()} ${t('messages')}\n\n${t('This cannot be undone.')}`,
    );
    if (!confirmed) return;
    try {
      await window.copilot.chatLogClearAll();
      setSessions([]);
      setSelectedSession(null);
      setMessages([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Delete failed'));
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-800 shrink-0 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold mb-0.5">Chat Logs</h2>
          <p className="text-sm text-gray-400">Browse and export chat history per live session.</p>
        </div>
        <button
          type="button"
          disabled={sessions.length === 0}
          onClick={() => void handleClearAll()}
          className="px-3 py-1.5 rounded bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-200 text-xs font-medium transition-colors disabled:opacity-40 disabled:hover:bg-rose-600/20"
        >
          {t('Clear all')}
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Session list */}
        <div className="w-72 shrink-0 border-r border-gray-800 flex flex-col">
          {/* Platform filter */}
          {platforms.length > 1 && (
            <div className="px-3 py-2 border-b border-gray-800 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setPlatformFilter(null)}
                className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                  platformFilter === null
                    ? 'bg-violet-600/30 text-violet-300 border-violet-600/50'
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
                }`}
              >
                All
              </button>
              {platforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatformFilter(p === platformFilter ? null : p)}
                  className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                    platformFilter === p
                      ? platformChipClasses(p)
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
                  }`}
                >
                  {platformLabel(p)}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {filteredSessions.length === 0 ? (
              <p className="text-xs text-gray-500 italic px-4 py-6 text-center">
                {sessions.length === 0 ? 'No sessions recorded yet.' : 'No sessions for this platform.'}
              </p>
            ) : (
              filteredSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => selectSession(session)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-800/60 transition-colors group ${
                    selectedSession?.id === session.id
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-300 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded border ${platformChipClasses(session.platform)}`}
                    >
                      {platformLabel(session.platform)}
                    </span>
                    <span className="text-xs text-gray-500">{formatDuration(session.startedAt, session.endedAt)}</span>
                  </div>
                  <div className="text-xs font-mono text-gray-400 truncate">{session.channel}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500">{formatDate(session.startedAt)}</span>
                    <span className="text-xs text-gray-500">{session.messageCount.toLocaleString()} msgs</span>
                  </div>
                  {!session.endedAt && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-green-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                      Live
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Message viewer */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedSession ? (
            <>
              {/* Viewer header */}
              <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded border ${platformChipClasses(selectedSession.platform)}`}
                    >
                      {platformLabel(selectedSession.platform)}
                    </span>
                    <span className="text-sm font-mono text-gray-300">{selectedSession.channel}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDate(selectedSession.startedAt)}
                    {selectedSession.endedAt ? ` → ${formatDate(selectedSession.endedAt)}` : ' (active)'}
                    {' · '}
                    {selectedSession.messageCount.toLocaleString()} messages
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={deletingId === selectedSession.id}
                    onClick={() => void handleDelete(selectedSession)}
                    className="px-3 py-1.5 rounded text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => void handleExport()}
                    className="px-3 py-1.5 rounded text-xs bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-600/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {exporting ? 'Saving…' : 'Export HTML'}
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-0.5">
                {loadingMessages && messages.length === 0 ? (
                  <p className="text-xs text-gray-500 italic py-4">Loading…</p>
                ) : messages.length === 0 ? (
                  <p className="text-xs text-gray-500 italic py-4">No messages in this session.</p>
                ) : (
                  <>
                    {hasMore && (
                      <button
                        type="button"
                        disabled={loadingMessages}
                        onClick={() => void loadMessages(selectedSession, offset)}
                        className="w-full text-center py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-2"
                      >
                        {loadingMessages ? 'Loading…' : 'Load earlier messages'}
                      </button>
                    )}
                    {messages.map((msg) => (
                      <div key={msg.id} className="flex items-baseline gap-2 py-0.5 group hover:bg-gray-800/30 rounded px-1 -mx-1">
                        <span className="text-xs text-gray-600 shrink-0 tabular-nums w-12">{msg.timestampLabel}</span>
                        <span className="text-xs font-semibold text-violet-400 shrink-0" data-no-i18n="true">{msg.author}</span>
                        {msg.badges.length > 0 && (
                          <span className="flex gap-1">
                            {msg.badges.map((b) => (
                              <span key={b} className="text-xs bg-gray-700 text-gray-400 rounded px-1 py-0 leading-5">{b}</span>
                            ))}
                          </span>
                        )}
                        <span className="text-sm text-gray-200 break-words min-w-0" data-no-i18n="true">{msg.content}</span>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-gray-500">Select a session to view messages.</p>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="px-6 py-2 border-t border-gray-800 shrink-0">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
