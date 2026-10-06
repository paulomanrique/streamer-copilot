import { useCallback, useMemo, useRef, useState } from 'react';
import { LegendList, type LegendListRef } from '@legendapp/list/react';

import type { StreamEvent } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { EventBanner } from './EventBanner.js';

export type ActivityTypeFilter = Record<StreamEvent['type'], boolean>;

const ACTIVITY_TYPES: StreamEvent['type'][] = ['subscription', 'superchat', 'raid', 'cheer', 'follow', 'gift'];

export function allActivityTypes(enabled: boolean): ActivityTypeFilter {
  return Object.fromEntries(ACTIVITY_TYPES.map((type) => [type, enabled])) as ActivityTypeFilter;
}

/** Dropdown that picks which event types the activity log shows. */
export function ActivityTypeFilterMenu({ value, onChange }: { value: ActivityTypeFilter; onChange: (next: ActivityTypeFilter) => void }) {
  const { messages, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  const activityConfig = useMemo(
    () => ({
      subscription: { icon: '⭐', label: t('Subscriptions') },
      superchat: { icon: '💸', label: t('Super Chats') },
      raid: { icon: '⚔️', label: t('Raids') },
      cheer: { icon: '✨', label: t('Cheers') },
      follow: { icon: '👋', label: t('Follows') },
      gift: { icon: '🎁', label: t('Gift Subs') },
    }),
    [t],
  );

  return (
    <div className="relative">
      <button
        type="button"
        id="activity-filter-btn"
        onClick={() => setIsOpen((current) => !current)}
        className="flex items-center gap-1 h-8 px-2 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
        </svg>
        {t('Filter')}
      </button>
      {isOpen ? (
        <div id="activity-filter-panel" className="absolute right-0 top-full mt-1 w-52 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-20 p-3">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">{t('Show in Log')}</p>
          <div className="space-y-1" id="activity-filter-list">
            {ACTIVITY_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer py-0.5 group">
                <input
                  type="checkbox"
                  checked={value[type]}
                  onChange={(event) => onChange({ ...value, [type]: event.target.checked })}
                  className="accent-violet-500 cursor-pointer"
                />
                <span className="text-sm">{activityConfig[type].icon}</span>
                <span className="text-xs text-gray-300 group-hover:text-white transition-colors">{activityConfig[type].label}</span>
              </label>
            ))}
          </div>
          <div className="border-t border-gray-700 mt-2 pt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onChange(allActivityTypes(true))}
              className="flex-1 text-xs py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              {t('All')}
            </button>
            <button
              type="button"
              onClick={() => onChange(allActivityTypes(false))}
              className="flex-1 text-xs py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              {messages.common.none}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Scrolling activity list. Same stick-to-bottom behavior as the chat feed —
 *  newest events append at the bottom, the list follows while the user is at
 *  the end, and a jump-to-bottom button appears once they scroll up. */
export function ActivityLogList({ events, emptyLabel }: { events: StreamEvent[]; emptyLabel?: string }) {
  const { t } = useI18n();
  const listRef = useRef<LegendListRef | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const onScroll = useCallback(() => {
    const state = listRef.current?.getState();
    if (!state) return;
    setAtBottom((current) => (current === state.isAtEnd ? current : state.isAtEnd));
  }, []);
  const jumpToBottom = () => {
    void listRef.current?.scrollToEnd({ animated: true });
    setAtBottom(true);
  };

  return (
    <div className="relative h-full px-4 py-2">
      {events.length > 0 ? (
        <LegendList<StreamEvent>
          ref={listRef}
          data={events}
          keyExtractor={(event) => event.id}
          renderItem={({ item }) => <EventBanner event={item} variant="activity" />}
          estimatedItemSize={40}
          initialScrollAtEnd
          maintainScrollAtEnd
          maintainScrollAtEndThreshold={0.25}
          maintainVisibleContentPosition
          onScroll={onScroll}
          className="h-full overflow-y-auto text-xs"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-gray-500">{emptyLabel ?? t('No activity yet.')}</div>
      )}
      {!atBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label="Scroll to bottom"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-violet-600 hover:bg-violet-500 text-white p-1.5 rounded-full shadow-2xl border border-violet-400/30 transition-all animate-bounce"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}
    </div>
  );
}
