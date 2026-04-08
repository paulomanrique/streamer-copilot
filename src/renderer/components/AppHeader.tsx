import type { AppInfo } from '../../shared/types.js';
import { styles } from './app-styles.js';
import type { AppSection } from './SectionTabs.js';

interface AppHeaderProps {
  appInfo: AppInfo | null;
  currentSection: AppSection;
  onChangeSection: (section: AppSection) => void;
}

export function AppHeader({ appInfo, currentSection, onChangeSection }: AppHeaderProps) {
  return (
    <header style={styles.topBar}>
      <div style={styles.brandRow}>
        <div style={styles.brandBadge}>SC</div>
        <div>
          <h1 style={styles.topBarTitle}>{appInfo?.appName ?? 'Streamer Copilot'}</h1>
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
          style={currentSection === 'settings' ? styles.topNavButtonActive : styles.topNavButton}
          onClick={() => onChangeSection('settings')}
        >
          Settings
        </button>
      </nav>

      <div style={styles.topActions}>
        <button type="button" style={styles.liveButton}>
          Go Live
        </button>
      </div>
    </header>
  );
}
