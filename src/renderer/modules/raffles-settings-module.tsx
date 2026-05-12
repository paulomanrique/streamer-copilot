import { RafflesPage } from '../pages/Raffles.js';
import { registerRendererModule } from './registry.js';

registerRendererModule({
  id: 'raffles',
  group: 'Modules',
  labelKey: 'raffles',
  fallbackLabel: 'Raffles',
  icon: (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3l7 4v5c0 5-3 8-7 9-4-1-7-4-7-9V7l7-4z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 11l2 2 4-4" />
    </svg>
  ),
  SettingsPage: RafflesPage,
});
