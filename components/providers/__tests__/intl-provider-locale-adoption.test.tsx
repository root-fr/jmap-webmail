import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Restore the real next-intl in this file; vitest.setup.ts globally mocks it
// (useLocale -> 'en', no NextIntlClientProvider export), which would make this
// behavior test impossible to satisfy.
vi.mock('next-intl', async () =>
  await vi.importActual<typeof import('next-intl')>('next-intl')
);

import { useLocale } from 'next-intl';
import { IntlProvider } from '../intl-provider';
import { useLocaleStore } from '@/stores/locale-store';

function LocaleProbe() {
  return <span data-testid="active-locale">{useLocale()}</span>;
}

describe('IntlProvider first-visit locale adoption', () => {
  it('adopts the server-detected locale when nothing is persisted', async () => {
    localStorage.clear();

    render(
      <IntlProvider locale="fr" messages={{}}>
        <LocaleProbe />
      </IntlProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-locale').textContent).toBe('fr');
    });
    expect(useLocaleStore.getState().locale).toBe('fr');
  });
});
