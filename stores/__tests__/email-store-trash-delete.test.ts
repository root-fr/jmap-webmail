import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEmailStore } from '../email-store';
import { useSettingsStore } from '../settings-store';
import type { Email, Mailbox } from '@/lib/jmap/types';
import type { JMAPClient } from '@/lib/jmap/client';
import { accountScopedKey } from '@/lib/thread-utils';

const client = {
  moveToTrash: vi.fn().mockResolvedValue(undefined),
  deleteEmail: vi.fn().mockResolvedValue(undefined),
  batchMoveEmails: vi.fn().mockResolvedValue(undefined),
  batchDeleteEmails: vi.fn().mockResolvedValue(undefined),
} as unknown as JMAPClient;

const makeMailbox = (o: Partial<Mailbox>): Mailbox => ({
  id: 'mb', name: 'mb', role: undefined, sortOrder: 0,
  totalEmails: 1, unreadEmails: 0, totalThreads: 1, unreadThreads: 0,
  isSubscribed: true,
  ...o,
} as Mailbox);

const makeEmail = (o: Partial<Email>): Email => ({
  id: 'e', threadId: 't', mailboxIds: {}, keywords: { $seen: true },
  size: 10, receivedAt: '2026-01-01T00:00:00Z', hasAttachment: false,
  ...o,
} as Email);

describe('delete of an email already in Trash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ deleteAction: 'trash' });
    useEmailStore.setState({
      emails: [], mailboxes: [], selectedMailbox: '',
      selectedEmail: null, selectedEmailIds: new Set(), error: null,
    });
  });

  it('destroys the email instead of moving it (deleteEmail)', async () => {
    const trash = makeMailbox({ id: 'trash-1', role: 'trash' });
    const inbox = makeMailbox({ id: 'inbox-1', role: 'inbox' });
    const email = makeEmail({ id: 'e1', mailboxIds: { 'trash-1': true } });
    useEmailStore.setState({
      mailboxes: [inbox, trash], selectedMailbox: 'trash-1', emails: [email],
    });

    await useEmailStore.getState().deleteEmail(client, 'e1');

    expect(client.deleteEmail).toHaveBeenCalledWith('e1', undefined);
    expect(client.moveToTrash).not.toHaveBeenCalled();
    expect(useEmailStore.getState().emails).toHaveLength(0);
  });

  it('destroys against the shared account when the Trash belongs to a shared mailbox', async () => {
    const sharedTrash = makeMailbox({
      id: 'shared-acc/trash', originalId: 'trash-orig', role: 'trash',
      isShared: true, accountId: 'shared-acc',
    });
    const email = makeEmail({ id: 'e1', mailboxIds: { 'shared-acc/trash': true } });
    useEmailStore.setState({
      mailboxes: [sharedTrash], selectedMailbox: 'shared-acc/trash', emails: [email],
    });

    await useEmailStore.getState().deleteEmail(client, 'e1');

    expect(client.deleteEmail).toHaveBeenCalledWith('e1', 'shared-acc');
    expect(client.moveToTrash).not.toHaveBeenCalled();
  });

  it('destroys the emails instead of moving them (batchDelete)', async () => {
    const trash = makeMailbox({ id: 'trash-1', role: 'trash' });
    const e1 = makeEmail({ id: 'e1', mailboxIds: { 'trash-1': true } });
    const e2 = makeEmail({ id: 'e2', mailboxIds: { 'trash-1': true } });
    useEmailStore.setState({
      mailboxes: [trash], selectedMailbox: 'trash-1', emails: [e1, e2],
      selectedEmailIds: new Set([accountScopedKey(undefined, 'e1'), accountScopedKey(undefined, 'e2')]),
    });

    await useEmailStore.getState().batchDelete(client);

    expect(client.batchDeleteEmails).toHaveBeenCalledWith(['e1', 'e2'], undefined);
    expect(client.batchMoveEmails).not.toHaveBeenCalled();
  });

  it('batch-destroys against the shared account when the Trash belongs to a shared mailbox', async () => {
    const sharedTrash = makeMailbox({
      id: 'shared-acc/trash', originalId: 'trash-orig', role: 'trash',
      isShared: true, accountId: 'shared-acc',
    });
    const e1 = makeEmail({ id: 'e1', mailboxIds: { 'shared-acc/trash': true } });
    const e2 = makeEmail({ id: 'e2', mailboxIds: { 'shared-acc/trash': true } });
    useEmailStore.setState({
      mailboxes: [sharedTrash], selectedMailbox: 'shared-acc/trash', emails: [e1, e2],
      selectedEmailIds: new Set([accountScopedKey(undefined, 'e1'), accountScopedKey(undefined, 'e2')]),
    });

    await useEmailStore.getState().batchDelete(client);

    expect(client.batchDeleteEmails).toHaveBeenCalledWith(['e1', 'e2'], 'shared-acc');
    expect(client.batchMoveEmails).not.toHaveBeenCalled();
  });

  it('moves to Trash (never destroys) when the viewed mailbox is not Trash, even if an email is also a Trash member (leftover b)', async () => {
    const inbox = makeMailbox({ id: 'inbox-1', role: 'inbox' });
    const trash = makeMailbox({ id: 'trash-1', role: 'trash' });
    // e1 is a member of BOTH Inbox and Trash, but we are viewing the Inbox.
    const e1 = makeEmail({ id: 'e1', mailboxIds: { 'inbox-1': true, 'trash-1': true } });
    const e2 = makeEmail({ id: 'e2', mailboxIds: { 'inbox-1': true } });
    useEmailStore.setState({
      mailboxes: [inbox, trash], selectedMailbox: 'inbox-1', emails: [e1, e2],
      selectedEmailIds: new Set([accountScopedKey(undefined, 'e1'), accountScopedKey(undefined, 'e2')]),
    });

    await useEmailStore.getState().batchDelete(client);

    expect(client.batchMoveEmails).toHaveBeenCalledWith(['e1', 'e2'], 'trash-1', undefined);
    expect(client.batchDeleteEmails).not.toHaveBeenCalled();
  });
});
