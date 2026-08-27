import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestClient, mockFetch, mockFetchOnce } from './jmap-test-helpers';
import type { EmailQuery } from '@/lib/jmap/search-utils';
import type { UnifiedTarget } from '@/lib/jmap/unified-query';

const inboxBrowse: EmailQuery = {
  scope: { kind: 'all', includeTrashJunk: true },
  sort: { by: 'receivedAt', ascending: false },
};

const inboxTargets: UnifiedTarget[] = [
  { accountId: 'account-1', mailboxId: 'inbox-1' },
  { accountId: 'account-2', mailboxId: 'inbox-2' },
];

function bodyOf(spy: ReturnType<typeof mockFetch>, call = 0) {
  const init = spy.mock.calls[call][1] as { body?: string };
  return JSON.parse(init.body as string);
}

describe('JMAPClient.queryEmailsUnified', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends ONE request with a query+get pair per target and back-references', async () => {
    const client = createTestClient();
    const spy = mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['a1', 'a2'], total: 10, position: 0 }, 'q0'],
        ['Email/get', { list: [
          { id: 'a1', mailboxIds: { 'inbox-1': true } },
          { id: 'a2', mailboxIds: { 'inbox-1': true } },
        ] }, 'g0'],
        ['Email/query', { ids: ['b1'], total: 3, position: 0 }, 'q1'],
        ['Email/get', { list: [{ id: 'b1', mailboxIds: { 'inbox-2': true } }] }, 'g1'],
      ],
    });

    const pages = await client.queryEmailsUnified(inboxBrowse, { limit: 50 }, inboxTargets);

    expect(spy).toHaveBeenCalledTimes(1);
    const calls = bodyOf(spy).methodCalls;
    expect(calls).toHaveLength(4);

    expect(calls[0][0]).toBe('Email/query');
    expect(calls[0][2]).toBe('q0');
    expect(calls[0][1].accountId).toBe('account-1');
    expect(calls[0][1].limit).toBe(50);
    expect(calls[0][1].calculateTotal).toBe(true);
    expect(JSON.stringify(calls[0][1].filter)).toContain('"inMailbox":"inbox-1"');

    expect(calls[1][0]).toBe('Email/get');
    expect(calls[1][2]).toBe('g0');
    expect(calls[1][1].accountId).toBe('account-1');
    expect(calls[1][1]['#ids']).toEqual({ resultOf: 'q0', name: 'Email/query', path: '/ids' });

    expect(calls[2][0]).toBe('Email/query');
    expect(calls[2][2]).toBe('q1');
    expect(calls[2][1].accountId).toBe('account-2');
    expect(JSON.stringify(calls[2][1].filter)).toContain('"inMailbox":"inbox-2"');

    expect(calls[3][2]).toBe('g1');
    expect(calls[3][1]['#ids']).toEqual({ resultOf: 'q1', name: 'Email/query', path: '/ids' });

    expect(pages).toHaveLength(2);
    // total 10 > 2 buffered ids: more rows server-side, anchor = last id
    expect(pages[0]).toMatchObject({ accountId: 'account-1', total: 10, anchor: 'a2' });
    expect(pages[0].failed).toBeUndefined();
    // primary account: no namespacing, no accountId stamp
    expect(pages[0].emails[0].mailboxIds).toEqual({ 'inbox-1': true });
    expect(pages[0].emails[0].accountId).toBeUndefined();
    // non-primary: namespaced mailbox ids + accountId stamp (via T1's helper)
    expect(pages[1]).toMatchObject({ accountId: 'account-2', total: 3, anchor: 'b1' });
    expect(pages[1].emails[0].mailboxIds).toEqual({ 'account-2:inbox-2': true });
    expect(pages[1].emails[0].accountId).toBe('account-2');
  });

  it('realigns each page to Email/query ids order and drops ids missing from Email/get', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['a1', 'a2', 'a3'], total: 10, position: 0 }, 'q0'],
        // RFC 8620 §5.1 does not guarantee /get list order matches the ids
        // argument; the merge buffer contract requires query order.
        ['Email/get', { list: [
          { id: 'a3', mailboxIds: { 'inbox-1': true } },
          { id: 'a1', mailboxIds: { 'inbox-1': true } },
        ] }, 'g0'],
        ['Email/query', { ids: ['b1'], total: 3, position: 0 }, 'q1'],
        ['Email/get', { list: [{ id: 'b1', mailboxIds: { 'inbox-2': true } }] }, 'g1'],
      ],
    });

    const pages = await client.queryEmailsUnified(inboxBrowse, { limit: 50 }, inboxTargets);

    expect(pages[0].emails.map((e) => e.id)).toEqual(['a1', 'a3']);
    expect(pages[0].anchor).toBe('a3');
  });

  it('marks a failed account page instead of throwing, keeps the others, and nulls the anchor of an exhausted account', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['a1'], total: 1, position: 0 }, 'q0'],
        ['Email/get', { list: [{ id: 'a1', mailboxIds: { 'inbox-1': true } }] }, 'g0'],
        ['error', { type: 'serverFail', description: 'account unavailable' }, 'q1'],
        ['error', { type: 'invalidResultReference' }, 'g1'],
      ],
    });

    const pages = await client.queryEmailsUnified(inboxBrowse, { limit: 50 }, inboxTargets);

    // total 1 with 1 id buffered: the account is exhausted, so anchor is null
    // per the merge contract (anchor null = nothing beyond the buffer).
    expect(pages[0]).toMatchObject({ accountId: 'account-1', anchor: null });
    expect(pages[0].failed).toBeUndefined();
    expect(pages[1]).toEqual({ accountId: 'account-2', emails: [], anchor: null, failed: true });
  });

  it('excludes each account\'s OWN trash/junk for whole-account targets when includeTrashJunk=false', async () => {
    const client = createTestClient();
    Object.assign(client, {
      accounts: { 'account-1': { name: 'Me' }, 'account-2': { name: 'Support' } },
    });
    const spy = mockFetch({ methodResponses: [] });
    // getAllMailboxes: one Mailbox/get per account, in Object.keys(accounts) order
    mockFetchOnce(spy, {
      methodResponses: [['Mailbox/get', { list: [
        { id: 'inbox-1', name: 'Inbox', role: 'inbox' },
        { id: 't1', name: 'Trash', role: 'trash' },
        { id: 'j1', name: 'Junk', role: 'junk' },
      ] }, '0']],
    });
    mockFetchOnce(spy, {
      methodResponses: [['Mailbox/get', { list: [
        { id: 'inbox-2', name: 'Inbox', role: 'inbox' },
        { id: 't2', name: 'Trash', role: 'trash' },
      ] }, '0']],
    });
    mockFetchOnce(spy, {
      methodResponses: [
        ['Email/query', { ids: [], total: 0, position: 0 }, 'q0'],
        ['Email/get', { list: [] }, 'g0'],
        ['Email/query', { ids: [], total: 0, position: 0 }, 'q1'],
        ['Email/get', { list: [] }, 'g1'],
      ],
    });

    const everywhere: EmailQuery = {
      text: 'invoice',
      scope: { kind: 'all', includeTrashJunk: false },
      sort: { by: 'receivedAt', ascending: false },
    };
    const wholeAccountTargets: UnifiedTarget[] = [
      { accountId: 'account-1' },
      { accountId: 'account-2' },
    ];

    const pages = await client.queryEmailsUnified(everywhere, { limit: 50 }, wholeAccountTargets);

    // 2 Mailbox/get round trips for role resolution + exactly ONE combined query request
    expect(spy).toHaveBeenCalledTimes(3);
    const calls = bodyOf(spy, 2).methodCalls;
    expect(calls).toHaveLength(4);

    const filter0 = JSON.stringify(calls[0][1].filter);
    expect(filter0).toContain('"text":"invoice"');
    expect(filter0).toContain('"NOT"');
    expect(filter0).toContain('"inMailbox":"t1"');
    expect(filter0).toContain('"inMailbox":"j1"');
    expect(filter0).not.toContain('"t2"');

    const filter1 = JSON.stringify(calls[2][1].filter);
    expect(filter1).toContain('"inMailbox":"t2"');
    expect(filter1).not.toContain('"t1"');
    expect(filter1).not.toContain('"j1"');
    // whole-account target: no inbox restriction
    expect(filter1).not.toContain('"inbox-2"');

    expect(pages[0].anchor).toBeNull();
    expect(pages[1].anchor).toBeNull();
  });

  it('fails an account whose mailbox roles cannot be resolved instead of silently including its trash/junk', async () => {
    const client = createTestClient();
    Object.assign(client, {
      accounts: { 'account-1': { name: 'Me' }, 'account-2': { name: 'Support' } },
    });
    const spy = mockFetch({ methodResponses: [] });
    mockFetchOnce(spy, {
      methodResponses: [['Mailbox/get', { list: [
        { id: 'inbox-1', name: 'Inbox', role: 'inbox' },
        { id: 't1', name: 'Trash', role: 'trash' },
      ] }, '0']],
    });
    // account-2's Mailbox/get fails: its trash/junk exclusion cannot be built
    mockFetchOnce(spy, {
      methodResponses: [['error', { type: 'serverFail', description: 'account unavailable' }, '0']],
    });
    mockFetchOnce(spy, {
      methodResponses: [
        ['Email/query', { ids: [], total: 0, position: 0 }, 'q0'],
        ['Email/get', { list: [] }, 'g0'],
      ],
    });

    const everywhere: EmailQuery = {
      text: 'invoice',
      scope: { kind: 'all', includeTrashJunk: false },
      sort: { by: 'receivedAt', ascending: false },
    };
    const pages = await client.queryEmailsUnified(everywhere, { limit: 50 }, [
      { accountId: 'account-1' },
      { accountId: 'account-2' },
    ]);

    // only account-1's query/get pair is sent; account-2 must not be queried
    // with a filter that would include its trash/junk
    const calls = bodyOf(spy, 2).methodCalls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1].accountId).toBe('account-1');
    expect(JSON.stringify(calls[0][1].filter)).toContain('"inMailbox":"t1"');

    expect(pages[0].failed).toBeUndefined();
    expect(pages[1]).toEqual({ accountId: 'account-2', emails: [], anchor: null, failed: true });
  });
});
