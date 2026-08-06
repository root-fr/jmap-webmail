"use client";

import { useEffect, useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { useLocaleStore } from '@/stores/locale-store';
import type { Locale } from '@/i18n/routing';
import enMessages from '@/locales/en/common.json';
import deMessages from '@/locales/de/common.json';
import esMessages from '@/locales/es/common.json';
import etMessages from '@/locales/et/common.json';
import frMessages from '@/locales/fr/common.json';
import itMessages from '@/locales/it/common.json';
import jaMessages from '@/locales/ja/common.json';
import nlMessages from '@/locales/nl/common.json';
import plMessages from '@/locales/pl/common.json';
import ptMessages from '@/locales/pt/common.json';
import ruMessages from '@/locales/ru/common.json';
import ukMessages from '@/locales/uk/common.json';

// Pre-loaded translations (loaded at build time, not runtime)
const ALL_MESSAGES: Record<Locale, typeof enMessages> = {
  en: enMessages,
  de: deMessages,
  es: esMessages,
  et: etMessages,
  fr: frMessages,
  it: itMessages,
  ja: jaMessages,
  nl: nlMessages,
  pl: plMessages,
  pt: ptMessages,
  ru: ruMessages,
  uk: ukMessages,
};

interface IntlProviderProps {
  locale: string;
  messages: Record<string, unknown>;
  children: React.ReactNode;
}

export function IntlProvider({ locale: initialLocale, children }: IntlProviderProps) {
  const currentLocale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const [activeLocale, setActiveLocale] = useState(currentLocale || initialLocale);
  const [timeZone, setTimeZone] = useState<string>('UTC');

  // Detect user's timezone on mount
  useEffect(() => {
    try {
      const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimeZone(detectedTimeZone);
    } catch {
      // Fallback to UTC if detection fails
      setTimeZone('UTC');
    }
  }, []);

  // Sync initial locale with store on first mount only
  useEffect(() => {
    if (!currentLocale) {
      setLocale(initialLocale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync initial locale to store once on mount
  }, []);

  // Switch locale immediately when store changes
  useEffect(() => {
    if (currentLocale) {
      setActiveLocale(currentLocale);
    }
  }, [currentLocale]);

  const messages =
    ALL_MESSAGES[activeLocale as Locale] ?? ALL_MESSAGES.en;

  return (
    <NextIntlClientProvider
      locale={activeLocale}
      messages={messages}
      timeZone={timeZone}
    >
      {children}
    </NextIntlClientProvider>
  );
}
