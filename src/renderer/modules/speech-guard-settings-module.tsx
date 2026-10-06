import { SpeechGuardPage } from '../pages/SpeechGuard.js';
import { registerRendererModule } from './registry.js';

registerRendererModule({
  id: 'speech-guard',
  group: 'Modules',
  fallbackLabel: 'Speech Guard',
  icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-14 0M12 18v3" />
    </svg>
  ),
  SettingsPage: SpeechGuardPage,
});
