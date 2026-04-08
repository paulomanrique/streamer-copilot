import type { PermissionLevel } from '../../shared/types.js';
import { LanguagePicker } from './LanguagePicker.js';
import { PermissionPicker } from './PermissionPicker.js';
import { SettingsSurface } from './SettingsScaffold.js';
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
    <>
      <SettingsSurface>
        <h3 style={styles.settingsSubsectionTitle}>Default Voice Language</h3>
        <p style={styles.settingsSecondaryText}>Used by new TTS commands created inside this profile.</p>
        <LanguagePicker selectedCode={languageCode} onChange={onChangeLanguageCode} />
      </SettingsSurface>

      <SettingsSurface>
        <h3 style={styles.settingsSubsectionTitle}>Default Permission Preset</h3>
        <p style={styles.settingsSecondaryText}>Reusable permission chips for new commands.</p>
        <PermissionPicker selectedLevels={permissionLevels} onChange={onChangePermissionLevels} />
      </SettingsSurface>
    </>
  );
}
