"use client";

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { locales } from '@/i18n/request';

export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const t = useTranslations('language');
  const currentLocale = params.locale as string;

  const handleLanguageChange = (newLocale: string) => {
    // Get the path without the locale prefix
    const pathWithoutLocale = pathname.replace(`/${currentLocale}`, '');

    // Navigate to the same page with the new locale
    router.push(`/${newLocale}${pathWithoutLocale}`);
  };

  return (
    <div className={cn("flex items-center gap-1 p-1 bg-muted rounded-lg", className)}>
      {locales.map((locale) => (
        <button
          key={locale}
          onClick={() => handleLanguageChange(locale)}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded transition-all text-xs",
            "text-foreground",
            currentLocale === locale
              ? "bg-background shadow-sm font-medium"
              : "hover:bg-accent/50"
          )}
          title={t(locale === 'en' ? 'english' : 'french')}
        >
          {locale === 'en' ? '🇬🇧' : '🇫🇷'}
          <span className="hidden sm:inline">
            {locale.toUpperCase()}
          </span>
        </button>
      ))}
    </div>
  );
}