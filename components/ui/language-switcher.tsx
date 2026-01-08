"use client";

import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useLocaleStore } from '@/stores/locale-store';

export function LanguageSwitcher({ className }: { className?: string }) {
  const currentLocale = useLocale();
  const t = useTranslations('language');
  const setLocale = useLocaleStore((state) => state.setLocale);

  const handleLanguageChange = (newLocale: string) => {
    if (newLocale === currentLocale) return;

    // Update locale in store (persisted to localStorage via Zustand)
    // IntlProvider handles the translation switch
    setLocale(newLocale);
  };

  const languages = [
    { value: 'en', label: 'English' },
    { value: 'fr', label: 'Français' }
  ];

  return (
    <div
      className={cn("flex gap-2", className)}
      role="radiogroup"
      aria-label={t('select_language')}
    >
      {languages.map((lang) => (
        <button
          key={lang.value}
          type="button"
          role="radio"
          aria-checked={currentLocale === lang.value}
          aria-label={t(lang.value === 'en' ? 'switch_to_english' : 'switch_to_french')}
          onClick={() => handleLanguageChange(lang.value)}
          className={cn(
            "px-3 py-1.5 text-xs rounded transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            currentLocale === lang.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover:bg-accent text-foreground"
          )}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
