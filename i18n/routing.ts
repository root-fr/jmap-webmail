import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'de', 'es', 'et', 'fr', 'it', 'ja', 'nl', 'pl', 'pt', 'ru', 'uk'],
  defaultLocale: 'en',
  localePrefix: 'never'
});

export const locales = routing.locales;
export const defaultLocale = routing.defaultLocale;
export type Locale = (typeof locales)[number];
