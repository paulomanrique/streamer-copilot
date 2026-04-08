import { PERMISSION_LEVELS } from '../../shared/constants.js';
import type { PermissionLevel } from '../../shared/types.js';
import { styles } from './app-styles.js';

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  everyone: 'Everyone',
  follower: 'Followers',
  subscriber: 'Subscribers',
  moderator: 'Moderators',
  broadcaster: 'Broadcaster',
};

interface PermissionPickerProps {
  label?: string;
  selectedLevels: PermissionLevel[];
  onChange: (levels: PermissionLevel[]) => void;
}

export function PermissionPicker({
  label = 'Permissions',
  selectedLevels,
  onChange,
}: PermissionPickerProps) {
  const toggleLevel = (level: PermissionLevel) => {
    if (selectedLevels.includes(level)) {
      const nextLevels = selectedLevels.filter((item) => item !== level);
      onChange(nextLevels.length > 0 ? nextLevels : ['everyone']);
      return;
    }

    onChange([...selectedLevels, level]);
  };

  return (
    <section style={styles.previewCard}>
      <div style={styles.previewHeader}>
        <div>
          <h3 style={styles.sectionTitle}>{label}</h3>
          <p style={styles.helper}>Reusable checkbox-chip group for sound and voice command forms.</p>
        </div>
        <span style={styles.selectionPill}>{selectedLevels.length} selected</span>
      </div>

      <div style={styles.pickerSurface}>
        <div style={styles.chipRow}>
          {PERMISSION_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              style={selectedLevels.includes(level) ? styles.chipActive : styles.chip}
              onClick={() => toggleLevel(level)}
            >
              {PERMISSION_LABELS[level]}
            </button>
          ))}
        </div>
        <p style={styles.helper}>Selected values: {selectedLevels.join(', ')}</p>
      </div>
    </section>
  );
}
