import type { PermissionLevel } from '../../shared/types.js';
import { LanguagePicker } from './LanguagePicker.js';
import { PermissionPicker } from './PermissionPicker.js';
import { styles } from './app-styles.js';

interface CommandComponentsPreviewProps {
  languageCode: string;
  permissionLevels: PermissionLevel[];
  onChangeLanguageCode: (code: string) => void;
  onChangePermissionLevels: (levels: PermissionLevel[]) => void;
}

export function CommandComponentsPreview({
  languageCode,
  permissionLevels,
  onChangeLanguageCode,
  onChangePermissionLevels,
}: CommandComponentsPreviewProps) {
  return (
    <section style={styles.settingsGrid}>
      <LanguagePicker selectedCode={languageCode} onChange={onChangeLanguageCode} />
      <PermissionPicker selectedLevels={permissionLevels} onChange={onChangePermissionLevels} />
    </section>
  );
}
