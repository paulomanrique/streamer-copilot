import { useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

import type {
  PermissionEntry,
  PermissionLevel,
  PermissionRoleId,
  PlatformId,
} from '../../shared/types.js';
import { listPlatformProviders } from '../platforms/registry.js';
import { useAppStore } from '../store.js';

interface PermissionListPickerProps {
  value: PermissionEntry[];
  onChange: (next: PermissionEntry[]) => void;
}

const ROLE_LABELS: Record<PermissionLevel, string> = {
  everyone: 'Everyone',
  follower: 'Follower',
  subscriber: 'Subscriber',
  vip: 'VIP',
  moderator: 'Moderator',
  broadcaster: 'Broadcaster',
};

/**
 * Permission picker — chip list + an "Add" dropdown.
 *
 * The dropdown groups options into:
 *   1. User lists (with a "+ New list..." action).
 *   2. Each registered platform: its hierarchical roles + the dynamic tiers
 *      coming from the `subscriberTiers` catalog.
 *
 * Each chosen entry becomes a removable chip in the list. Duplicates are
 * blocked at selection time.
 */
export function PermissionListPicker({ value, onChange }: PermissionListPickerProps) {
  const subscriberTiers = useAppStore((s) => s.subscriberTiers);
  const userLists = useAppStore((s) => s.userLists);
  const platformStatus = useAppStore((s) => s.platformStatus);
  const providers = useMemo(() => listPlatformProviders(), []);
  const connectedProviders = useMemo(
    () => providers.filter((provider) => platformStatus[provider.id as PlatformId] === 'connected'),
    [providers, platformStatus],
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // window.prompt is a silent no-op in Electron — use an inline input
  // inside the dropdown for the "New list" option.
  const [newListMode, setNewListMode] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListError, setNewListError] = useState<string | null>(null);
  // Portal-based positioning: o dropdown precisa escapar do overflow-y-auto
  // the parent modal's overflow:hidden (without this the content is clipped inside the form container).
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Fecha o dropdown quando o usuário clica fora.
  useEffect(() => {
    if (!dropdownOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inDropdown = dropdownRef.current?.contains(target);
      const inTrigger = triggerRef.current?.contains(target);
      if (!inDropdown && !inTrigger) {
        setDropdownOpen(false);
        setNewListMode(false);
        setNewListName('');
        setNewListError(null);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [dropdownOpen]);

  // Posiciona o dropdown abaixo do trigger usando coordenadas absolutas no
  // viewport (position: fixed). Recalcula em scroll/resize para acompanhar
  // a rolagem do modal pai.
  useLayoutEffect(() => {
    if (!dropdownOpen) {
      setDropdownPos(null);
      return;
    }
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(260, rect.width) });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [dropdownOpen]);

  const hasEntry = (entry: PermissionEntry): boolean => {
    return value.some((e) => entriesEqual(e, entry));
  };

  const addEntry = (entry: PermissionEntry) => {
    if (hasEntry(entry)) return;
    onChange([...value, entry]);
    setDropdownOpen(false);
  };

  const removeAt = (index: number) => {
    const next = value.filter((_, i) => i !== index);
    onChange(next);
  };

  const submitNewList = async () => {
    const trimmed = newListName.trim();
    if (!trimmed) return;
    try {
      const lists = await window.copilot.createUserList({ name: trimmed });
      const created = lists.find((l) => l.name === trimmed);
      if (created) addEntry({ kind: 'list', listId: created.id });
      setNewListMode(false);
      setNewListName('');
      setNewListError(null);
    } catch (cause) {
      setNewListError(cause instanceof Error ? cause.message : 'Falha ao criar a lista');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.length === 0 ? (
          <span className="text-xs text-gray-500 self-center">Ninguém pode usar ainda — adicione abaixo.</span>
        ) : (
          value.map((entry, index) => (
            <EntryChip key={entryKey(entry)} entry={entry} onRemove={() => removeAt(index)} />
          ))
        )}
      </div>

      <div>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setDropdownOpen((v) => !v)}
          className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 border border-gray-700"
        >
          + Adicionar
        </button>
        {dropdownOpen && dropdownPos ? createPortal((
          <div
            ref={dropdownRef}
            style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, minWidth: dropdownPos.width, zIndex: 1000 }}
            className="max-h-[420px] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
          >
            {/* Listas */}
            <DropdownSection title="Listas">
              {userLists.map((list) => {
                const entry: PermissionEntry = { kind: 'list', listId: list.id };
                const already = hasEntry(entry);
                return (
                  <DropdownItem
                    key={list.id}
                    label={`${list.name} (${list.members.length})`}
                    disabled={already}
                    onClick={() => addEntry(entry)}
                  />
                );
              })}
              {newListMode ? (
                <form
                  className="px-3 py-1.5 flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitNewList();
                  }}
                >
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setNewListMode(false);
                        setNewListName('');
                        setNewListError(null);
                      }
                    }}
                    placeholder="Nome da lista"
                    autoFocus
                    className="flex-1 bg-gray-800 border border-gray-600 rounded text-xs text-gray-200 px-2 py-1 focus:outline-none focus:border-violet-500"
                  />
                  <button
                    type="submit"
                    disabled={!newListName.trim()}
                    className="px-2 py-1 rounded bg-violet-600 hover:bg-violet-500 text-xs text-white disabled:opacity-40"
                  >
                    OK
                  </button>
                </form>
              ) : (
                <DropdownItem label="+ Nova lista..." onClick={() => { setNewListMode(true); setNewListName(''); setNewListError(null); }} accent />
              )}
              {newListError ? (
                <p className="px-3 py-1 text-xs text-red-400">{newListError}</p>
              ) : null}
            </DropdownSection>

            {/* Plataformas — only connected ones are offered. Granting a role
              * on a disconnected sibling driver (e.g. "YouTube (API)" while
              * the chat flows through "YouTube (Scraped)") creates an entry
              * that matches no message, and the command looks broken for
              * everyone. Existing chips keep rendering regardless, so stale
              * entries remain visible and removable. */}
            {connectedProviders.length === 0 ? (
              <DropdownSection title="Plataformas">
                <p className="px-3 py-1.5 text-xs text-gray-500">
                  Nenhuma plataforma conectada — conecte em Plataformas para liberar papéis por plataforma.
                </p>
              </DropdownSection>
            ) : null}
            {connectedProviders.map((provider) => {
              const platformId = provider.id as PlatformId;
              const tierEntries = provider.hasSubscriberTiers
                ? (subscriberTiers.byPlatform[platformId] ?? [])
                : [];
              const sortedTiers = [...tierEntries].sort((a, b) => a.order - b.order);
              return (
                <DropdownSection key={provider.id} title={provider.displayName} hint="conectado" hintAccent>
                  {provider.supportedRoles.map((role) => {
                    if (role === 'subscriber' && sortedTiers.length > 0) {
                      // When explicit tiers exist, the generic "Subscriber" is still useful
                      // (admits any tier). Render it before the tier-specific entries.
                      return (
                        <DropdownItem
                          key={role}
                          label="Subscriber (qualquer tier)"
                          disabled={hasEntry({ kind: 'platform-role', platform: platformId, role: 'subscriber' })}
                          onClick={() => addEntry({ kind: 'platform-role', platform: platformId, role: 'subscriber' })}
                        />
                      );
                    }
                    return (
                      <DropdownItem
                        key={role}
                        label={ROLE_LABELS[role]}
                        disabled={hasEntry({ kind: 'platform-role', platform: platformId, role })}
                        onClick={() => addEntry({ kind: 'platform-role', platform: platformId, role })}
                      />
                    );
                  })}
                  {sortedTiers.map((tier) => {
                    const roleId = `tier:${tier.id}` as PermissionRoleId;
                    return (
                      <DropdownItem
                        key={tier.id}
                        label={tier.label}
                        indent
                        disabled={hasEntry({ kind: 'platform-role', platform: platformId, role: roleId })}
                        onClick={() => addEntry({ kind: 'platform-role', platform: platformId, role: roleId })}
                      />
                    );
                  })}
                </DropdownSection>
              );
            })}
          </div>
        ), document.body) : null}
      </div>
    </div>
  );
}

