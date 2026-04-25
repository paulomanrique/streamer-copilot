import { useEffect, useRef, useState } from 'react';

import { PERMISSION_LEVELS } from '../../shared/constants.js';
import type { PermissionLevel, SuggestionEntry, SuggestionList, SuggestionListMode, SuggestionListUpsertInput } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';

const EMPTY_FORM: SuggestionListUpsertInput = {
  title: '',
  trigger: '!',
  feedbackTemplate: '',
  feedbackSoundPath: null,
  mode: 'session',
  allowDuplicates: false,
  permissions: ['everyone'],
  cooldownSeconds: 0,
  userCooldownSeconds: 0,
  enabled: true,
};

function getFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || filePath;
}

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  everyone: 'Everyone',
  follower: 'Followers',
  subscriber: 'Subscribers',
  vip: 'VIP',
  moderator: 'Moderators',
  broadcaster: 'Broadcaster',
};

const MODE_LABELS: Record<SuggestionListMode, string> = {
  global: 'Global (persistent)',
  session: 'Session (clears on connect)',
};

function mapEntryCounts(lists: SuggestionList[]): Record<string, number> {
  return Object.fromEntries(lists.map((list) => [list.id, list.entryCount]));
}

export function SuggestionsPage() {
  const { t } = useI18n();
  const triggerInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<SuggestionList[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState(EMPTY_FORM.title);
  const [trigger, setTrigger] = useState(EMPTY_FORM.trigger);
  const [feedbackTemplate, setFeedbackTemplate] = useState(EMPTY_FORM.feedbackTemplate);
  const [mode, setMode] = useState<SuggestionListMode>(EMPTY_FORM.mode);
  const [allowDuplicates, setAllowDuplicates] = useState(EMPTY_FORM.allowDuplicates);
  const [levels, setLevels] = useState<PermissionLevel[]>(EMPTY_FORM.permissions);
  const [cooldownSeconds, setCooldownSeconds] = useState(EMPTY_FORM.cooldownSeconds);
  const [userCooldownSeconds, setUserCooldownSeconds] = useState(EMPTY_FORM.userCooldownSeconds);
  const [enabled, setEnabled] = useState(EMPTY_FORM.enabled);
  const [feedbackSoundPath, setFeedbackSoundPath] = useState<string | null>(EMPTY_FORM.feedbackSoundPath);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedListId, setExpandedListId] = useState<string | null>(null);
  const [entries, setEntries] = useState<SuggestionEntry[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    void (async () => {
      try {
        const lists = await window.copilot.listSuggestionLists();
        setRows(lists);
        setEntryCounts(mapEntryCounts(lists));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to load suggestion lists');
      }
    })();

    const disconnect = window.copilot.onSuggestionState((payload) => {
      setEntryCounts((prev) => ({ ...prev, [payload.list.id]: payload.entries.length }));
      if (payload.list.id === expandedListId) {
        setEntries(payload.entries);
      }
    });

    return () => disconnect();
  }, []);

  const resetForm = () => {
    setDraftId(undefined);
    setTitle(EMPTY_FORM.title);
    setTrigger(EMPTY_FORM.trigger);
    setFeedbackTemplate(EMPTY_FORM.feedbackTemplate);
    setMode(EMPTY_FORM.mode);
    setAllowDuplicates(EMPTY_FORM.allowDuplicates);
    setLevels([...EMPTY_FORM.permissions]);
    setCooldownSeconds(EMPTY_FORM.cooldownSeconds);
    setUserCooldownSeconds(EMPTY_FORM.userCooldownSeconds);
    setEnabled(EMPTY_FORM.enabled);
    setFeedbackSoundPath(EMPTY_FORM.feedbackSoundPath);
    setError(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
    setTimeout(() => triggerInputRef.current?.focus(), 50);
  };

  const openEdit = (list: SuggestionList) => {
    setDraftId(list.id);
    setTitle(list.title);
    setTrigger(list.trigger);
    setFeedbackTemplate(list.feedbackTemplate);
    setMode(list.mode);
    setAllowDuplicates(list.allowDuplicates);
    setLevels([...list.permissions]);
    setCooldownSeconds(list.cooldownSeconds);
    setUserCooldownSeconds(list.userCooldownSeconds);
    setEnabled(list.enabled);
    setFeedbackSoundPath(list.feedbackSoundPath);
    setError(null);
    setIsModalOpen(true);
    setTimeout(() => triggerInputRef.current?.focus(), 50);
  };

  const saveList = async () => {
    const trimmedTrigger = trigger.trim();
    if (!trimmedTrigger.startsWith('!') || trimmedTrigger.length < 2) {
      setError('Trigger must start with ! and have at least one character after it');
      return;
    }
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (levels.length === 0) {
      setError('Select at least one permission level');
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const input: SuggestionListUpsertInput = {
        id: draftId,
        title: title.trim(),
        trigger: trimmedTrigger,
        feedbackTemplate: feedbackTemplate.trim(),
        feedbackSoundPath,
        mode,
        allowDuplicates,
        permissions: levels,
        cooldownSeconds,
        userCooldownSeconds,
        enabled,
      };
      const updated = await window.copilot.upsertSuggestionList(input);
      setRows(updated);
      setEntryCounts(mapEntryCounts(updated));
      setIsModalOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteList = async (id: string) => {
    setIsBusy(true);
    try {
      const updated = await window.copilot.deleteSuggestionList({ id });
      setRows(updated);
      setEntryCounts(mapEntryCounts(updated));
      if (expandedListId === id) {
        setExpandedListId(null);
        setEntries([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete');
    } finally {
      setIsBusy(false);
    }
  };

  const toggleExpand = async (listId: string) => {
    if (expandedListId === listId) {
      setExpandedListId(null);
      setEntries([]);
      return;
    }
    try {
      const items = await window.copilot.getSuggestionEntries(listId);
      setEntries(items);
      setExpandedListId(listId);
      setEntryCounts((prev) => ({ ...prev, [listId]: items.length }));
    } catch {
      // silently ignore
    }
  };

  const clearEntries = async (listId: string) => {
    try {
      const items = await window.copilot.clearSuggestionEntries(listId);
      setEntries(items);
      setEntryCounts((prev) => ({ ...prev, [listId]: items.length }));
    } catch {
      // silently ignore
    }
  };

  const pickFeedbackSound = async () => {
    const path = await window.copilot.pickSoundFile();
    if (path) setFeedbackSoundPath(path);
  };

  const previewFeedbackSound = async () => {
    if (feedbackSoundPath) await window.copilot.previewPlay({ filePath: feedbackSoundPath });
  };

  const toggleLevel = (level: PermissionLevel) => {
    setLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level],
    );
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Suggestions</h1>
          <p className="text-sm text-gray-400 mt-1">
            Viewers submit suggestions via chat commands. Create multiple lists with different triggers.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700 transition-colors"
        >
          + New List
        </button>
      </div>

      {error && !isModalOpen && (
        <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded text-sm text-red-300">{error}</div>
      )}

      {rows.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">No suggestion lists yet</p>
          <p className="text-sm">Click &quot;+ New List&quot; to create your first suggestion list.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((list) => (
            <div key={list.id} className="bg-gray-800 rounded border border-gray-700">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleExpand(list.id)}
                  className="text-gray-400 hover:text-white transition-colors"
                  title="Toggle entries"
                >
                  <svg className={`w-4 h-4 transition-transform ${expandedListId === list.id ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">{list.title}</span>
                    <code className="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-purple-300">{list.trigger}</code>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${list.mode === 'global' ? 'bg-blue-900/50 text-blue-300' : 'bg-amber-900/50 text-amber-300'}`}>
                      {list.mode}
                    </span>
                    {!list.enabled && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">disabled</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {entryCounts[list.id] ?? 0} entries
                    {list.allowDuplicates ? '' : ' · unique per user'}
                    {' · '}
                    {list.permissions.map((p) => t(PERMISSION_LABELS[p] || p)).join(', ')}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(list)}
                    className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteList(list.id)}
                    disabled={isBusy}
                    className="p-1.5 text-gray-400 hover:text-red-400 rounded transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {expandedListId === list.id && (
                <div className="border-t border-gray-700 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">{entries.length} suggestion{entries.length !== 1 ? 's' : ''}</span>
                    <button
                      type="button"
                      onClick={() => clearEntries(list.id)}
                      disabled={entries.length === 0}
                      className="text-xs px-2 py-1 text-red-400 hover:text-red-300 disabled:text-gray-600 transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                  {entries.length === 0 ? (
                    <p className="text-sm text-gray-600 py-2">No suggestions yet.</p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {entries.map((entry) => (
                        <div key={entry.id} className="flex items-center gap-2 text-sm py-1 px-2 bg-gray-900 rounded">
                          <span className="text-xs text-gray-500 uppercase">{entry.platform}</span>
                          <span className="text-purple-300 font-medium">{entry.displayName}</span>
                          <span className="text-gray-300 flex-1 truncate">{entry.content}</span>
                          <span className="text-xs text-gray-600">{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">
                {draftId ? 'Edit Suggestion List' : 'New Suggestion List'}
              </h2>
            </div>

            <div className="px-6 py-4 space-y-4">
              {error && (
                <div className="p-3 bg-red-900/40 border border-red-700 rounded text-sm text-red-300">{error}</div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Game Suggestions"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:border-purple-500 focus:outline-none"
                />
              </div>

              {/* Trigger */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">Chat Command</label>
                <input
                  ref={triggerInputRef}
                  type="text"
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  placeholder="!jogo"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm font-mono focus:border-purple-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Viewers type: <code className="text-purple-300">{trigger || '!cmd'} Pacman</code></p>
              </div>

              {/* Feedback */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">Feedback</label>
                <input
                  type="text"
                  value={feedbackTemplate}
                  onChange={(e) => setFeedbackTemplate(e.target.value)}
                  placeholder="Thanks for the suggestion, {username}"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:border-purple-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Use <code className="text-purple-300">{'{username}'}</code> for the viewer name.</p>
              </div>

              {/* Feedback Sound */}
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Feedback Sound <span className="text-gray-600">(optional)</span></label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={feedbackSoundPath ? getFileName(feedbackSoundPath) : ''}
                    readOnly
                    placeholder="no sound selected"
                    className="flex-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-300 px-3 py-2 placeholder-gray-600"
                  />
                  {feedbackSoundPath && (
                    <button type="button" onClick={() => void previewFeedbackSound()}
                      className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
                      Test
                    </button>
                  )}
                  <button type="button" onClick={() => void pickFeedbackSound()}
                    className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors whitespace-nowrap">
                    Choose file...
                  </button>
                  {feedbackSoundPath && (
                    <button type="button" onClick={() => setFeedbackSoundPath(null)}
                      className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
                      ✕
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-1">Plays once for every accepted suggestion.</p>
              </div>

              {/* Mode */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">List Mode</label>
                <div className="flex gap-3">
                  {(['session', 'global'] as const).map((m) => (
                    <label key={m} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="suggestion-mode"
                        checked={mode === m}
                        onChange={() => setMode(m)}
                        className="accent-purple-500"
                      />
                      <span className="text-sm text-gray-300">{t(MODE_LABELS[m])}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Allow Duplicates */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowDuplicates}
                    onChange={(e) => setAllowDuplicates(e.target.checked)}
                    className="accent-purple-500"
                  />
                  <span className="text-sm text-gray-300">Allow multiple suggestions per user</span>
                </label>
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">Who can suggest</label>
                <div className="flex flex-wrap gap-2">
                  {PERMISSION_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => toggleLevel(level)}
                      className={
                        levels.includes(level)
                          ? 'px-3 py-1 text-xs rounded-full bg-purple-600 text-white'
                          : 'px-3 py-1 text-xs rounded-full bg-gray-700 text-gray-400 hover:text-white'
                      }
                    >
                      {t(PERMISSION_LABELS[level])}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cooldowns */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Global Cooldown (s)</label>
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={cooldownSeconds}
                    onChange={(e) => setCooldownSeconds(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Per-User Cooldown (s)</label>
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={userCooldownSeconds}
                    onChange={(e) => setUserCooldownSeconds(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Enabled */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="accent-purple-500"
                  />
                  <span className="text-sm text-gray-300">Enabled</span>
                </label>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isBusy}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveList}
                disabled={isBusy}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {isBusy ? 'Saving...' : draftId ? 'Save Changes' : 'Create List'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
