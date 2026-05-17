import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import en from './en.json';
import id from './id.json';

type Language = 'en' | 'id';
type Translations = typeof en;

const translations: Record<Language, Translations> = { en, id };

interface I18nContextType {
  language: Language;
  t: (key: string) => string;
  setLanguage: (lang: Language) => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

function getLanguageFromStorage(): Language {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('language');
    if (stored === 'en' || stored === 'id') return stored;
  }
  return 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getLanguageFromStorage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  }, []);

  const t = useCallback((key: string): string => {
    return translations[language][key as keyof Translations] || key;
  }, [language]);

  return (
    <I18nContext.Provider value={{ language, t, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within LanguageProvider');
  }
  return context;
}