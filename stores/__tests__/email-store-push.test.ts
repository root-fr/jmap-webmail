import { describe, it, expect, vi } from 'vitest';
import { useEmailStore } from '../email-store';
import type { JMAPClient } from '@/lib/jmap/client';
import type { StateChange } from '@/lib/jmap/types';

const change = (changed: StateChange['changed']): StateChange => ({
  '@type': 'StateChange',
  changed,
});

const client = { getAccountId: () => 'acc-a' } as unknown as JMAPClient;

const installSpies = () => {
  const refreshCurrentMailbox = vi.fn(async () => {});
  const fetchTagCounts = vi.fn(async () => {});
  const fetchMailboxes = vi.fn(async () => {});
  useEmailStore.setState({ refreshCurrentMailbox, fetchTagCounts, fetchMailboxes });
  return { refreshCurrentMailbox, fetchTagCounts, fetchMailboxes };
};

describe('handleStateChange multi-account', () => {
  it('refreshes when only a non-primary account reports an Email change', async () => {
    const spies = installSpies();

    await useEmailStore
      .getState()
      .handleStateChange(change({ 'acc-b': { Email: 'eb2' } }), client);

    expect(spies.refreshCurrentMailbox).toHaveBeenCalledTimes(1);
    expect(spies.fetchMailboxes).toHaveBeenCalledTimes(1);
    expect(useEmailStore.getState().error).toBeNull();
  });

  it('refreshes the mailbox list for a non-primary Mailbox-only change', async () => {
    const spies = installSpies();

    await useEmailStore
      .getState()
      .handleStateChange(change({ 'acc-b': { Mailbox: 'mb2' } }), client);

    expect(spies.refreshCurrentMailbox).not.toHaveBeenCalled();
    expect(spies.fetchMailboxes).toHaveBeenCalledTimes(1);
  });
});
