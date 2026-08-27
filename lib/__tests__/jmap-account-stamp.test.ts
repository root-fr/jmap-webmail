import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestClient, mockFetch, mockFetchOnce } from './jmap-test-helpers';
import type { EmailQuery, EmailPage } from '@/lib/jmap/search-utils';

const inboxQuery: EmailQuery = {
  scope: { kind: 'folder', mailboxId: 'mb-1' },
  sort: { by: 'receivedAt', ascending: false },
};
const firstPage: EmailPage = { limit: 50 };

describe('Email.accountId stamping', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('queryEmails stamps accountId on every email fetched from a non-primary account', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['e1', 'e2'], total: 2, position: 0 }, '0'],
        ['Email/get', {
          list: [
            { id: 'e1', mailboxIds: { 'mb-1': true } },
            { id: 'e2', mailboxIds: { 'mb-1': true } },
          ],
        }, '1'],
      ],
    });

    const { emails } = await client.queryEmails(inboxQuery, firstPage, 'account-2');

    expect(emails.map((e) => e.accountId)).toEqual(['account-2', 'account-2']);
    // existing mailbox-id namespacing must still apply alongside the stamp
    expect(emails[0].mailboxIds).toEqual({ 'account-2:mb-1': true });
  });

  it('queryEmails leaves primary-account emails unstamped', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['e1'], total: 1, position: 0 }, '0'],
        ['Email/get', { list: [{ id: 'e1', mailboxIds: { 'mb-1': true } }] }, '1'],
      ],
    });

    const { emails } = await client.queryEmails(inboxQuery, firstPage);

    expect(emails[0].accountId).toBeUndefined();
    expect(emails[0].mailboxIds).toEqual({ 'mb-1': true });
  });

  it('queryEmails leaves emails unstamped when accountId explicitly equals the primary', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['e1'], total: 1, position: 0 }, '0'],
        ['Email/get', { list: [{ id: 'e1', mailboxIds: { 'mb-1': true } }] }, '1'],
      ],
    });

    const { emails } = await client.queryEmails(inboxQuery, firstPage, 'account-1');

    expect(emails[0].accountId).toBeUndefined();
    expect(emails[0].mailboxIds).toEqual({ 'mb-1': true });
  });

  it('getEmail stamps accountId on a non-primary fetch, even when mailboxIds is absent', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [
        ['Email/get', { list: [{ id: 'e9' }] }, '0'],
      ],
    });

    const email = await client.getEmail('e9', 'account-2');

    expect(email?.accountId).toBe('account-2');
  });

  it('getThreadEmails stamps accountId on every email of a non-primary thread', async () => {
    const client = createTestClient();
    // default response serves the second request (Email/get);
    // the queued once-response serves the first request (Thread/get)
    const spy = mockFetch({
      methodResponses: [
        ['Email/get', {
          list: [
            { id: 'e1', mailboxIds: { 'mb-1': true }, receivedAt: '2026-07-01T00:00:00Z' },
            { id: 'e2', mailboxIds: { 'mb-1': true }, receivedAt: '2026-07-02T00:00:00Z' },
          ],
        }, '0'],
      ],
    });
    mockFetchOnce(spy, {
      methodResponses: [
        ['Thread/get', { list: [{ id: 't1', emailIds: ['e1', 'e2'] }] }, '0'],
      ],
    });

    const emails = await client.getThreadEmails('t1', 'account-2');

    expect(emails).toHaveLength(2);
    expect(emails.map((e) => e.accountId)).toEqual(['account-2', 'account-2']);
    expect(emails[0].mailboxIds).toEqual({ 'account-2:mb-1': true });
  });
});
