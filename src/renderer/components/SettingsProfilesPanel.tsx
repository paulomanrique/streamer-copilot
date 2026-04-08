import type { ProfileSummary } from '../../shared/types.js';
import type { PermissionLevel } from '../../shared/types.js';
import { CommandComponentsPreview } from './CommandComponentsPreview.js';
import { PlatformSettingsPreview } from './PlatformSettingsPreview.js';
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
  languageCode: string;
  permissionLevels: PermissionLevel[];
  onChangeLanguageCode: (code: string) => void;
  onChangePermissionLevels: (levels: PermissionLevel[]) => void;
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
  languageCode,
  permissionLevels,
  onChangeLanguageCode,
  onChangePermissionLevels,
}: SettingsProfilesPanelProps) {
  return (
    <section style={styles.block}>
      <h2 style={styles.subtitle}>General</h2>

      <div style={styles.settingsSection}>
        <h3 style={styles.sectionTitle}>Profiles</h3>
        <p style={styles.message}>Active profile: {activeProfileName}</p>

        <ProfileActions
          onCreate={onCreateProfile}
          onRename={onRenameProfile}
          onClone={onCloneProfile}
          onDelete={onDeleteProfile}
        />

        <ProfileList profiles={profiles} activeProfileId={activeProfileId} onSelectProfile={onSelectProfile} />
      </div>

      <CommandComponentsPreview
        languageCode={languageCode}
        permissionLevels={permissionLevels}
        onChangeLanguageCode={onChangeLanguageCode}
        onChangePermissionLevels={onChangePermissionLevels}
      />

      <PlatformSettingsPreview activeProfileName={activeProfileName} />
    </section>
  );
}
