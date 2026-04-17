import { useI18n } from '../i18n/I18nProvider.js';
import { styles } from './app-styles.js';

export type AppSection = 'dashboard' | 'settings';

interface SectionTabsProps {
  currentSection: AppSection;
  onChangeSection: (section: AppSection) => void;
}

export function SectionTabs({ currentSection, onChangeSection }: SectionTabsProps) {
  const { messages, t } = useI18n();
  return (
    <nav style={styles.sectionTabs}>
      <button
        type="button"
        style={currentSection === 'dashboard' ? styles.tabButtonActive : styles.tabButton}
        onClick={() => onChangeSection('dashboard')}
      >
        {t('Dashboard')}
      </button>
      <button
        type="button"
        style={currentSection === 'settings' ? styles.tabButtonActive : styles.tabButton}
        onClick={() => onChangeSection('settings')}
      >
        {messages.settings.title}
      </button>
    </nav>
  );
}
