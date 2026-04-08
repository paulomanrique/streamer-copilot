import type { ProfileSummary } from '../../shared/types.js';
import { formatLastUsedLabel } from './SettingsScaffold.js';
import { styles } from './app-styles.js';

interface ProfileListProps {
  profiles: ProfileSummary[];
  activeProfileId: string;
  onSelectProfile: (profileId: string) => void;
}

export function ProfileList({ profiles, activeProfileId, onSelectProfile }: ProfileListProps) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.tableHeadCell}>Profile</th>
            <th style={styles.tableHeadCell}>Directory</th>
            <th style={styles.tableHeadCell}>Last used</th>
            <th style={styles.tableHeadCell}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => {
            const isActive = profile.id === activeProfileId;
            return (
              <tr key={profile.id} style={isActive ? styles.tableRowActive : undefined}>
                <td style={styles.tableCell}>
                  <div style={styles.profileCell}>
                    <strong style={styles.profileName}>{profile.name}</strong>
                    {isActive ? <span style={styles.profileStatusBadge}>Active</span> : null}
                  </div>
                </td>
                <td style={{ ...styles.tableCell, ...styles.path }}>{profile.directory}</td>
                <td style={styles.tableCell}>{formatLastUsedLabel(profile.lastUsedAt)}</td>
                <td style={styles.tableCell}>
                  <button
                    type="button"
                    style={isActive ? styles.secondaryButton : styles.primaryGhostButton}
                    onClick={() => onSelectProfile(profile.id)}
                  >
                    {isActive ? 'In use' : 'Use'}
                  </button>
                </td>
              </tr>
            );
          })}
          {profiles.length === 0 ? (
            <tr>
              <td style={styles.tableCell} colSpan={4}>
                No profiles exist yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
