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

const okResult = { emails: [makeEmail()], total: 1, position: 0, hasMore: false };

describe('email-store single EmailQuery descriptor', () => {
  beforeEach(() => {
    useSettingsStore.setState({ emailsPerPage: 50 });
    useEmailStore.setState({
      selectedMailbox: 'inbox',
      mailboxes: [],
      emails: [],
      searchQuery: '',
      searchFilters: { ...DEFAULT_SEARCH_FILTERS },
      searchAbortController: null,
      currentQuery: { scope: { kind: 'folder', mailboxId: '' }, sort: { by: 'receivedAt', ascending: false } },
    });
  });

  it('fetchEmails builds a folder-scoped descriptor with no text/filters', async () => {
    const queryEmails = vi.fn().mockResolvedValue(okResult);
    await useEmailStore.getState().fetchEmails({ queryEmails } as unknown as JMAPClient, 'inbox');

    expect(queryEmails).toHaveBeenCalledTimes(1);
    const [query, page] = queryEmails.mock.calls[0];
    expect(query).toEqual({
      scope: { kind: 'folder', mailboxId: 'inbox' },
      sort: { by: 'receivedAt', ascending: false },
    });
    expect(query.text).toBeUndefined();
    expect(query.filters).toBeUndefined();
    expect(page).toEqual({ limit: 50 });
    expect(useEmailStore.getState().currentQuery.scope).toEqual({ kind: 'folder', mailboxId: 'inbox' });
  });

  it('searchEmails builds a global text descriptor excluding trash/junk by default', async () => {
    const queryEmails = vi.fn().mockResolvedValue(okResult);
    await useEmailStore.getState().searchEmails({ queryEmails } as unknown as JMAPClient, 'invoice');

    const [query] = queryEmails.mock.calls[0];
    expect(query).toEqual({
      text: 'invoice',
      scope: { kind: 'all', includeTrashJunk: false },
      sort: { by: 'receivedAt', ascending: false },
    });
  });

  it('advancedSearch builds a filters descriptor with the global default scope', async () => {
    const queryEmails = vi.fn().mockResolvedValue(okResult);
    useEmailStore.setState({
      searchQuery: 'report',
      searchFilters: { ...DEFAULT_SEARCH_FILTERS, from: 'boss@example.com', isUnread: true },
    });
    await useEmailStore.getState().advancedSearch({ queryEmails } as unknown as JMAPClient);

    const [query] = queryEmails.mock.calls[0];
    expect(query.scope).toEqual({ kind: 'all', includeTrashJunk: false });
    expect(query.text).toBe('report');
    expect(query.filters).toEqual({ ...DEFAULT_SEARCH_FILTERS, from: 'boss@example.com', isUnread: true });
  });

  it('setSort patches sort on the current descriptor and re-runs from the first page', async () => {
    const queryEmails = vi.fn().mockResolvedValue(okResult);
    useEmailStore.setState({
      currentQuery: {
        text: 'invoice',
        scope: { kind: 'all', includeTrashJunk: false },
        sort: { by: 'receivedAt', ascending: false },
      },
    });
    await useEmailStore.getState().setSort(
      { queryEmails } as unknown as JMAPClient,
      { by: 'subject', ascending: true },
    );

    const [query, page] = queryEmails.mock.calls[0];
    expect(query.sort).toEqual({ by: 'subject', ascending: true });
    expect(query.text).toBe('invoice');
    expect(query.scope).toEqual({ kind: 'all', includeTrashJunk: false });
    expect(page).toEqual({ limit: 50 });
    expect(useEmailStore.getState().currentQuery.sort).toEqual({ by: 'subject', ascending: true });
  });
});
