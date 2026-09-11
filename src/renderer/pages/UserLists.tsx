import { useState } from 'react';

import { useI18n } from '../i18n/I18nProvider.js';
import { getPlatformProviderOrFallback } from '../platforms/registry.js';
import { useAppStore } from '../store.js';

/**
 * Management page for user lists.
 *
 * The streamer can create/rename/delete lists and remove members. Adding a
 * member happens via right-click in the chat feed (where we have the native
 * userId on hand).
 */
export function UserListsPage() {
  const { t, language } = useI18n();
  const lists = useAppStore((s) => s.userLists);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // window.prompt is a silent no-op in Electron — use inline inputs.
  const [newListMode, setNewListMode] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const selected = lists.find((l) => l.id === selectedId) ?? lists[0] ?? null;

  const runAction = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Failed'));
    } finally {
      setBusy(false);
    }
  };

  const submitNewList = async () => {
    const trimmed = newListName.trim();
    if (!trimmed) return;
    await runAction(async () => {
      const next = await window.copilot.createUserList({ name: trimmed });
      const created = next.find((l) => l.name === trimmed);
      if (created) setSelectedId(created.id);
    });
    setNewListMode(false);
    setNewListName('');
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const submitRename = async () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    const current = lists.find((l) => l.id === renamingId);
    if (!trimmed || trimmed === current?.name) {
      setRenamingId(null);
      return;
    }
    await runAction(() => window.copilot.renameUserList({ id: renamingId, name: trimmed }));
    setRenamingId(null);
  };

  const deleteList = async (id: string, name: string) => {
    const confirmed = language === 'pt-BR'
      ? window.confirm(`Apagar a lista "${name}"? Esta ação é irreversível.`)
      : window.confirm(`Delete the list "${name}"? This cannot be undone.`);
    if (!confirmed) return;
    await runAction(async () => {
      await window.copilot.deleteUserList({ id });
      if (selectedId === id) setSelectedId(null);
    });
  };

  const removeMember = async (listId: string, platform: string, userId: string) => {
    await runAction(() => window.copilot.removeUserListMember({ listId, platform, userId }));
  };

  return (
    <div className="p-6">
      <header className="mb-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-100">User Lists</h2>
          {newListMode ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => { e.preventDefault(); void submitNewList(); }}
            >
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.preventDefault(); setNewListMode(false); setNewListName(''); }
                }}
                placeholder="List name"
                autoFocus
                className="bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 px-2 py-1 w-48 focus:outline-none focus:border-violet-500"
              />
              <button type="submit" disabled={!newListName.trim() || busy} className="px-2 py-1 rounded bg-violet-600 hover:bg-violet-500 text-sm text-white disabled:opacity-50">OK</button>
              <button type="button" onClick={() => { setNewListMode(false); setNewListName(''); }} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-sm text-gray-300">Cancel</button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => { setNewListMode(true); setNewListName(''); }}
              disabled={busy}
              className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm text-white disabled:opacity-50"
            >
              + New list
            </button>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-1">
          Lists group users from any platform. Right-click in chat to add members, and reference the list in command permissions.
        </p>
        {error ? <p className="text-sm text-red-400 mt-2">{error}</p> : null}
      </header>

      {lists.length === 0 ? (
        <p className="text-sm text-gray-500">No lists yet. Create one to get started.</p>
      ) : (
        <div className="grid grid-cols-[240px_1fr] gap-4">
          <aside className="space-y-1">
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                onClick={() => setSelectedId(list.id)}
                className={[
                  'w-full text-left px-3 py-2 rounded text-sm transition-colors',
                  selected?.id === list.id
                    ? 'bg-violet-600/30 border border-violet-500/40 text-violet-100'
                    : 'bg-gray-900/40 border border-gray-700 text-gray-300 hover:bg-gray-800',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{list.name}</span>
                  <span className="text-[10px] text-gray-500 shrink-0 ml-2">{list.members.length}</span>
                </div>
              </button>
            ))}
          </aside>

          <section className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
            {selected ? (
              <>
                <div className="flex items-center justify-between mb-3 gap-2">
                  {renamingId === selected.id ? (
                    <form
                      className="flex items-center gap-1 flex-1"
                      onSubmit={(e) => { e.preventDefault(); void submitRename(); }}
                    >
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); }
                        }}
                        autoFocus
                        className="flex-1 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 px-2 py-1 focus:outline-none focus:border-violet-500"
                      />
                      <button type="submit" disabled={!renameValue.trim() || busy} className="px-2 py-1 rounded bg-violet-600 hover:bg-violet-500 text-xs text-white disabled:opacity-40">OK</button>
                      <button type="button" onClick={() => setRenamingId(null)} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-300">Cancel</button>
                    </form>
                  ) : (
                    <h3 className="text-base font-medium text-gray-200">{selected.name}</h3>
                  )}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => startRename(selected.id, selected.name)}
                      disabled={busy || renamingId === selected.id}
                      className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 disabled:opacity-40"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteList(selected.id, selected.name)}
                      disabled={busy}
                      className="px-2 py-1 rounded bg-red-900/40 hover:bg-red-900/60 text-xs text-red-300"
                    >
                      Delete list
                    </button>
                  </div>
                </div>

                {selected.members.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No members yet. Add one by right-clicking a name in chat.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {selected.members.map((member) => {
                      const provider = getPlatformProviderOrFallback(member.platform);
                      return (
                        <li
                          key={`${member.platform}:${member.userId}`}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-gray-800/60"
                        >
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${provider.badge.bg} ${provider.badge.text} shrink-0`}>
                            {provider.displayName}
                          </span>
                          <span className="text-sm text-gray-200 flex-1 truncate">{member.displayName}</span>
                          <span className="text-[10px] text-gray-600 font-mono truncate max-w-[160px]">{member.userId}</span>
                          <button
                            type="button"
                            onClick={() => void removeMember(selected.id, member.platform, member.userId)}
                            disabled={busy}
                            className="text-xs text-gray-500 hover:text-red-400 px-1"
                            aria-label="Remove member"
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Select a list on the left.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
