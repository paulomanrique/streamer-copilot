import { useCallback, useEffect, useState } from 'react';

import type { ToastItem } from '../components/ToastStack.js';

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (toasts.length === 0) return undefined;

    const timerId = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 4000);

    return () => window.clearTimeout(timerId);
  }, [toasts]);

  const pushToast = useCallback((title: string, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, title, message }]);
  }, []);

  return { toasts, pushToast };
}
