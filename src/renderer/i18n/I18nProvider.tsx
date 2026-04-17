import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';

import type { AppLanguage } from '../../shared/types.js';
import { messages } from './messages.js';
import type { I18nContextValue } from './types.js';

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  children: ReactNode;
}

export function I18nProvider({ language, setLanguage, children }: I18nProviderProps) {
  const value = useMemo<I18nContextValue>(() => {
    const currentMessages = messages[language] ?? messages['pt-BR'];
    return {
      language,
      setLanguage,
      messages: currentMessages,
      t: (text) => currentMessages.ui[text] ?? text,
    };
  }, [language, setLanguage]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (language !== 'pt-BR') return undefined;

    let isApplying = false;
    const translateNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.parentElement?.closest('[data-no-i18n="true"]')) return;
        const raw = node.textContent ?? '';
        const trimmed = raw.trim();
        const translated = trimmed ? messages['pt-BR'].ui[trimmed] : undefined;
        if (translated) {
          node.textContent = raw.replace(trimmed, translated);
        }
        return;
      }

      if (!(node instanceof HTMLElement) || node.closest('[data-no-i18n="true"]')) return;
      for (const attribute of ['placeholder', 'title', 'aria-label']) {
        const raw = node.getAttribute(attribute);
        if (!raw) continue;
        const translated = messages['pt-BR'].ui[raw.trim()];
        if (translated) node.setAttribute(attribute, translated);
      }
      for (const child of node.childNodes) translateNode(child);
    };

    const applyTranslations = () => {
      if (isApplying || !document.body) return;
      isApplying = true;
      translateNode(document.body);
      isApplying = false;
    };

    applyTranslations();
    const observer = new MutationObserver(() => window.requestAnimationFrame(applyTranslations));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label'],
    });

    return () => observer.disconnect();
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
