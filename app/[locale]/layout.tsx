import { notFound } from "next/navigation";
import { IntlProvider } from "@/components/providers/intl-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CalendarAlertProvider } from "@/components/providers/calendar-alert-provider";
import { SonnerToaster } from "@/components/ui/sonner-toaster";
import { locales } from "@/i18n/routing";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!(locales as readonly string[]).includes(locale)) notFound();

  let messages;
  try {
    messages = (await import(`@/locales/${locale}/common.json`)).default;
  } catch {
    notFound();
  }

  return (
    <IntlProvider locale={locale} messages={messages}>
      <ThemeProvider>
        <CalendarAlertProvider>
          {children}
          <SonnerToaster />
        </CalendarAlertProvider>
      </ThemeProvider>
    </IntlProvider>
  );
}
