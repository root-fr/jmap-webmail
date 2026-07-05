import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThreadListItem } from '@/components/email/thread-list-item';
import type { Email, ThreadGroup } from '@/lib/jmap/types';

const email = {
  id: 'e1',
  threadId: 't1',
  mailboxIds: { 'archive-1': true },
  keywords: {},
  size: 100,
  receivedAt: '2026-07-05T10:00:00Z',
  from: [{ name: 'Alice', email: 'alice@example.com' }],
  subject: 'Quarterly report',
  preview: 'preview text',
  hasAttachment: false,
} as unknown as Email;

const thread: ThreadGroup = {
  threadId: 't1',
  emails: [email],
  latestEmail: email,
  participantNames: ['Alice'],
  hasUnread: false,
  hasStarred: false,
  hasAttachment: false,
  emailCount: 1,
};

const mailboxes = [
  { id: 'inbox-1', name: 'Inbox' },
  { id: 'archive-1', name: 'Archive' },
];

let scope: { kind: 'all' | 'folder'; mailboxId?: string; includeTrashJunk?: boolean } = {
  kind: 'all',
  includeTrashJunk: false,
};

vi.mock('@/stores/email-store', () => ({
  useEmailStore: () => ({
    currentQuery: { scope, sort: { by: 'receivedAt', ascending: false } },
    mailboxes,
  }),
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) => selector({ showPreview: false }),
}));

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (s: unknown) => unknown) => selector({ isMobile: false }),
}));

function renderRow() {
  return render(
    <ThreadListItem
      thread={thread}
      isExpanded={false}
      onToggleExpand={vi.fn()}
      onEmailSelect={vi.fn()}
      isChecked={false}
      onCheckboxClick={vi.fn()}
    />
  );
}

describe('ThreadListItem folder badge', () => {
  it('shows the containing mailbox name when scope is global', () => {
    scope = { kind: 'all', includeTrashJunk: false };
    renderRow();
    expect(screen.getByTestId('folder-badge')).toHaveTextContent('Archive');
  });

  it('hides the badge when scope is a single folder', () => {
    scope = { kind: 'folder', mailboxId: 'inbox-1' };
    renderRow();
    expect(screen.queryByTestId('folder-badge')).toBeNull();
  });
});
