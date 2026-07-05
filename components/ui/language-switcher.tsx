"use client";

import { useLocale } from 'next-intl';
import { locales, type Locale } from '@/i18n/routing';
import { useLocaleStore } from '@/stores/locale-store';
import { Select } from '@/components/settings/settings-section';

const NATIVE_LANGUAGE_LABELS: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  nl: 'Nederlands',
  pl: 'Polski',
  pt: 'Português',
  ru: 'Русский',
  uk: 'Українська',
};

export function LanguageSwitcher({ className }: { className?: string }) {
  const currentLocale = useLocale();
  const setLocale = useLocaleStore((state) => state.setLocale);

  const languages = locales.map((code) => ({
    value: code,
    label: NATIVE_LANGUAGE_LABELS[code],
  }));

  return (
    <div className={className}>
      <Select
        value={currentLocale}
        onChange={setLocale}
        options={languages}
      />
    </div>
  );
}
