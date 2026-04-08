import type { ProfileSummary } from '../../shared/types.js';
import { styles } from './app-styles.js';

interface ProfileSelectorModalProps {
  open: boolean;
  profiles: ProfileSummary[];
  selectorProfileId: string;
  skipPromptAgain: boolean;
  onChangeProfileId: (profileId: string) => void;
  onChangeSkipPromptAgain: (checked: boolean) => void;
  onConfirm: () => void;
}

export function ProfileSelectorModal({
  open,
  profiles,
  selectorProfileId,
  skipPromptAgain,
  onChangeProfileId,
  onChangeSkipPromptAgain,
  onConfirm,
}: ProfileSelectorModalProps) {
  if (!open) return null;

  return (
    <div style={styles.modalOverlay}>
      <section style={styles.modalCard}>
        <h2 style={styles.modalTitle}>Selecionar Perfil</h2>

        <label style={styles.label}>
          Perfil
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

        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={skipPromptAgain}
            onChange={(event) => onChangeSkipPromptAgain(event.target.checked)}
          />
          Não me pergunte novamente
        </label>

        <div style={styles.modalActions}>
          <button type="button" style={styles.primaryButton} onClick={onConfirm}>
            Entrar com perfil
          </button>
        </div>
      </section>
    </div>
  );
}