/** Stable, content-derived React key. Entries are unique (duplicates are blocked
 *  at selection time), so this never collides within a list. */
function entryKey(entry: PermissionEntry): string {
  return entry.kind === 'list'
    ? `list:${entry.listId}`
    : `role:${entry.platform}:${entry.role}`;
}

function entriesEqual(a: PermissionEntry, b: PermissionEntry): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'list' && b.kind === 'list') return a.listId === b.listId;
  if (a.kind === 'platform-role' && b.kind === 'platform-role') {
    return a.platform === b.platform && a.role === b.role;
  }
  return false;
}

function EntryChip({ entry, onRemove }: { entry: PermissionEntry; onRemove: () => void }) {
  const userLists = useAppStore((s) => s.userLists);
  const subscriberTiers = useAppStore((s) => s.subscriberTiers);
  const providers = useMemo(() => listPlatformProviders(), []);

  const label = useMemo(() => {
    if (entry.kind === 'list') {
      const list = userLists.find((l) => l.id === entry.listId);
      return `Lista: ${list?.name ?? 'desconhecida'}`;
    }
    const provider = providers.find((p) => p.id === entry.platform);
    const platformName = provider?.displayName ?? entry.platform;
    const role = entry.role;
    if (typeof role === 'string' && role.startsWith('tier:')) {
      const tierId = role.slice('tier:'.length);
      const tierEntry = subscriberTiers.byPlatform[entry.platform]?.find((t) => t.id === tierId);
      return `${platformName} • ${tierEntry?.label ?? tierId}`;
    }
    return `${platformName} • ${ROLE_LABELS[role as PermissionLevel] ?? role}`;
  }, [entry, userLists, subscriberTiers, providers]);

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-600/20 border border-violet-500/40 text-xs text-violet-200">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="text-violet-300 hover:text-white text-xs leading-none ml-0.5"
        aria-label="Remover"
      >
        ×
      </button>
    </span>
  );
}

function DropdownSection({
  title,
  hint,
  hintAccent,
  children,
}: {
  title: string;
  hint?: string;
  hintAccent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-800 last:border-b-0 py-1">
      <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500 font-semibold flex items-center gap-1.5">
        {title}
        {hint ? (
          <span
            className={`normal-case tracking-normal font-normal ${
              hintAccent ? 'text-emerald-400' : 'text-gray-600'
            }`}
          >
            • {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function DropdownItem({
  label,
  onClick,
  disabled,
  indent,
  accent,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  indent?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full text-left px-3 py-1.5 text-xs transition-colors',
        indent ? 'pl-7' : '',
        accent ? 'text-violet-300 hover:bg-violet-600/20' : 'text-gray-200 hover:bg-gray-800',
        disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : '',
      ].filter(Boolean).join(' ')}
    >
      {label}
    </button>
  );
}
