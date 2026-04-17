import { useI18n } from '../i18n/I18nProvider.js';

interface StatusMessagesProps {
  isLoading: boolean;
  error: string | null;
}

export function StatusMessages({ isLoading, error }: StatusMessagesProps) {
  const { messages } = useI18n();
  return (
    <>
      {isLoading ? <p className="mt-2 px-4 text-sm text-gray-400">{messages.common.loading}</p> : null}
      {error ? <p className="mt-3 px-4 text-sm text-red-300">{error}</p> : null}
    </>
  );
}
