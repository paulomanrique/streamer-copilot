import { styles } from './app-styles.js';

interface PlatformSettingsPreviewProps {
  activeProfileName: string;
}

const PLATFORM_PREVIEW_DATA = [
  {
    id: 'twitch',
    name: 'Twitch',
    status: 'Connected',
    credential: 'oauth:************************',
    actionLabel: 'Reconnect OAuth',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    status: 'Connected',
    credential: 'Google account linked',
    actionLabel: 'Reconnect Google',
  },
  {
    id: 'kick',
    name: 'Kick',
    status: 'Configured',
    credential: 'channel: mychannel',
    actionLabel: 'Update Channel',
  },
];

export function PlatformSettingsPreview({ activeProfileName }: PlatformSettingsPreviewProps) {
  return (
    <section style={styles.previewCard}>
      <div style={styles.previewHeader}>
        <div>
          <h3 style={styles.sectionTitle}>Platform Connections</h3>
          <p style={styles.helper}>Settings-page shell for connect, reconnect, and masked credential state.</p>
        </div>
        <span style={styles.selectionPill}>{activeProfileName}</span>
      </div>

      <div style={styles.settingsGrid}>
        {PLATFORM_PREVIEW_DATA.map((platform) => (
          <article key={platform.id} style={styles.platformCard}>
            <div style={styles.platformHeader}>
              <strong>{platform.name}</strong>
              <span style={styles.selectionPill}>{platform.status}</span>
            </div>
            <input type="text" value={platform.credential} readOnly style={styles.tokenField} />
            <div style={styles.buttonRow}>
              <button type="button" style={styles.secondaryButton}>
                {platform.actionLabel}
              </button>
              <button type="button" style={styles.dangerButton}>
                Disconnect
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
