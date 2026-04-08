import type { ProfileSummary } from '../../shared/types.js';
import { formatLastUsedLabel } from './SettingsScaffold.js';

interface ProfileListProps {
  profiles: ProfileSummary[];
  activeProfileId: string;
  onSelectProfile: (profileId: string) => void;
  onRenameProfile: () => void;
  onCloneProfile: () => void;
  onDeleteProfile: () => void;
}

export function ProfileList({
  profiles,
  activeProfileId,
  onSelectProfile,
  onRenameProfile,
  onCloneProfile,
  onDeleteProfile,
}: ProfileListProps) {
  return (
    <table className="w-full min-w-[1080px] text-sm">
      <thead>
        <tr className="border-b border-gray-700 bg-gray-800/60">
          <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Profile</th>
          <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Directory</th>
          <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Last used</th>
          <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody>
        {profiles.map((profile) => {
          const isActive = profile.id === activeProfileId;
          return (
            <tr key={profile.id} className="border-b border-gray-800 hover:bg-gray-800/50">
              <td className="px-4 py-3 text-gray-200">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{profile.name}</span>
                  {isActive ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-600/30 text-violet-300">active</span> : null}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-gray-400 font-mono max-w-[420px]">
                <span className="block truncate" title={profile.directory}>{profile.directory}</span>
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">{formatLastUsedLabel(profile.lastUsedAt)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectProfile(profile.id)}
                    className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-violet-600 text-gray-300 hover:text-white transition-colors whitespace-nowrap"
                  >
                    Use
                  </button>
                  <button
                    type="button"
                    onClick={onRenameProfile}
                    className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors whitespace-nowrap"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={onCloneProfile}
                    className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors whitespace-nowrap"
                  >
                    Clone
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteProfile}
                    className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white transition-colors whitespace-nowrap"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
