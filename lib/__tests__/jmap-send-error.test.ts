import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestClient as createClient, mockFetch } from './jmap-test-helpers';

describe('JMAPClient method-level error detection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sendEmail throws when EmailSubmission/set returns a method-level error', async () => {
    const client = createClient();
    // Avoid the Mailbox/get round-trip; sendEmail only needs sent + drafts roles.
    Object.assign(client, {
      getMailboxes: async () => [
        { id: 'sent-1', role: 'sent', name: 'Sent' },
        { id: 'drafts-1', role: 'drafts', name: 'Drafts' },
      ],
    });

    // JMAP method-level failures come back as ["error", {type,...}, callId].
    mockFetch({
      methodResponses: [['error', { type: 'forbidden', description: 'Submission denied' }, '0']],
    });

    await expect(
      client.sendEmail(
        ['to@example.com'], 'Subject', 'Body',
        undefined, undefined, 'id-1', 'me@example.com', 'draft-1',
      ),
    ).rejects.toThrow('Submission denied');
  });

  it('validateSieveScript reports invalid on a method-level error', async () => {
    const client = createClient();
    Object.assign(client, {
      uploadSieveBlob: async () => 'blob-1',
    });

    mockFetch({
      methodResponses: [['error', { type: 'invalidArguments', description: 'Invalid syntax' }, '0']],
    });

    const result = await client.validateSieveScript('bad script');
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(['Invalid syntax']);
  });
});
