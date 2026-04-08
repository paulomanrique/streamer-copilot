import type { AppInfo } from '../../shared/types.js';
import { styles } from './app-styles.js';
import type { AppSection } from './SectionTabs.js';

interface AppHeaderProps {
  appInfo: AppInfo | null;
  currentSection: AppSection;
  onChangeSection: (section: AppSection) => void;
  onOpenProfileSelector: () => void;
}

export function AppHeader({ appInfo, currentSection, onChangeSection, onOpenProfileSelector }: AppHeaderProps) {
  return (
    <header style={styles.topBar}>
      <div style={styles.brandRow}>
        <div style={styles.brandBadge}>SC</div>
        <div>
          <h1 style={styles.topBarTitle}>{appInfo?.appName ?? 'Streamer Copilot'}</h1>
          {appInfo ? <p style={styles.topBarMeta}>v{appInfo.appVersion} • Electron {appInfo.electronVersion}</p> : null}
        </div>
      </div>

      <nav style={styles.topNav}>
        <button
          type="button"
          style={currentSection === 'dashboard' ? styles.topNavButtonActive : styles.topNavButton}
          onClick={() => onChangeSection('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          style={currentSection === 'activity' ? styles.topNavButtonActive : styles.topNavButton}
          onClick={() => onChangeSection('activity')}
        >
          Activity
        </button>
        <button
          type="button"
          style={currentSection === 'settings' ? styles.topNavButtonActive : styles.topNavButton}
          onClick={() => onChangeSection('settings')}
        >
          Settings
        </button>
      </nav>

      <div style={styles.topActions}>
        <button type="button" style={styles.topGhostButton} onClick={onOpenProfileSelector}>
          Profiles
        </button>
        <button type="button" style={styles.liveButton}>
          Go Live
        </button>
      </div>
    </header>
  );
}
