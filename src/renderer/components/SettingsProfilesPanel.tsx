import type { ProfileSummary } from '../../shared/types.js';
import { ProfileActions } from './ProfileActions.js';
import { ProfileList } from './ProfileList.js';
import { styles } from './app-styles.js';

interface SettingsProfilesPanelProps {
  activeProfileId: string;
  activeProfileName: string;
  profiles: ProfileSummary[];
  onCreateProfile: () => void;
  onRenameProfile: () => void;
  onCloneProfile: () => void;
  onDeleteProfile: () => void;
  onSelectProfile: (profileId: string) => void;
}

export function SettingsProfilesPanel({
  activeProfileId,
  activeProfileName,
  profiles,
  onCreateProfile,
  onRenameProfile,
  onCloneProfile,
  onDeleteProfile,
  onSelectProfile,
}: SettingsProfilesPanelProps) {
  return (
    <section style={styles.block}>
      <h2 style={styles.subtitle}>Geral</h2>

      <div style={styles.settingsSection}>
        <h3 style={styles.sectionTitle}>Perfis</h3>
        <p style={styles.message}>Perfil ativo: {activeProfileName}</p>

        <ProfileActions
          onCreate={onCreateProfile}
          onRename={onRenameProfile}
          onClone={onCloneProfile}
          onDelete={onDeleteProfile}
        />

        <ProfileList profiles={profiles} activeProfileId={activeProfileId} onSelectProfile={onSelectProfile} />
      </div>
    </section>
  );
}
