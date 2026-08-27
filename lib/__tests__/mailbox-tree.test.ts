import { describe, it, expect } from 'vitest';
import { getMailboxFullPath, buildMailboxTree } from '../utils';
import { UNIFIED_INBOX_ID } from '../jmap/search-utils';
import type { Mailbox } from '../jmap/types';

const mb = (id: string, name: string, parentId?: string, role?: string): Mailbox => ({
  id,
  name,
  parentId,
  role,
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
});

describe('getMailboxFullPath', () => {
  it('returns the leaf name for a top-level mailbox', () => {
    const inbox = mb('a', 'Inbox', undefined, 'inbox');
    expect(getMailboxFullPath([inbox], 'a')).toBe('Inbox');
  });

  it('walks parentId and joins with the hierarchy delimiter', () => {
    const inbox = mb('a', 'Inbox', undefined, 'inbox');
    const projects = mb('b', 'Projects', 'a');
    const foo = mb('c', 'Foo', 'b');
    expect(getMailboxFullPath([inbox, projects, foo], 'c')).toBe('Inbox/Projects/Foo');
  });

  it('returns the full path regardless of mailbox list order', () => {
    const foo = mb('c', 'Foo', 'b');
    const projects = mb('b', 'Projects', 'a');
    const inbox = mb('a', 'Inbox', undefined, 'inbox');
    expect(getMailboxFullPath([foo, projects, inbox], 'c')).toBe('Inbox/Projects/Foo');
  });

  it('returns empty string for unknown id', () => {
    expect(getMailboxFullPath([mb('a', 'Inbox')], 'missing')).toBe('');
  });

  it('stops at an orphaned parent without infinite-looping', () => {
    const orphan = mb('c', 'Foo', 'gone');
    expect(getMailboxFullPath([orphan], 'c')).toBe('Foo');
  });

  it('does not loop on a self-referential parentId', () => {
    const cyclic = mb('a', 'Loop', 'a');
    expect(getMailboxFullPath([cyclic], 'a')).toBe('Loop');
  });
});

const accountInbox = (
  accountId: string,
  unreadEmails: number,
  overrides: Partial<Mailbox> = {},
): Mailbox => ({
  ...mb(`${accountId}:inbox`, 'Inbox', undefined, 'inbox'),
  accountId,
  accountName: `${accountId}@example.com`,
  unreadEmails,
  totalEmails: unreadEmails,
  ...overrides,
});

describe('buildMailboxTree unified inbox node', () => {
  const primaryInbox = accountInbox('acc-primary', 3, { id: 'inbox-1', isShared: false });
  const teamInbox = accountInbox('acc-team', 5, { isShared: true });
  const supportInbox = accountInbox('acc-support', 2, { isShared: true });

  it('is absent when no unified options are passed', () => {
    const tree = buildMailboxTree([primaryInbox, teamInbox]);
    expect(tree.some((n) => n.id === UNIFIED_INBOX_ID)).toBe(false);
  });

  it('renders first with the given name and aggregated unread count', () => {
    const tree = buildMailboxTree([primaryInbox, teamInbox, supportInbox], {
      name: 'All Inboxes',
      excludedAccountIds: [],
    });
    expect(tree[0].id).toBe(UNIFIED_INBOX_ID);
    expect(tree[0].name).toBe('All Inboxes');
    expect(tree[0].unreadEmails).toBe(10);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children).toEqual([]);
  });

  it('drops excluded accounts from the badge sum', () => {
    const tree = buildMailboxTree([primaryInbox, teamInbox, supportInbox], {
      name: 'All Inboxes',
      excludedAccountIds: ['acc-support'],
    });
    expect(tree[0].id).toBe(UNIFIED_INBOX_ID);
    expect(tree[0].unreadEmails).toBe(8);
  });

  it('hides itself when fewer than two included accounts expose an inbox', () => {
    const single = buildMailboxTree([primaryInbox], {
      name: 'All Inboxes',
      excludedAccountIds: [],
    });
    expect(single.some((n) => n.id === UNIFIED_INBOX_ID)).toBe(false);

    const excludedDown = buildMailboxTree([primaryInbox, teamInbox], {
      name: 'All Inboxes',
      excludedAccountIds: ['acc-team'],
    });
    expect(excludedDown.some((n) => n.id === UNIFIED_INBOX_ID)).toBe(false);
  });

  it('grants read-only rights so rename/drag/drop stay disabled', () => {
    const tree = buildMailboxTree([primaryInbox, teamInbox], {
      name: 'All Inboxes',
      excludedAccountIds: [],
    });
    expect(tree[0].myRights.mayReadItems).toBe(true);
    expect(tree[0].myRights.mayRename).toBe(false);
    expect(tree[0].myRights.mayAddItems).toBe(false);
    expect(tree[0].myRights.mayCreateChild).toBe(false);
    expect(tree[0].myRights.mayDelete).toBe(false);
  });
});
