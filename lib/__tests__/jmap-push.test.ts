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
