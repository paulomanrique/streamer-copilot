import { LiveOutputsPage } from '../pages/LiveOutputs.js';
import { registerRendererModule } from './registry.js';

registerRendererModule({
  id: 'live-outputs',
  group: 'Modules',
  labelKey: 'liveOutputs',
  fallbackLabel: 'Live Outputs',
  icon: (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h10M4 18h7m6-3 3 3m0 0-3 3m3-3h-6" />
    </svg>
  ),
  SettingsPage: LiveOutputsPage,
});

