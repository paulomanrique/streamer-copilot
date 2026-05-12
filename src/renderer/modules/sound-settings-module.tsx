import { SoundCommandsPage } from '../pages/SoundCommands.js';
import { registerRendererModule } from './registry.js';

registerRendererModule({
  id: 'sound',
  group: 'Modules',
  labelKey: 'soundCommands',
  fallbackLabel: 'Sound Commands',
  icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  SettingsPage: SoundCommandsPage,
});
