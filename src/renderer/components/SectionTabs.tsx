import { styles } from './app-styles.js';

export type AppSection = 'dashboard' | 'activity' | 'settings';

interface SectionTabsProps {
  currentSection: AppSection;
  onChangeSection: (section: AppSection) => void;
}

export function SectionTabs({ currentSection, onChangeSection }: SectionTabsProps) {
  return (
    <nav style={styles.sectionTabs}>
      <button
        type="button"
        style={currentSection === 'dashboard' ? styles.tabButtonActive : styles.tabButton}
        onClick={() => onChangeSection('dashboard')}
      >
        Dashboard
      </button>
      <button
        type="button"
        style={currentSection === 'activity' ? styles.tabButtonActive : styles.tabButton}
        onClick={() => onChangeSection('activity')}
      >
        Activity
      </button>
      <button
        type="button"
        style={currentSection === 'settings' ? styles.tabButtonActive : styles.tabButton}
        onClick={() => onChangeSection('settings')}
      >
        Settings
      </button>
    </nav>
  );
}
