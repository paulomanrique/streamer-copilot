import type { PermissionLevel } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
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
  const { t } = useI18n();
  return (
    <>
      <SettingsSurface>
        <h3 style={styles.settingsSubsectionTitle}>{t('Default Voice Language')}</h3>
        <p style={styles.settingsSecondaryText}>{t('Used by new TTS commands created inside this profile.')}</p>
        <LanguagePicker selectedCode={languageCode} onChange={onChangeLanguageCode} />
      </SettingsSurface>

      <SettingsSurface>
        <h3 style={styles.settingsSubsectionTitle}>{t('Default Permission Preset')}</h3>
        <p style={styles.settingsSecondaryText}>{t('Reusable permission chips for new commands.')}</p>
        <PermissionPicker selectedLevels={permissionLevels} onChange={onChangePermissionLevels} />
      </SettingsSurface>
    </>
  );
}
