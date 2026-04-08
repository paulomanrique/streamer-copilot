import type { AppInfo } from '../../shared/types.js';
import type { AppSection } from './SectionTabs.js';

interface AppHeaderProps {
  appInfo: AppInfo | null;
  currentSection: AppSection;
  onChangeSection: (section: AppSection) => void;
}

function MenuIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function AppHeader({ appInfo, currentSection, onChangeSection }: AppHeaderProps) {
  const appName = appInfo?.appName ?? 'Streamer Copilot';

  return (
    <header className="flex items-center gap-4 px-4 h-12 bg-gray-900 border-b border-gray-800 shrink-0 z-10">
      <div className="flex items-center gap-2 mr-2">
        <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center text-sm font-bold">SC</div>
        <span className="font-semibold text-sm hidden sm:block">{appName}</span>
      </div>

      <nav className="flex gap-1">
        <button
          type="button"
          onClick={() => onChangeSection('dashboard')}
          className={
            currentSection === 'dashboard'
              ? 'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors bg-violet-600 text-white'
              : 'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors text-gray-400 hover:text-white'
          }
        >
          <MenuIcon />
          Dashboard
        </button>
        <button
          type="button"
          onClick={() => onChangeSection('settings')}
          className={
            currentSection === 'settings'
              ? 'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors bg-violet-600 text-white'
              : 'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors text-gray-400 hover:text-white'
          }
        >
          <SettingsIcon />
          Settings
        </button>
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-sm font-medium transition-colors"
        >
          <span className="pulse-dot w-2 h-2 rounded-full bg-white" />
          Go Live
        </button>
      </div>
    </header>
  );
}
