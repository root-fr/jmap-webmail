import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEmailStore } from '../email-store';
import { useSettingsStore } from '../settings-store';
import type { EmailQuery } from '@/lib/jmap/search-utils';
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

const folderQuery = (mailboxId: string): EmailQuery => ({
  scope: { kind: 'folder', mailboxId },
  sort: { by: 'receivedAt', ascending: false },
});

const searchQuery = (text: string): EmailQuery => ({
  text,
  scope: { kind: 'all', includeTrashJunk: false },
  sort: { by: 'receivedAt', ascending: false },
});

describe('refreshCurrentMailbox', () => {
  beforeEach(() => {
    useSettingsStore.setState({ emailsPerPage: 50 });
    useEmailStore.setState({
      selectedMailbox: 'inbox',
      mailboxes: [],
      emails: [],
      currentQuery: folderQuery('inbox'),
      newEmailNotification: null,
    });
  });

  it('re-runs the active search descriptor and keeps search results (no folder clobber)', async () => {
    const searchResults = [makeEmail({ id: 's1' }), makeEmail({ id: 's2' })];
    const queryEmails = vi
      .fn()
      .mockResolvedValue({ emails: searchResults, total: 2, position: 0, hasMore: false });

    useEmailStore.setState({
      emails: [makeEmail({ id: 'old1' }), makeEmail({ id: 'old2' })],
      currentQuery: searchQuery('invoice'),
    });

    await useEmailStore
      .getState()
      .refreshCurrentMailbox({ queryEmails } as unknown as JMAPClient);

    expect(queryEmails).toHaveBeenCalledTimes(1);
    const [query] = queryEmails.mock.calls[0];
    expect(query).toEqual(searchQuery('invoice'));
    expect(useEmailStore.getState().emails.map((e) => e.id)).toEqual(['s1', 's2']);
  });

  it('bounds the refresh limit to the currently loaded window', async () => {
    const loaded = Array.from({ length: 120 }, (_, i) => makeEmail({ id: `e${i}` }));
    const queryEmails = vi
      .fn()
      .mockResolvedValue({ emails: loaded, total: 120, position: 0, hasMore: true });

    useEmailStore.setState({ emails: loaded, currentQuery: folderQuery('inbox') });

    await useEmailStore
      .getState()
      .refreshCurrentMailbox({ queryEmails } as unknown as JMAPClient);

    // max(loaded=120, emailsPerPage=50) === 120, first page (no anchor)
    expect(queryEmails.mock.calls[0][1]).toEqual({ limit: 120 });
  });

  it('does not chime mid-search even when the top result is newer', async () => {
    const newer = makeEmail({ id: 'n1', receivedAt: '2026-08-01T00:00:00Z' });
    const queryEmails = vi
      .fn()
      .mockResolvedValue({ emails: [newer], total: 1, position: 0, hasMore: false });

    useEmailStore.setState({
      emails: [makeEmail({ id: 'old', receivedAt: '2026-07-01T00:00:00Z' })],
      currentQuery: searchQuery('invoice'),
    });

    await useEmailStore
      .getState()
      .refreshCurrentMailbox({ queryEmails } as unknown as JMAPClient);

    expect(useEmailStore.getState().newEmailNotification).toBeNull();
  });

  it('chimes for a plain folder browse when genuinely newer mail arrives', async () => {
    const newer = makeEmail({ id: 'n1', receivedAt: '2026-08-01T00:00:00Z' });
    const queryEmails = vi
      .fn()
      .mockResolvedValue({ emails: [newer], total: 1, position: 0, hasMore: false });

    useEmailStore.setState({
      emails: [makeEmail({ id: 'old', receivedAt: '2026-07-01T00:00:00Z' })],
      currentQuery: folderQuery('inbox'),
    });

    await useEmailStore
      .getState()
      .refreshCurrentMailbox({ queryEmails } as unknown as JMAPClient);

    expect(useEmailStore.getState().newEmailNotification?.id).toBe('n1');
  });

  it('does not chime when the new first email is older than the previous newest', async () => {
    const prev = makeEmail({ id: 'p1', receivedAt: '2026-07-05T10:00:00Z' });
    const older = makeEmail({ id: 'o1', receivedAt: '2026-07-01T08:00:00Z' });
    const queryEmails = vi
      .fn()
      .mockResolvedValue({ emails: [older], total: 1, position: 0, hasMore: false });

    useEmailStore.setState({ emails: [prev], currentQuery: folderQuery('inbox') });

    await useEmailStore
      .getState()
      .refreshCurrentMailbox({ queryEmails } as unknown as JMAPClient);

    expect(useEmailStore.getState().newEmailNotification).toBeNull();
  });

  it('keeps the previous list when the refresh query throws', async () => {
    const prev = [makeEmail({ id: 'keep1' }), makeEmail({ id: 'keep2' })];
    const queryEmails = vi.fn().mockRejectedValue(new Error('transient'));

    useEmailStore.setState({ emails: prev, currentQuery: searchQuery('invoice') });

    await useEmailStore
      .getState()
      .refreshCurrentMailbox({ queryEmails } as unknown as JMAPClient);

    expect(useEmailStore.getState().emails.map((e) => e.id)).toEqual(['keep1', 'keep2']);
  });
});
