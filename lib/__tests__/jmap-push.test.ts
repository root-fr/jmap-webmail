import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JMAPClient } from '../jmap/client';

describe('JMAPClient push polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // fetchCurrentStates() fires during setup; give it a benign response
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ methodResponses: [] }), { status: 200 }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not stack polling intervals when setup is called more than once', () => {
    const client = new JMAPClient('https://mail.example.com', 'user', 'pass');
    const setIntervalSpy = vi.spyOn(global, 'setInterval');

    expect(client.setupPushNotifications()).toBe(true);
    // A second setup (e.g. an effect re-run) must be a no-op, not a new poll
    expect(client.setupPushNotifications()).toBe(true);

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    client.closePushNotifications();
  });
});

describe('JMAPClient multi-account push polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const jsonResponse = (methodResponses: unknown[]) =>
    new Response(JSON.stringify({ methodResponses }), { status: 200 });

  const makeMultiAccountClient = () => {
    const client = new JMAPClient('https://mail.example.com', 'user', 'pass');
    Object.assign(client as unknown as Record<string, unknown>, {
      accountId: 'acc-a',
      accounts: {
        'acc-a': { name: 'me@example.com' },
        'acc-b': { name: 'support@example.com' },
      },
      apiUrl: 'https://mail.example.com/jmap',
    });
    return client;
  };

  const seedResponses = [
    ['Mailbox/get', { accountId: 'acc-a', state: 'ma1', list: [] }, 'a'],
    ['Email/get', { accountId: 'acc-a', state: 'ea1', list: [] }, 'b'],
    ['Mailbox/get', { accountId: 'acc-b', state: 'mb1', list: [] }, 'm-acc-b'],
    ['Email/get', { accountId: 'acc-b', state: 'eb1', list: [] }, 'e-acc-b'],
  ];

  const stubFetchSequence = (second: unknown[]) => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () =>
        jsonResponse(call++ === 0 ? seedResponses : second),
      ),
    );
  };

  it('polls mailbox and email state for every session account in one request', () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const client = makeMultiAccountClient();

    client.setupPushNotifications();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.methodCalls).toContainEqual(
      ['Mailbox/get', { accountId: 'acc-b', ids: null, properties: ['id'] }, 'm-acc-b'],
    );
    expect(body.methodCalls).toContainEqual(
      ['Email/get', { accountId: 'acc-b', ids: [], properties: ['id'] }, 'e-acc-b'],
    );

    client.closePushNotifications();
  });

  it('reports a non-primary account change under its own account id', async () => {
    stubFetchSequence([
      ['Mailbox/get', { accountId: 'acc-a', state: 'ma1', list: [] }, 'a'],
      ['Email/get', { accountId: 'acc-a', state: 'ea1', list: [] }, 'b'],
      ['Mailbox/get', { accountId: 'acc-b', state: 'mb1', list: [] }, 'm-acc-b'],
      ['Email/get', { accountId: 'acc-b', state: 'eb2', list: [] }, 'e-acc-b'],
    ]);
    const client = makeMultiAccountClient();
    const onChange = vi.fn();
    client.onStateChange(onChange);

    client.setupPushNotifications();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      '@type': 'StateChange',
      changed: { 'acc-b': { Email: 'eb2' } },
    });

    client.closePushNotifications();
  });

  it('chunks the poll by maxCallsInRequest and still reports changes from later chunks', async () => {
    const states: Record<string, string> = {
      'acc-a/Mailbox': 'ma1', 'acc-a/Email': 'ea1',
      'acc-b/Mailbox': 'mb1', 'acc-b/Email': 'eb1',
      'acc-c/Mailbox': 'mc1', 'acc-c/Email': 'ec1',
    };
    const fetchMock = vi.fn().mockImplementation(async (_url, init: { body: string }) => {
      const body = JSON.parse(init.body);
      return jsonResponse(
        body.methodCalls.map(([method, args, id]: [string, { accountId: string }, string]) => [
          method,
          {
            accountId: args.accountId,
            state: states[`${args.accountId}/${method === 'Mailbox/get' ? 'Mailbox' : 'Email'}`],
            list: [],
          },
          id,
        ]),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new JMAPClient('https://mail.example.com', 'user', 'pass');
    Object.assign(client as unknown as Record<string, unknown>, {
      accountId: 'acc-a',
      accounts: {
        'acc-a': { name: 'me@example.com' },
        'acc-b': { name: 'support@example.com' },
        'acc-c': { name: 'sales@example.com' },
      },
      apiUrl: 'https://mail.example.com/jmap',
      capabilities: { 'urn:ietf:params:jmap:core': { maxCallsInRequest: 4 } },
    });
    const onChange = vi.fn();
    client.onStateChange(onChange);

    client.setupPushNotifications();
    await vi.advanceTimersByTimeAsync(0);

    // 6 mail calls against a 4-call server limit: the seed poll must split
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const polledIds = new Set<string>();
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse(call[1].body);
      expect(body.methodCalls.length).toBeLessThanOrEqual(4);
      for (const [, args] of body.methodCalls) polledIds.add(args.accountId);
    }
    expect(polledIds).toEqual(new Set(['acc-a', 'acc-b', 'acc-c']));

    states['acc-c/Email'] = 'ec2';
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      '@type': 'StateChange',
      changed: { 'acc-c': { Email: 'ec2' } },
    });

    client.closePushNotifications();
  });

  it('keeps reporting other accounts when one account errors in the poll', async () => {
    stubFetchSequence([
      ['Mailbox/get', { accountId: 'acc-a', state: 'ma1', list: [] }, 'a'],
      ['Email/get', { accountId: 'acc-a', state: 'ea2', list: [] }, 'b'],
      ['error', { type: 'serverFail' }, 'm-acc-b'],
      ['error', { type: 'serverFail' }, 'e-acc-b'],
    ]);
    const client = makeMultiAccountClient();
    const onChange = vi.fn();
    client.onStateChange(onChange);

    client.setupPushNotifications();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      '@type': 'StateChange',
      changed: { 'acc-a': { Email: 'ea2' } },
    });

    client.closePushNotifications();
  });
});
