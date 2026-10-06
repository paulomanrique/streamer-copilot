import logoUrl from '../assets/logo.svg';
import type { ObsStatsSnapshot, PlatformLiveEntry, TwitchLiveStats } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { ObsStatsPanel } from './ObsStatsPanel.js';

interface AppHeaderProps {
  obsStats: ObsStatsSnapshot;
  /** Uniform live entries from the registry (App.tsx) — already platform-agnostic. */
  liveEntries: PlatformLiveEntry[];
  /** Twitch-only hype-train slice (no cross-platform analog). */
  twitchLiveStatsByChannel: Record<string, TwitchLiveStats>;
  onOpenSettings: () => void;
}

export function AppHeader({ obsStats, liveEntries, twitchLiveStatsByChannel, onOpenSettings }: AppHeaderProps) {
  const { messages } = useI18n();

  return (
    <header className="flex items-center gap-3 px-3 h-12 bg-gray-900 border-b border-gray-800 shrink-0 z-10">
      <img src={logoUrl} alt="Streamer Copilot" className="w-7 h-7 rounded-lg shrink-0" />

      <div className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:none]">
        <ObsStatsPanel stats={obsStats} liveEntries={liveEntries} twitchLiveStatsByChannel={twitchLiveStatsByChannel} />
      </div>

      <button
        type="button"
        onClick={onOpenSettings}
        title={messages.settings.title}
        aria-label={messages.settings.title}
        className="flex items-center justify-center w-8 h-8 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors shrink-0"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
    </header>
  );
}
