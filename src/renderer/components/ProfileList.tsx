import type { ProfileSummary } from '../../shared/types.js';
import { formatLastUsedLabel } from './SettingsScaffold.js';

interface ProfileListProps {
  profiles: ProfileSummary[];
  activeProfileId: string;
  onSelectProfile: (profileId: string) => void;
}

export function ProfileList({ profiles, activeProfileId, onSelectProfile }: ProfileListProps) {
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
            <tr key={profile.id} className={isActive ? 'border-b border-gray-800 bg-violet-500/5 hover:bg-gray-800/50' : 'border-b border-gray-800 hover:bg-gray-800/50'}>
              <td className="px-4 py-3 text-gray-200 font-semibold">
                <div className="flex items-center gap-2">
                  <span>{profile.name}</span>
                  {isActive ? <span className="text-xs px-2 py-0.5 rounded bg-violet-500/30 text-violet-200">active</span> : null}
                </div>
              </td>
              <td className="px-4 py-3 text-gray-400 font-mono">{profile.directory}</td>
              <td className="px-4 py-3 text-gray-500">{formatLastUsedLabel(profile.lastUsedAt)}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onSelectProfile(profile.id)}
                  className={isActive ? 'px-3 py-1.5 rounded bg-gray-700 text-gray-400 text-sm cursor-default' : 'px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm transition-colors'}
                >
                  {isActive ? 'Using' : 'Use'}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
