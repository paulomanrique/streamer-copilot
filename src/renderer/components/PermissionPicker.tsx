import { PERMISSION_LEVELS } from '../../shared/constants.js';
import type { PermissionLevel } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { styles } from './app-styles.js';

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
  const { messages, t } = useI18n();
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
          <p style={styles.helper}>{t('Reusable checkbox-chip group for sound and voice command forms.')}</p>
        </div>
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
              {messages.common.permissionLevel[level]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
