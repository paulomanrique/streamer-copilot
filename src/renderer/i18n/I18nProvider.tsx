import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
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

  // Language as of the last commit. Layout effects run inside the commit,
  // before the MutationObserver callbacks it triggers, so a translation pass
  // queued by the pt-BR observer can tell the UI already moved on.
  const languageRef = useRef(language);
  useLayoutEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    if (language !== 'pt-BR') return undefined;

    let isApplying = false;
    let frame: number | null = null;
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
      frame = null;
      // Switching pt-BR → en-US remounts the UI in English; that remount is a
      // DOM mutation the still-connected observer schedules a pass for. Without
      // this guard the pass re-translated the fresh English UI to Portuguese
      // after the observer was already gone, leaving it stuck half-translated.
      if (languageRef.current !== 'pt-BR') return;
      if (isApplying || !document.body) return;
      isApplying = true;
      translateNode(document.body);
      isApplying = false;
    };

    applyTranslations();
    const observer = new MutationObserver(() => {
      if (frame === null) frame = window.requestAnimationFrame(applyTranslations);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label'],
    });

    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
