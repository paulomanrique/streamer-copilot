import { MusicRequestPage } from '../pages/MusicRequest.js';
import { registerRendererModule } from './registry.js';

registerRendererModule({
  id: 'music',
  group: 'Modules',
  labelKey: 'musicRequest',
  fallbackLabel: 'Music Request',
  icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
    </svg>
  ),
  SettingsPage: MusicRequestPage,
});
