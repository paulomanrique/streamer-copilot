import type { ProfileSummary } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';

interface ProfileSelectorModalProps {
  open: boolean;
  profiles: ProfileSummary[];
  selectorProfileId: string;
  /** Whether the "don't ask me again" checkbox is currently checked. */
  rememberSelection: boolean;
  onChangeProfileId: (profileId: string) => void;
  onChangeRememberSelection: (value: boolean) => void;
  onCreateProfile: () => void;
  onConfirm: () => void;
}

export function ProfileSelectorModal({
  open,
  profiles,
  selectorProfileId,
  rememberSelection,
  onChangeProfileId,
  onChangeRememberSelection,
  onCreateProfile,
  onConfirm,
}: ProfileSelectorModalProps) {
  const { messages } = useI18n();
  if (!open) return null;

  const hasProfiles = profiles.length > 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-xl shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-700">
          <h3 className="font-semibold">{messages.profile.selectProfile}</h3>
        </div>
        <div className="p-5 space-y-4">
          {hasProfiles ? (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">{messages.profile.profiles}</label>
                <select
                  value={selectorProfileId}
                  onChange={(event) => onChangeProfileId(event.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                >
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} · {messages.common.appLanguageName[profile.appLanguage]}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberSelection}
                  onChange={(event) => onChangeRememberSelection(event.target.checked)}
                  className="mt-0.5 accent-violet-600"
                />
                <span>{messages.profile.dontAskAgain}</span>
              </label>
            </>
          ) : (
            <p className="text-sm text-gray-400">{messages.profile.noProfiles}</p>
          )}

        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-700">
          {hasProfiles ? (
            <button type="button" onClick={onCreateProfile} className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
              {messages.profile.createProfile}
            </button>
          ) : null}
          <button
            type="button"
            onClick={hasProfiles ? onConfirm : onCreateProfile}
            className="px-3 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
          >
            {hasProfiles ? messages.profile.continueWithProfile : messages.profile.createFirstProfile}
          </button>
        </div>
      </div>
    </div>
  );
}
