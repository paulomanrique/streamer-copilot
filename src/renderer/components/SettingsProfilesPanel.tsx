import type { PermissionLevel, ProfileSummary } from '../../shared/types.js';
import { ProfileList } from './ProfileList.js';

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
  profiles,
  onCreateProfile,
  onRenameProfile,
  onCloneProfile,
  onDeleteProfile,
  onSelectProfile,
}: SettingsProfilesPanelProps) {
  return (
    <div id="settings-profiles" className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold">Profiles</h2>
        <button
          type="button"
          onClick={onCreateProfile}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
        >
          + New Profile
        </button>
      </div>
      <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-x-auto">
        <ProfileList
          profiles={profiles}
          activeProfileId={activeProfileId}
          onSelectProfile={onSelectProfile}
          onRenameProfile={onRenameProfile}
          onCloneProfile={onCloneProfile}
          onDeleteProfile={onDeleteProfile}
        />
      </div>
    </div>
  );
}
