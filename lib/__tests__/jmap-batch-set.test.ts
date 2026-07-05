import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestClient as createClient, mockFetch } from './jmap-test-helpers';

describe('JMAPClient batch Email/set error surfacing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('batchDeleteEmails throws when the server reports notDestroyed', async () => {
    const client = createClient();
    mockFetch({
      methodResponses: [
        ['Email/set', { destroyed: [], notDestroyed: { e1: { type: 'notFound' } } }, '0'],
      ],
    });

    await expect(client.batchDeleteEmails(['e1'])).rejects.toThrow(/notFound|destroy/i);
  });

  it('batchDeleteEmails resolves when every id is destroyed', async () => {
    const client = createClient();
    mockFetch({
      methodResponses: [['Email/set', { destroyed: ['e1'], notDestroyed: {} }, '0']],
    });

    await expect(client.batchDeleteEmails(['e1'])).resolves.toBeUndefined();
  });

  it('batchDeleteEmails sends the passed accountId for shared mailboxes', async () => {
    const client = createClient();
    const fetchSpy = mockFetch({
      methodResponses: [['Email/set', { destroyed: ['e1'], notDestroyed: {} }, '0']],
    });

    await client.batchDeleteEmails(['e1'], 'shared-account-9');

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.methodCalls[0][1].accountId).toBe('shared-account-9');
  });
});
