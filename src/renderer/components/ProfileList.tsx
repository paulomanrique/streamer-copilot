import type { ProfileSummary } from '../../shared/types.js';
import { styles } from './app-styles.js';

interface ProfileListProps {
  profiles: ProfileSummary[];
  activeProfileId: string;
  onSelectProfile: (profileId: string) => void;
}

export function ProfileList({ profiles, activeProfileId, onSelectProfile }: ProfileListProps) {
  return (
    <div style={styles.list}>
      {profiles.map((profile) => (
        <button
          key={profile.id}
          type="button"
          style={profile.id === activeProfileId ? styles.profileButtonActive : styles.profileButton}
          onClick={() => onSelectProfile(profile.id)}
        >
          <span>{profile.name}</span>
          <span style={styles.path}>{profile.directory}</span>
        </button>
      ))}
    </div>
  );
}
