import type { PermissionLevel, ProfileSummary } from '../../shared/types.js';
import { CommandComponentsPreview } from './CommandComponentsPreview.js';
import { ProfileActions } from './ProfileActions.js';
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
      <p className="text-sm text-gray-400 mb-6">Active profile: {activeProfileName}</p>

      <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-x-auto mb-6">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between gap-3">
          <span className="text-sm text-gray-300 font-medium">Profile Library</span>
          <ProfileActions onCreate={onCreateProfile} onRename={onRenameProfile} onClone={onCloneProfile} onDelete={onDeleteProfile} />
        </div>
        <ProfileList profiles={profiles} activeProfileId={activeProfileId} onSelectProfile={onSelectProfile} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <CommandComponentsPreview
          languageCode={languageCode}
          permissionLevels={permissionLevels}
          onChangeLanguageCode={onChangeLanguageCode}
          onChangePermissionLevels={onChangePermissionLevels}
        />
      </div>
    </div>
  );
}
