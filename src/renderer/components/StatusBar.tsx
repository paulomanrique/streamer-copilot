import type { ObsStatusSnapshot, PlatformConnectionStatus } from '../../shared/types.js';
import { styles } from './app-styles.js';

const PLATFORM_DOT_COLORS: Record<string, string> = {
  twitch: '#a855f7',
  youtube: '#ef4444',
  'youtube-v': '#fb7185',
  kick: '#22c55e',
  tiktok: '#ec4899',
};

interface StatusBarProps {
  connections: PlatformConnectionStatus[];
  obsStatus: ObsStatusSnapshot;
  activeProfileName: string;
}

export function StatusBar({ connections, obsStatus, activeProfileName }: StatusBarProps) {
  return (
    <footer style={styles.statusBar}>
      {connections.map((connection) => {
        const dotColor = connection.connected
          ? (PLATFORM_DOT_COLORS[connection.platform] ?? '#6b7280')
          : '#374151';
        return (
          <span key={connection.platform} style={styles.statusLine}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: dotColor,
                display: 'inline-block',
                flexShrink: 0,
                ...(connection.connected ? { boxShadow: `0 0 4px ${dotColor}` } : {}),
              }}
            />
            <span style={{ color: connection.connected ? '#d1d5db' : '#6b7280' }}>
              {connection.label}
            </span>
            <span style={styles.statusDivider}>•</span>
          </span>
        );
      })}

      <span style={styles.statusLine}>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: obsStatus.connected ? '#06b6d4' : '#374151',
            display: 'inline-block',
            flexShrink: 0,
            ...(obsStatus.connected ? { boxShadow: '0 0 4px #06b6d4' } : {}),
          }}
        />
        <span style={{ color: obsStatus.connected ? '#d1d5db' : '#6b7280' }}>
          OBS {obsStatus.connected ? 'connected' : 'offline'}
        </span>
        <span style={styles.statusDivider}>•</span>
      </span>

      {obsStatus.connected ? (
        <span style={styles.statusLine}>
          Scene: {obsStatus.sceneName}
          <span style={styles.statusDivider}>•</span>
        </span>
      ) : null}

      <span style={styles.statusLine}>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#7c3aed',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <span style={{ color: '#d1d5db' }}>Profile: {activeProfileName}</span>
      </span>

      <span style={{ ...styles.statusLine, marginLeft: 'auto' }}>
        {obsStatus.uptimeLabel}
      </span>
    </footer>
  );
}
