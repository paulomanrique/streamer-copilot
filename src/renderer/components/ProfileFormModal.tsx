import { useEffect, useState } from 'react';
import { APP_LANGUAGE_OPTIONS } from '../../shared/constants.js';
import type { AppLanguage } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';

type ProfileFormMode = 'create' | 'rename' | 'clone';

interface ProfileFormModalProps {
  open: boolean;
  mode: ProfileFormMode;
  initialName?: string;
  requireDirectory: boolean;
  selectedDirectory: string;
  selectedLanguage: AppLanguage;
  onChangeSelectedDirectory: (directory: string) => void;
  onChangeSelectedLanguage: (language: AppLanguage) => void;
  onPickDirectory: () => Promise<void>;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export function ProfileFormModal({
  open,
  mode,
  initialName = '',
  requireDirectory,
  selectedDirectory,
  selectedLanguage,
  onChangeSelectedDirectory,
  onChangeSelectedLanguage,
  onPickDirectory,
  onClose,
  onSubmit,
}: ProfileFormModalProps) {
  const { messages } = useI18n();
  const [name, setName] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setIsSubmitting(false);
  }, [open, initialName, mode]);

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && (!requireDirectory || selectedDirectory.trim().length > 0);
  const titles: Record<ProfileFormMode, string> = {
    create: messages.profile.createTitle,
    rename: messages.profile.renameTitle,
    clone: messages.profile.cloneTitle,
  };
  const submitLabels: Record<ProfileFormMode, string> = {
    create: messages.profile.createProfile,
    rename: messages.profile.saveName,
    clone: messages.profile.cloneProfile,
  };

  const submit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSubmit(name.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-xl shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-700">
          <h3 className="font-semibold">{titles[mode]}</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{messages.profile.name}</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
              autoFocus
            />
          </div>

          {requireDirectory ? (
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">{messages.profile.directory}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={selectedDirectory}
                  readOnly
                  onChange={(event) => onChangeSelectedDirectory(event.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                />
                <button type="button" onClick={() => void onPickDirectory()} className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
                  {messages.common.choose}
                </button>
              </div>
            </div>
          ) : null}

          {mode === 'create' ? (
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">{messages.profile.appLanguage}</label>
              <select
                value={selectedLanguage}
                onChange={(event) => onChangeSelectedLanguage(event.target.value as AppLanguage)}
                className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
              >
                {APP_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {messages.common.appLanguageName[option.code]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-700">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
            {messages.common.cancel}
          </button>
          <button
            type="button"
            disabled={!canSubmit || isSubmitting}
            onClick={() => void submit()}
            className="px-3 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {submitLabels[mode]}
          </button>
        </div>
      </div>
    </div>
  );
}
