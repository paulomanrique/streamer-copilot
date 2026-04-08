import { SettingsPageShell, SettingsSurface } from './SettingsScaffold.js';
import { styles } from './app-styles.js';

interface PlatformSettingsPreviewProps {
  activeProfileName: string;
}

const PLATFORM_PREVIEW_DATA = [
  {
    id: 'twitch',
    name: 'Twitch',
    accent: { background: 'rgba(147, 51, 234, 0.12)', border: 'rgba(147, 51, 234, 0.2)', color: '#c4b5fd' },
    status: 'Connected',
    details: 'mychannel',
    detailTone: '#4ade80',
    actionLabel: 'Disconnect',
    actionStyle: 'danger' as const,
    note: ['chat:read', 'chat:edit', 'channel:read:subscriptions'],
  },
  {
    id: 'youtube-h',
    name: 'YouTube (Horizontal)',
    accent: { background: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5' },
    status: 'Connected',
    details: 'My Channel • Live ID: dQw4w9WgXcQ',
    detailTone: '#4ade80',
    actionLabel: 'Disconnect',
    actionStyle: 'danger' as const,
    note: 'Polling every 5s · Quota: 847/10000 units today',
  },
  {
    id: 'youtube-v',
    name: 'YouTube (Vertical)',
    accent: { background: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.2)', color: '#fda4af' },
    status: 'Connected',
    details: 'Shorts Live • Live ID: AbC123Shorts',
    detailTone: '#4ade80',
    actionLabel: 'Disconnect',
    actionStyle: 'danger' as const,
    note: 'Polling every 5s · Quota shared with the main YouTube API project',
  },
  {
    id: 'kick',
    name: 'Kick',
    accent: { background: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.2)', color: '#86efac' },
    status: 'Not connected',
    details: 'Public chat read works without authentication',
    detailTone: '#facc15',
    actionLabel: 'Connect',
    actionStyle: 'secondary' as const,
    note: 'Channel slug: mychannel',
  },
  {
    id: 'tiktok',
    name: 'TikTok Live',
    accent: { background: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.2)', color: '#f9a8d4' },
    status: 'Planned',
    details: 'Reserved slot for future live output support',
    detailTone: '#f9a8d4',
    actionLabel: 'Planned',
    actionStyle: 'disabled' as const,
    note: 'UI stays stable before implementation lands',
  },
];

export function PlatformSettingsPreview({ activeProfileName }: PlatformSettingsPreviewProps) {
  return (
    <SettingsPageShell
      title="Platform Connections"
      description="Connect your accounts to receive chat and send messages in real time."
      maxWidth="960px"
    >
      <div style={styles.settingsColumn}>
        {PLATFORM_PREVIEW_DATA.map((platform) => (
          <SettingsSurface key={platform.id} style={styles.platformConnectionCard}>
            <div style={styles.platformConnectionRow}>
              <div
                style={{
                  ...styles.platformConnectionIcon,
                  background: platform.accent.background,
                  borderColor: platform.accent.border,
                  color: platform.accent.color,
                }}
              >
                {platform.name.slice(0, 2).toUpperCase()}
              </div>

              <div style={styles.platformConnectionContent}>
                <div style={styles.platformConnectionHeader}>
                  <div>
                    <h3 style={styles.platformConnectionTitle}>{platform.name}</h3>
                    <p style={{ ...styles.platformConnectionMeta, color: platform.detailTone }}>{platform.details}</p>
                  </div>

                  <span style={styles.selectionPill}>{platform.status}</span>
                </div>

                {Array.isArray(platform.note) ? (
                  <div style={styles.chipRow}>
                    {platform.note.map((item) => (
                      <span key={item} style={styles.settingsTokenChip}>{item}</span>
                    ))}
                  </div>
                ) : (
                  <p style={styles.settingsSecondaryText}>{platform.note}</p>
                )}
              </div>

              <div>
                <button
                  type="button"
                  disabled={platform.actionStyle === 'disabled'}
                  style={
                    platform.actionStyle === 'danger'
                      ? styles.dangerButton
                      : platform.actionStyle === 'disabled'
                        ? styles.disabledButton
                        : styles.secondaryButton
                  }
                >
                  {platform.actionLabel}
                </button>
              </div>
            </div>
          </SettingsSurface>
        ))}

        <p style={styles.settingsSecondaryText}>Profile context: {activeProfileName}</p>
      </div>
    </SettingsPageShell>
  );
}
