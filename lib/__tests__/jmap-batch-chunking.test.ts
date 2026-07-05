import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestClient as createClient, jsonResponse } from './jmap-test-helpers';
import { chunk } from '../jmap/client';

function withMaxObjectsInSet(client: ReturnType<typeof createClient>, n: number) {
  Object.assign(client, { capabilities: { 'urn:ietf:params:jmap:core': { maxObjectsInSet: n } } });
}

describe('chunk()', () => {
  it('splits by size and drops nothing', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });
});

describe('JMAPClient chunks large Email/set by maxObjectsInSet', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('splits destroy into ceil(n/limit) requests and aggregates notDestroyed across chunks', async () => {
    const client = createClient();
    withMaxObjectsInSet(client, 2);
    const ids = ['e1', 'e2', 'e3', 'e4', 'e5'];
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ methodResponses: [['Email/set', { destroyed: ['e1', 'e2'], notDestroyed: {} }, '0']] }))
      .mockResolvedValueOnce(jsonResponse({ methodResponses: [['Email/set', { destroyed: ['e3'], notDestroyed: { e4: { type: 'notFound' } } }, '0']] }))
      .mockResolvedValueOnce(jsonResponse({ methodResponses: [['Email/set', { destroyed: ['e5'], notDestroyed: {} }, '0']] }));

    await expect(client.batchDeleteEmails(ids)).rejects.toThrow(/notFound|destroy/i);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const bodies = fetchSpy.mock.calls.map(c => JSON.parse(c[1]?.body as string));
    expect(bodies[0].methodCalls[0][1].destroy).toEqual(['e1', 'e2']);
    expect(bodies[1].methodCalls[0][1].destroy).toEqual(['e3', 'e4']);
    expect(bodies[2].methodCalls[0][1].destroy).toEqual(['e5']);
  });

  it('throws when a chunk returns a method-level error response (leftover a)', async () => {
    const client = createClient();
    withMaxObjectsInSet(client, 10);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ methodResponses: [['error', { type: 'serverFail', description: 'boom' }, '0']] })
    );
    await expect(client.batchDeleteEmails(['e1'])).rejects.toThrow(/serverFail|boom|method-level/i);
  });
});
