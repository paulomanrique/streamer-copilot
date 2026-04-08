import type { AppInfo } from '../../shared/types.js';
import { styles } from './app-styles.js';

interface AppHeaderProps {
  appInfo: AppInfo | null;
  onOpenProfileSelector: () => void;
}

export function AppHeader({ appInfo, onOpenProfileSelector }: AppHeaderProps) {
  return (
    <header style={styles.headerRow}>
      <div>
        <h1 style={styles.title}>Streamer Copilot - M0 Foundations</h1>
        {appInfo && (
          <p style={styles.meta}>
            {appInfo.appName} v{appInfo.appVersion} • Electron {appInfo.electronVersion} • Node {appInfo.nodeVersion}
          </p>
        )}
      </div>

      <button type="button" style={styles.secondaryButton} onClick={onOpenProfileSelector}>
        Switch Profile
      </button>
    </header>
  );
}
