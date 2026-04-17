import { useI18n } from '../i18n/I18nProvider.js';

interface ProfileActionsProps {
  onCreate: () => void;
  onRename: () => void;
  onClone: () => void;
  onDelete: () => void;
}

export function ProfileActions({ onCreate, onRename, onClone, onDelete }: ProfileActionsProps) {
  const { messages, t } = useI18n();
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onCreate} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
        {t('New')}
      </button>
      <button type="button" onClick={onRename} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
        {messages.common.rename}
      </button>
      <button type="button" onClick={onClone} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
        {messages.common.clone}
      </button>
      <button type="button" onClick={onDelete} className="px-3 py-1.5 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm transition-colors">
        {messages.common.delete}
      </button>
    </div>
  );
}
