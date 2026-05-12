import { ObsSettingsPage } from '../pages/ObsSettings.js';
import { registerRendererModule } from './registry.js';

registerRendererModule({
  id: 'obs',
  group: 'Integrations',
  // No dedicated i18n key yet — the OBS label used to be a literal in the
  // settings sidebar map.
  fallbackLabel: 'OBS Studio',
  icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" strokeWidth="2" />
    </svg>
  ),
  SettingsPage: ObsSettingsPage,
});
