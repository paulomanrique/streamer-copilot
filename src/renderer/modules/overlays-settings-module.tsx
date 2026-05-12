import { OverlaysPage } from '../pages/Overlays.js';
import { registerRendererModule } from './registry.js';

registerRendererModule({
  id: 'overlays',
  group: 'Integrations',
  // No dedicated i18n key yet — the previous SETTINGS_GROUPS entry fell
  // back to the literal label "Overlays" too.
  fallbackLabel: 'Overlays',
  icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="14" rx="2" strokeWidth="2" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 21h8M12 17v4" />
    </svg>
  ),
  SettingsPage: OverlaysPage,
});
