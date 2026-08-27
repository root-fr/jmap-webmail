import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JMAPClient } from '../jmap/client';

const mockIdentity = {
  id: 'id-1',
  name: 'Test User',
  email: 'test@example.com',
  mayDelete: true,
};

function createClient(): JMAPClient {
  const client = new JMAPClient('https://jmap.example.com', 'user', 'pass');
  // Set internal state so request() doesn't throw "Not connected"
  Object.assign(client, {
    apiUrl: 'https://jmap.example.com/api',
    accountId: 'account-1',
  });
  return client;
}

function mockFetch(response: object, ok = true, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(response)),
    json: () => Promise.resolve(response),
  } as Response);
}

describe('JMAPClient identity methods', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getIdentities', () => {
    it('should return identities from server', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['Identity/get', { list: [mockIdentity] }, '0']],
      });

      const result = await client.getIdentities();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('id-1');
      expect(result[0].email).toBe('test@example.com');
    });

    it('should return empty array when no identities', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['Identity/get', { list: [] }, '0']],
      });

      const result = await client.getIdentities();
      expect(result).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      const client = createClient();
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await client.getIdentities();
      expect(result).toEqual([]);
    });

    it('should return empty array for unexpected response', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['SomethingElse', {}, '0']],
      });

      const result = await client.getIdentities();
      expect(result).toEqual([]);
    });

    it('should handle missing list property', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['Identity/get', {}, '0']],
      });

      const result = await client.getIdentities();
      expect(result).toEqual([]);
    });
  });

  describe('createIdentity', () => {
    it('should create identity and return full object', async () => {
      const client = createClient();
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      // First call: Identity/set returns created id
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          methodResponses: [['Identity/set', { created: { 'new-identity': { id: 'new-id' } } }, '0']],
        })),
        json: () => Promise.resolve({
          methodResponses: [['Identity/set', { created: { 'new-identity': { id: 'new-id' } } }, '0']],
        }),
      } as Response);

      // Second call: getIdentities fetches full object
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          methodResponses: [['Identity/get', { list: [{ ...mockIdentity, id: 'new-id' }] }, '0']],
        })),
        json: () => Promise.resolve({
          methodResponses: [['Identity/get', { list: [{ ...mockIdentity, id: 'new-id' }] }, '0']],
        }),
      } as Response);

      const result = await client.createIdentity('Test User', 'test@example.com');
      expect(result.id).toBe('new-id');
    });

    it('should throw on forbidden error', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['Identity/set', {
          notCreated: { 'new-identity': { type: 'forbidden' } },
        }, '0']],
      });

      await expect(client.createIdentity('Test', 'test@example.com'))
        .rejects.toThrow('not authorized');
    });

    it('should throw on generic creation error', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['Identity/set', {
          notCreated: { 'new-identity': { type: 'invalidProperties', description: 'Bad input' } },
        }, '0']],
      });

      await expect(client.createIdentity('Test', 'test@example.com'))
        .rejects.toThrow('Bad input');
    });

    it('should throw on unexpected response', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['SomethingElse', {}, '0']],
      });

      await expect(client.createIdentity('Test', 'test@example.com'))
        .rejects.toThrow('unexpected');
    });

    it('should pass all parameters to the request', async () => {
      const client = createClient();
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          methodResponses: [['Identity/set', { created: { 'new-identity': { id: 'new-id' } } }, '0']],
        })),
        json: () => Promise.resolve({
          methodResponses: [['Identity/set', { created: { 'new-identity': { id: 'new-id' } } }, '0']],
        }),
      } as Response);

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          methodResponses: [['Identity/get', { list: [{ ...mockIdentity, id: 'new-id' }] }, '0']],
        })),
        json: () => Promise.resolve({
          methodResponses: [['Identity/get', { list: [{ ...mockIdentity, id: 'new-id' }] }, '0']],
        }),
      } as Response);

      const replyTo = [{ name: 'Reply', email: 'reply@example.com' }];
      const bcc = [{ email: 'bcc@example.com' }];

      await client.createIdentity('Test', 'test@example.com', replyTo, bcc, 'text sig', '<b>html sig</b>');

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      const createArgs = body.methodCalls[0][1].create['new-identity'];
      expect(createArgs.name).toBe('Test');
      expect(createArgs.email).toBe('test@example.com');
      expect(createArgs.replyTo).toEqual(replyTo);
      expect(createArgs.bcc).toEqual(bcc);
      expect(createArgs.textSignature).toBe('text sig');
      expect(createArgs.htmlSignature).toBe('<b>html sig</b>');
    });
  });

  describe('updateIdentity', () => {
    it('should update identity successfully', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['Identity/set', { updated: { 'id-1': null } }, '0']],
      });

      await expect(client.updateIdentity('id-1', { name: 'New Name' })).resolves.toBeUndefined();
    });

    it('should throw on notFound error', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['Identity/set', {
          notUpdated: { 'id-1': { type: 'notFound' } },
        }, '0']],
      });

      await expect(client.updateIdentity('id-1', { name: 'X' }))
        .rejects.toThrow('not found');
    });

    it('should throw on forbidden error', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['Identity/set', {
          notUpdated: { 'id-1': { type: 'forbidden' } },
        }, '0']],
      });

      await expect(client.updateIdentity('id-1', { name: 'X' }))
        .rejects.toThrow('not authorized');
    });

    it('should throw on generic update error', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['Identity/set', {
          notUpdated: { 'id-1': { type: 'other', description: 'Server error' } },
        }, '0']],
      });

      await expect(client.updateIdentity('id-1', { name: 'X' }))
        .rejects.toThrow('Server error');
    });

    it('should throw on unexpected response', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['SomethingElse', {}, '0']],
      });

      await expect(client.updateIdentity('id-1', { name: 'X' }))
        .rejects.toThrow('unexpected');
    });
  });

  describe('deleteIdentity', () => {
    it('should delete identity successfully', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['Identity/set', { destroyed: ['id-1'] }, '0']],
      });

      await expect(client.deleteIdentity('id-1')).resolves.toBeUndefined();
    });

    it('should throw on forbidden error', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['Identity/set', {
          notDestroyed: { 'id-1': { type: 'forbidden' } },
        }, '0']],
      });

      await expect(client.deleteIdentity('id-1'))
        .rejects.toThrow('cannot be deleted');
    });

    it('should throw on notFound error', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['Identity/set', {
          notDestroyed: { 'id-1': { type: 'notFound' } },
        }, '0']],
      });

      await expect(client.deleteIdentity('id-1'))
        .rejects.toThrow('not found');
    });

    it('should throw on generic delete error', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['Identity/set', {
          notDestroyed: { 'id-1': { type: 'other', description: 'Cannot remove' } },
        }, '0']],
      });

      await expect(client.deleteIdentity('id-1'))
        .rejects.toThrow('Cannot remove');
    });

    it('should throw on unexpected response', async () => {
      const client = createClient();
      mockFetch({
        methodResponses: [['SomethingElse', {}, '0']],
      });

      await expect(client.deleteIdentity('id-1'))
        .rejects.toThrow('unexpected');
    });
  });
});

describe('getIdentities account targeting', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('targets the requested account', async () => {
    const client = createClient();
    const fetchSpy = mockFetch({
      methodResponses: [['Identity/get', { list: [mockIdentity] }, '0']],
    });

    await client.getIdentities('account-team');

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.methodCalls[0][1].accountId).toBe('account-team');
  });

  it('defaults to the primary account when no accountId is given', async () => {
    const client = createClient();
    const fetchSpy = mockFetch({
      methodResponses: [['Identity/get', { list: [] }, '0']],
    });

    await client.getIdentities();

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.methodCalls[0][1].accountId).toBe('account-1');
  });
});

describe('session account accessors', () => {
  it('exposes account ids and the primary account id', () => {
    const client = createClient();
    Object.assign(client, {
      accounts: { 'account-1': { name: 'user' }, 'account-team': { name: 'Team' } },
    });

    expect(client.getAccountIds()).toEqual(['account-1', 'account-team']);
    expect(client.getPrimaryAccountId()).toBe('account-1');
  });
});
