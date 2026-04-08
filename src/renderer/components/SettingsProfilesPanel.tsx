import type { PermissionLevel, ProfileSummary } from '../../shared/types.js';
import { CommandComponentsPreview } from './CommandComponentsPreview.js';
import { ProfileActions } from './ProfileActions.js';
import { ProfileList } from './ProfileList.js';
import { SettingsInfoTile, SettingsPageShell } from './SettingsScaffold.js';
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
    <SettingsPageShell
      title="Profiles"
      description="Manage stream setups as isolated profile workspaces."
      action={<button type="button" style={styles.primaryButton} onClick={onCreateProfile}>+ New Profile</button>}
      maxWidth="1160px"
    >
      <div style={styles.settingsColumn}>
        <div style={styles.settingsInfoGrid}>
          <SettingsInfoTile label="Active profile" text={activeProfileName} />
          <SettingsInfoTile label="Profiles" text={`${profiles.length} configured`} />
          <SettingsInfoTile label="Defaults" text="Language and permission presets per profile" />
        </div>

        <div style={styles.settingsSurfaceTable}>
          <div style={styles.settingsSurfaceHeaderRow}>
            <h3 style={styles.settingsSubsectionTitle}>Profile Library</h3>
            <ProfileActions
              onCreate={onCreateProfile}
              onRename={onRenameProfile}
              onClone={onCloneProfile}
              onDelete={onDeleteProfile}
            />
          </div>

          <ProfileList profiles={profiles} activeProfileId={activeProfileId} onSelectProfile={onSelectProfile} />
        </div>

        <div style={styles.settingsTwoColumnGrid}>
          <CommandComponentsPreview
            languageCode={languageCode}
            permissionLevels={permissionLevels}
            onChangeLanguageCode={onChangeLanguageCode}
            onChangePermissionLevels={onChangePermissionLevels}
          />
        </div>
      </div>
    </SettingsPageShell>
  );
}
