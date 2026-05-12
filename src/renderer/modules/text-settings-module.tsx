import { TextCommandsPage } from '../pages/TextCommands.js';
import { registerRendererModule } from './registry.js';

registerRendererModule({
  id: 'text',
  group: 'Modules',
  labelKey: 'textCommands',
  fallbackLabel: 'Text Commands',
  icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h8m-8 4h6M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
    </svg>
  ),
  SettingsPage: TextCommandsPage,
});
