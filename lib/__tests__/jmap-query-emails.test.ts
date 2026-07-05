import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestClient, mockFetch } from './jmap-test-helpers';
import type { EmailQuery, EmailPage } from '@/lib/jmap/search-utils';

const folderTextQuery: EmailQuery = {
  text: 'invoice',
  scope: { kind: 'folder', mailboxId: 'mb-1' },
  sort: { by: 'receivedAt', ascending: false },
};
const firstPage: EmailPage = { limit: 50 };

function bodyOf(spy: ReturnType<typeof mockFetch>) {
  const init = spy.mock.calls[0][1] as { body?: string };
  return JSON.parse(init.body as string);
}

describe('JMAPClient.queryEmails', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('turns a folder+text descriptor into the expected Email/query + back-referenced Email/get', async () => {
    const client = createTestClient();
    const spy = mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['e1', 'e2'], total: 5, position: 0 }, '0'],
        ['Email/get', { list: [{ id: 'e1' }, { id: 'e2' }] }, '1'],
      ],
    });

    const result = await client.queryEmails(folderTextQuery, firstPage);

    const calls = bodyOf(spy).methodCalls;
    expect(calls[0][0]).toBe('Email/query');
    const q = calls[0][1];
    expect(q.accountId).toBe('account-1');
    expect(q.limit).toBe(50);
    expect(q.calculateTotal).toBe(true);
    expect(q.sort).toEqual([{ property: 'receivedAt', isAscending: false }]);
    // scope + text land in the filter regardless of T1's exact nesting
    expect(JSON.stringify(q.filter)).toContain('"inMailbox":"mb-1"');
    expect(JSON.stringify(q.filter)).toContain('"text":"invoice"');
    // first page: no anchor continuation
    expect(q.anchor).toBeUndefined();
    expect(q.anchorOffset).toBeUndefined();

    expect(calls[1][0]).toBe('Email/get');
    expect(calls[1][1]['#ids']).toEqual({ resultOf: '0', name: 'Email/query', path: '/ids' });

    expect(result.emails.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(result.total).toBe(5);
    expect(result.position).toBe(0);
    // hasMore = position + ids.length < total => 0 + 2 < 5
    expect(result.hasMore).toBe(true);
  });

  it('reports hasMore=false once the loaded window reaches total', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['e1', 'e2'], total: 2, position: 0 }, '0'],
        ['Email/get', { list: [{ id: 'e1' }, { id: 'e2' }] }, '1'],
      ],
    });

    const result = await client.queryEmails(folderTextQuery, firstPage);
    expect(result.hasMore).toBe(false);
  });

  it('derives hasMore from a full page when the anchor query omits total', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [
        ['Email/query', { ids: Array.from({ length: 50 }, (_, i) => `e${i}`), position: 50 }, '0'],
        ['Email/get', { list: [{ id: 'e0' }] }, '1'],
      ],
    });

    const anchorPage: EmailPage = { limit: 50, anchor: 'e49', anchorOffset: 1 };
    const result = await client.queryEmails(folderTextQuery, anchorPage);

    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(true);
  });

  it('reports hasMore=false on a short anchor page with total omitted', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['e1', 'e2'], position: 50 }, '0'],
        ['Email/get', { list: [{ id: 'e1' }, { id: 'e2' }] }, '1'],
      ],
    });

    const anchorPage: EmailPage = { limit: 50, anchor: 'e49', anchorOffset: 1 };
    const result = await client.queryEmails(folderTextQuery, anchorPage);
    expect(result.hasMore).toBe(false);
  });

  it('throws on a method-level error response instead of blanking the list', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [['error', { type: 'unsupportedSort', description: 'bad sort' }, '0']],
    });

    await expect(client.queryEmails(folderTextQuery, firstPage)).rejects.toThrow('bad sort');
  });
});
