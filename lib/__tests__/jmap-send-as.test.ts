import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestClient as createClient, jsonResponse } from './jmap-test-helpers';

const GROUP_MAILBOXES = {
  methodResponses: [[
    'Mailbox/get',
    {
      list: [
        { id: 'g-drafts', role: 'drafts', name: 'Drafts' },
        { id: 'g-sent', role: 'sent', name: 'Sent' },
      ],
    },
    '0',
  ]],
};

const CREATE_AND_SUBMIT_OK = {
  methodResponses: [
    ['Email/set', { created: { 'draft-x': { id: 'email-real-1' } } }, '0'],
    ['EmailSubmission/set', { created: { '1': { id: 'sub-1' } } }, '1'],
  ],
};

const COPY_AND_SUBMIT_OK = {
  methodResponses: [
    ['Email/copy', { created: { 'draft-x': { id: 'email-copy-1' } } }, '0'],
    ['EmailSubmission/set', { created: { '1': { id: 'sub-1' } } }, '1'],
  ],
};

const DESTROY_OK = {
  methodResponses: [['Email/set', { destroyed: ['stale-draft-1'] }, '0']],
};

function bodiesOf(fetchSpy: { mock: { calls: unknown[][] } }) {
  return fetchSpy.mock.calls.map(
    (call) => JSON.parse((call[1] as { body: string }).body)
  );
}

describe('JMAPClient.sendEmail send-as group account', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('routes draft, submission and Sent copy through the target account', async () => {
    const client = createClient();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(GROUP_MAILBOXES))
      .mockResolvedValueOnce(jsonResponse(CREATE_AND_SUBMIT_OK));

    await client.sendEmail(
      ['to@example.com'], 'Subject', 'Body',
      undefined, undefined, 'identity-g1', 'support@example.com', undefined, undefined,
      'group-1',
    );

    const bodies = bodiesOf(fetchSpy);

    expect(bodies[0].methodCalls[0][0]).toBe('Mailbox/get');
    expect(bodies[0].methodCalls[0][1].accountId).toBe('group-1');

    const [createCall, submitCall] = bodies[1].methodCalls;
    expect(createCall[0]).toBe('Email/set');
    expect(createCall[1].accountId).toBe('group-1');
    const created = Object.values(createCall[1].create)[0] as {
      mailboxIds: Record<string, boolean>;
    };
    expect(created.mailboxIds).toEqual({ 'g-drafts': true });

    expect(submitCall[0]).toBe('EmailSubmission/set');
    expect(submitCall[1].accountId).toBe('group-1');
    expect(submitCall[1].onSuccessUpdateEmail['#1']['mailboxIds/g-sent']).toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('copies an autosaved primary draft into the target account and destroys the stale one after success', async () => {
    const client = createClient();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(GROUP_MAILBOXES))
      .mockResolvedValueOnce(jsonResponse(COPY_AND_SUBMIT_OK))
      .mockResolvedValueOnce(jsonResponse(DESTROY_OK));

    await client.sendEmail(
      ['to@example.com'], 'Subject', 'Body',
      undefined, undefined, 'identity-g1', 'support@example.com', 'stale-draft-1', undefined,
      'group-1',
    );

    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const bodies = bodiesOf(fetchSpy);

    // The stale primary draft is never submitted directly: it is copied
    // into the target account (body, headers and attachments intact) and
    // the copy is back-referenced by the submission.
    const [copyCall, submitCall] = bodies[1].methodCalls;
    expect(copyCall[0]).toBe('Email/copy');
    expect(copyCall[1].fromAccountId).toBe('account-1');
    expect(copyCall[1].accountId).toBe('group-1');
    const copied = Object.values(copyCall[1].create)[0] as {
      id: string;
      mailboxIds: Record<string, boolean>;
    };
    expect(copied.id).toBe('stale-draft-1');
    expect(copied.mailboxIds).toEqual({ 'g-drafts': true });

    expect(submitCall[0]).toBe('EmailSubmission/set');
    const submissionEmailId = (Object.values(submitCall[1].create)[0] as { emailId: string }).emailId;
    expect(submissionEmailId.startsWith('#')).toBe(true);

    // Cleanup destroys the stale draft in the primary account, after success.
    const cleanupCall = bodies[2].methodCalls[0];
    expect(cleanupCall[0]).toBe('Email/set');
    expect(cleanupCall[1].accountId).toBe('account-1');
    expect(cleanupCall[1].destroy).toEqual(['stale-draft-1']);
  });

  it('destroys the copied message in the target account when the submission is refused', async () => {
    const client = createClient();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(GROUP_MAILBOXES))
      .mockResolvedValueOnce(jsonResponse({
        methodResponses: [
          ['Email/copy', { created: { 'draft-x': { id: 'copy-1' } } }, '0'],
          ['EmailSubmission/set', { notCreated: { '1': { type: 'forbiddenFrom', description: 'Refused' } } }, '1'],
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        methodResponses: [['Email/set', { destroyed: ['copy-1'] }, '0']],
      }));

    await expect(
      client.sendEmail(
        ['to@example.com'], 'Subject', 'Body',
        undefined, undefined, 'identity-g1', 'support@example.com', 'stale-draft-1', undefined,
        'group-1',
      ),
    ).rejects.toThrow('Refused');

    // The refused submission must not strand the copy in the group
    // account's Drafts, and the primary draft must survive untouched.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const bodies = bodiesOf(fetchSpy);
    const cleanupCall = bodies[2].methodCalls[0];
    expect(cleanupCall[0]).toBe('Email/set');
    expect(cleanupCall[1].accountId).toBe('group-1');
    expect(cleanupCall[1].destroy).toEqual(['copy-1']);
  });

  it('throws on a group-account submission error and leaves the primary draft alone', async () => {
    const client = createClient();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(GROUP_MAILBOXES))
      .mockResolvedValueOnce(jsonResponse({
        methodResponses: [['error', { type: 'forbidden', description: 'Not allowed' }, '0']],
      }));

    await expect(
      client.sendEmail(
        ['to@example.com'], 'Subject', 'Body',
        undefined, undefined, 'identity-g1', 'support@example.com', 'stale-draft-1', undefined,
        'group-1',
      ),
    ).rejects.toThrow('Not allowed');

    const bodies = bodiesOf(fetchSpy);
    expect(bodies[1].methodCalls[0][1].accountId).toBe('group-1');

    // No cleanup request: the autosaved primary draft must survive a failed send.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
