import { PollsPage } from '../pages/Polls.js';
import { registerRendererModule } from './registry.js';

registerRendererModule({
  id: 'polls',
  group: 'Modules',
  labelKey: 'polls',
  fallbackLabel: 'Polls',
  icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V5m6 14V9m6 10H3" />
    </svg>
  ),
  SettingsPage: PollsPage,
});
