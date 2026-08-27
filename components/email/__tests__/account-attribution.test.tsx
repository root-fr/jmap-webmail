import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Email, ThreadGroup } from '@/lib/jmap/types';

// Shared, hoisted fixtures (available inside vi.mock factories)
const h = vi.hoisted(() => {
  const mailbox = (over: Record<string, unknown>) => ({
    name: 'Inbox',
    sortOrder: 0,
    totalEmails: 0,
    unreadEmails: 0,
    totalThreads: 0,
    unreadThreads: 0,
    myRights: {
      mayReadItems: true,
      mayAddItems: true,
      mayRemoveItems: true,
      maySetSeen: true,
      maySetKeywords: true,
      mayCreateChild: true,
      mayRename: true,
      mayDelete: true,
      maySubmit: true,
    },
    isSubscribed: true,
    ...over,
  });
  return {
    mailboxes: [
      mailbox({ id: 'mb-inbox', role: 'inbox' }),
      mailbox({
        id: 'acct2:inbox2',
        accountId: 'acct2',
        accountName: 'support@root.cloud',
        isShared: true,
      }),
    ],
    currentQuery: {
      scope: { kind: 'unified' },
      sort: { by: 'receivedAt', ascending: false },
    },
  };
});

vi.mock('@/stores/email-store', () => ({
  useEmailStore: () => ({ currentQuery: h.currentQuery, mailboxes: h.mailboxes }),
}));
vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ showPreview: false, domainFaviconAvatars: false }),
}));
vi.mock('@/stores/ui-store', () => ({
  useUIStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ isMobile: false }),
}));

import { ThreadListItem } from '@/components/email/thread-list-item';
import { AccountContextLine } from '@/components/email/account-context-line';

const email = (over: Partial<Email>): Email => ({
  id: 'e1',
  threadId: 't1',
  mailboxIds: { 'mb-inbox': true },
  keywords: { $seen: true },
  size: 100,
  receivedAt: '2026-07-06T10:00:00Z',
  from: [{ name: 'Alice', email: 'alice@example.com' }],
  subject: 'Hello',
  hasAttachment: false,
  ...over,
});

const threadOf = (e: Email): ThreadGroup => ({
  threadId: e.threadId,
  emails: [e],
  latestEmail: e,
  participantNames: ['Alice'],
  hasUnread: false,
  hasStarred: false,
  hasAttachment: false,
  emailCount: 1,
});

const renderRow = (thread: ThreadGroup) =>
  render(
    <ThreadListItem
      thread={thread}
      isExpanded={false}
      onToggleExpand={() => {}}
      onEmailSelect={() => {}}
      isChecked={false}
      onCheckboxClick={() => {}}
    />
  );

describe('account chip on list rows', () => {
  it('shows the resolved account name on non-primary rows', () => {
    renderRow(
      threadOf(
        email({
          id: 'e2',
          threadId: 't2',
          accountId: 'acct2',
          mailboxIds: { 'acct2:inbox2': true },
        })
      )
    );
    expect(screen.getByTestId('account-chip')).toHaveTextContent('support@root.cloud');
  });

  it('renders no chip for primary-account rows', () => {
    renderRow(threadOf(email({})));
    expect(screen.queryByTestId('account-chip')).toBeNull();
  });

  it('falls back to the raw account id when no mailbox carries a name', () => {
    renderRow(
      threadOf(
        email({ id: 'e3', threadId: 't3', accountId: 'ghost', mailboxIds: { x: true } })
      )
    );
    expect(screen.getByTestId('account-chip')).toHaveTextContent('ghost');
  });

  it('shows the chip on multi-message thread headers too', () => {
    const a = email({
      id: 'e4',
      threadId: 't4',
      accountId: 'acct2',
      mailboxIds: { 'acct2:inbox2': true },
    });
    const b = email({
      id: 'e5',
      threadId: 't4',
      accountId: 'acct2',
      mailboxIds: { 'acct2:inbox2': true },
    });
    renderRow({ ...threadOf(a), emails: [a, b], emailCount: 2 });
    expect(screen.getByTestId('account-chip')).toHaveTextContent('support@root.cloud');
  });
});

describe('viewer account context line', () => {
  it("renders 'account · folder' for a non-primary email", () => {
    render(
      <AccountContextLine
        email={email({ accountId: 'acct2', mailboxIds: { 'acct2:inbox2': true } })}
      />
    );
    expect(screen.getByTestId('account-context-line')).toHaveTextContent(
      'support@root.cloud · Inbox'
    );
  });

  it('renders nothing for primary emails', () => {
    render(<AccountContextLine email={email({})} />);
    expect(screen.queryByTestId('account-context-line')).toBeNull();
  });
});
