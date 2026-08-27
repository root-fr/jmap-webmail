import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The global setup mock returns raw keys only; this override also surfaces
// interpolated values so the account-naming assertion is meaningful.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}|${Object.values(values).join(';')}` : key,
  useLocale: () => 'en',
}));

const h = vi.hoisted(() => ({
  client: { id: 'session-client' },
  retryQuery: vi.fn(),
  dismissFailedAccounts: vi.fn(),
  failedAccounts: [] as string[],
  mailboxes: [
    { id: 'inbox-a', role: 'inbox', name: 'Inbox', accountId: 'acc-a', accountName: 'me@example.com' },
    { id: 'acc-b:inbox-b', originalId: 'inbox-b', role: 'inbox', name: 'Inbox', accountId: 'acc-b', accountName: 'support@example.com', isShared: true },
  ],
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ client: h.client }),
}));

vi.mock('@/stores/email-store', () => ({
  useEmailStore: () => ({
    failedAccounts: h.failedAccounts,
    mailboxes: h.mailboxes,
    retryQuery: h.retryQuery,
    dismissFailedAccounts: h.dismissFailedAccounts,
  }),
}));

import { UnifiedFailureNotice } from '@/components/email/unified-failure-notice';

describe('UnifiedFailureNotice', () => {
  beforeEach(() => {
    h.retryQuery.mockClear();
    h.dismissFailedAccounts.mockClear();
    h.failedAccounts = ['acc-b'];
  });

  it('renders nothing while no account has failed', () => {
    h.failedAccounts = [];
    render(<UnifiedFailureNotice />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('names the failed accounts in an alert, falling back to the raw id', () => {
    h.failedAccounts = ['acc-b', 'acc-unknown'];
    render(<UnifiedFailureNotice />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'unified_failure.message|support@example.com, acc-unknown'
    );
  });

  it('retry re-runs the query through the session client', () => {
    render(<UnifiedFailureNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'unified_failure.retry' }));
    expect(h.retryQuery).toHaveBeenCalledTimes(1);
    expect(h.retryQuery).toHaveBeenCalledWith(h.client);
  });

  it('dismiss clears the notice', () => {
    render(<UnifiedFailureNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'unified_failure.dismiss' }));
    expect(h.dismissFailedAccounts).toHaveBeenCalledTimes(1);
    expect(h.retryQuery).not.toHaveBeenCalled();
  });
});
