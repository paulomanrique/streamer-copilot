import type { ObsStatusSnapshot, PlatformConnectionStatus } from '../../shared/types.js';
import { styles } from './app-styles.js';

interface StatusBarProps {
  connections: PlatformConnectionStatus[];
  obsStatus: ObsStatusSnapshot;
}

export function StatusBar({ connections, obsStatus }: StatusBarProps) {
  return (
    <footer style={styles.statusBar}>
      {connections.map((connection) => (
        <span key={connection.platform} style={styles.statusLine}>
          <span style={{ color: connection.connected ? '#e5e7eb' : '#6b7280' }}>{connection.label}</span>
          <span style={styles.statusDivider}>•</span>
        </span>
      ))}

      <span style={styles.statusLine}>
        OBS {obsStatus.connected ? 'connected' : 'offline'}
        <span style={styles.statusDivider}>•</span>
      </span>
      <span style={styles.statusLine}>Scene: {obsStatus.sceneName}</span>
      <span style={styles.statusLine}>Profile: live</span>
      <span style={styles.statusLine}>{obsStatus.uptimeLabel}</span>
    </footer>
  );
}
