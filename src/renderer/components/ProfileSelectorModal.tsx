import type { ProfileSummary } from '../../shared/types.js';
import { styles } from './app-styles.js';

interface ProfileSelectorModalProps {
  open: boolean;
  profiles: ProfileSummary[];
  selectorProfileId: string;
  skipPromptAgain: boolean;
  onChangeProfileId: (profileId: string) => void;
  onChangeSkipPromptAgain: (checked: boolean) => void;
  onCreateProfile: () => void;
  onConfirm: () => void;
}

export function ProfileSelectorModal({
  open,
  profiles,
  selectorProfileId,
  skipPromptAgain,
  onChangeProfileId,
  onChangeSkipPromptAgain,
  onCreateProfile,
  onConfirm,
}: ProfileSelectorModalProps) {
  if (!open) return null;

  const hasProfiles = profiles.length > 0;

  return (
    <div style={styles.modalOverlay}>
      <section style={styles.modalCard}>
        <div style={styles.settingsColumn}>
          <div>
            <h2 style={styles.modalTitle}>Select Profile</h2>
          </div>

          {hasProfiles ? (
            <label style={styles.label}>
              Profile
              <select
                value={selectorProfileId}
                style={styles.select}
                onChange={(event) => onChangeProfileId(event.target.value)}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p style={styles.message}>No profiles exist yet. Create your first profile to continue.</p>
          )}

          {hasProfiles ? (
            <>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={skipPromptAgain}
                  onChange={(event) => onChangeSkipPromptAgain(event.target.checked)}
                />
                Do not ask me again
              </label>

              <div style={styles.modalActions}>
                <button type="button" style={styles.secondaryButton} onClick={onCreateProfile}>
                  Create profile
                </button>
                <button type="button" style={styles.primaryButton} onClick={onConfirm}>
                  Continue with profile
                </button>
              </div>
            </>
          ) : (
            <div style={styles.modalActions}>
              <button type="button" style={styles.primaryButton} onClick={onCreateProfile}>
                Create first profile
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
