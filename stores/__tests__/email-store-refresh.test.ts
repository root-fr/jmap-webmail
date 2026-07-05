import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEmailStore } from '../email-store';
import { useSettingsStore } from '../settings-store';
import { DEFAULT_SEARCH_FILTERS } from '@/lib/jmap/search-utils';
import type { JMAPClient } from '@/lib/jmap/client';
import type { Email } from '@/lib/jmap/types';

const makeEmail = (o: Partial<Email> = {}): Email => ({
  id: 'e1',
  threadId: 't1',
  mailboxIds: { inbox: true },
  keywords: {},
  size: 100,
  receivedAt: '2026-07-05T10:00:00Z',
  hasAttachment: false,
  ...o,
});

describe('refreshCurrentMailbox', () => {
  beforeEach(() => {
    useSettingsStore.setState({ emailsPerPage: 50 });
    useEmailStore.setState({
      selectedMailbox: 'inbox',
      mailboxes: [],
      emails: [],
      searchQuery: '',
      searchFilters: { ...DEFAULT_SEARCH_FILTERS },
      newEmailNotification: null,
    });
  });

  it('does not clobber active search results with a plain-mailbox page', async () => {
    const searchResults = [makeEmail({ id: 's1' })];
    const mailboxResults = [makeEmail({ id: 'm1' })];
    const getEmails = vi.fn().mockResolvedValue({ emails: mailboxResults, hasMore: false, total: 1 });
    const searchEmails = vi.fn().mockResolvedValue({ emails: searchResults, hasMore: false, total: 1 });

    useEmailStore.setState({
      emails: [makeEmail({ id: 'old' })],
      searchQuery: 'invoice',
    });

    await useEmailStore.getState().refreshCurrentMailbox(
      { getEmails, searchEmails } as unknown as JMAPClient
    );

    expect(searchEmails).toHaveBeenCalled();
    expect(getEmails).not.toHaveBeenCalled();
    expect(useEmailStore.getState().emails.map((e) => e.id)).toEqual(['s1']);
  });

  it('does not chime when the new first email is older than the previous newest', async () => {
    const prev = makeEmail({ id: 'p1', receivedAt: '2026-07-05T10:00:00Z' });
    const older = makeEmail({ id: 'o1', receivedAt: '2026-07-01T08:00:00Z' });
    const getEmails = vi.fn().mockResolvedValue({ emails: [older], hasMore: false, total: 1 });

    useEmailStore.setState({ emails: [prev] });

    await useEmailStore.getState().refreshCurrentMailbox(
      { getEmails } as unknown as JMAPClient
    );

    expect(useEmailStore.getState().newEmailNotification).toBeNull();
  });
});
