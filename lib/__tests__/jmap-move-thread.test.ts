import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestClient as createClient, jsonResponse } from './jmap-test-helpers';

describe('JMAPClient.moveThreadToMailbox', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('patches only the source mailbox membership and leaves Sent untouched', async () => {
    const client = createClient();
    let setUpdate: Record<string, Record<string, unknown>> | null = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      const method = body.methodCalls[0][0];
      if (method === 'Thread/get') {
        return jsonResponse({
          methodResponses: [['Thread/get', { list: [{ id: 't1', emailIds: ['e-inbox', 'e-sent'] }] }, '0']],
        });
      }
      if (method === 'Email/get') {
        // Inbox message lives only in Inbox; the reply lives only in Sent.
        return jsonResponse({
          methodResponses: [['Email/get', { list: [
            { id: 'e-inbox', mailboxIds: { inbox: true } },
            { id: 'e-sent', mailboxIds: { sent: true } },
          ] }, '0']],
        });
      }
      // Email/set — capture the update payload for assertions.
      setUpdate = body.methodCalls[0][1].update;
      return jsonResponse({ methodResponses: [['Email/set', { updated: { 'e-inbox': null } }, '0']] });
    });

    const moved = await client.moveThreadToMailbox('t1', 'archive', 'inbox');

    // Only the Inbox message is detached; the Sent reply is never patched.
    expect(moved).toEqual(['e-inbox']);
    expect(setUpdate).toEqual({
      'e-inbox': { 'mailboxIds/inbox': null, 'mailboxIds/archive': true },
    });
    expect(setUpdate!['e-sent']).toBeUndefined();
  });
});
