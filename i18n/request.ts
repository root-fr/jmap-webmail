import { getRequestConfig } from 'next-intl/server';

export const locales = ['en', 'fr'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export default getRequestConfig(async ({ requestLocale }) => {
  // Get the locale from the request or use default
  let locale = await requestLocale || defaultLocale;

  // Validate that the incoming `locale` parameter is valid
  if (!(locales as readonly string[]).includes(locale)) {
    locale = defaultLocale;
  }

  // Use static imports for better compatibility
  const messages = locale === 'fr'
    ? (await import('../locales/fr/common.json')).default
    : (await import('../locales/en/common.json')).default;

  return {
    locale,
    messages,
    timeZone: 'Europe/Paris',
    now: new Date()
  };
});