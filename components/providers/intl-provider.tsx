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
  // zustand's persist middleware rehydrates from localStorage asynchronously
  // (even for synchronous storage backends), so on mount `currentLocale` can
  // still read as its pre-hydration `null` default for one tick. Track
  // hydration explicitly instead of trusting `!currentLocale` at mount time —
  // otherwise the effect below fires while hydration is still in flight and
  // permanently overwrites a real saved locale with the server default.
  // `persist` itself is only present in a browser context — during SSR
  // there's no localStorage to hydrate from anyway, so treat that as
  // "already hydrated" (i.e. just use the server-rendered initialLocale).
  const [hasHydrated, setHasHydrated] = useState(() => useLocaleStore.persist?.hasHydrated() ?? true);

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

  useEffect(() => {
    if (!useLocaleStore.persist || useLocaleStore.persist.hasHydrated()) {
      setHasHydrated(true);
      return;
    }
    return useLocaleStore.persist.onFinishHydration(() => setHasHydrated(true));
  }, []);

  // Sync initial locale with store on first mount only, and only once we
  // know for certain (post-hydration) that there really is no saved locale.
  useEffect(() => {
    if (hasHydrated && !currentLocale) {
      setLocale(initialLocale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync initial locale to store once hydration is known
  }, [hasHydrated]);

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
