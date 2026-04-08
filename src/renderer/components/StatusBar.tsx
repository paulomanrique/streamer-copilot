import type { ObsStatusSnapshot, PlatformConnectionStatus } from '../../shared/types.js';
import { styles } from './app-styles.js';

interface StatusBarProps {
  connections: PlatformConnectionStatus[];
  obsStatus: ObsStatusSnapshot;
}

export function StatusBar({ connections, obsStatus }: StatusBarProps) {
  return (
    <section style={styles.statusBar}>
      {connections.map((connection) => (
        <span key={connection.platform} style={styles.statusPill}>
          <span style={connection.connected ? styles.statusDotOn : styles.statusDotOff} />
          {connection.label}
        </span>
      ))}

      <span style={styles.statusPill}>
        <span style={obsStatus.connected ? styles.statusDotOn : styles.statusDotOff} />
        OBS {obsStatus.connected ? 'connected' : 'offline'}
      </span>

      <span style={styles.statusPill}>Scene {obsStatus.sceneName}</span>
      <span style={styles.statusPill}>Uptime {obsStatus.uptimeLabel}</span>
    </section>
  );
}
