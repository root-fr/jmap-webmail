import { vi } from 'vitest';
import { JMAPClient } from '../jmap/client';

/** JMAPClient with the internal state request() needs, without a connect round-trip. */
export function createTestClient(): JMAPClient {
  const client = new JMAPClient('https://jmap.example.com', 'user', 'pass');
  Object.assign(client, {
    apiUrl: 'https://jmap.example.com/api',
    accountId: 'account-1',
  });
  return client;
}

export function jsonResponse(payload: object, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(payload)),
    json: () => Promise.resolve(payload),
  } as Response;
}

export function mockFetch(response: object, ok = true, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(response, ok, status));
}

export function mockFetchOnce(spy: ReturnType<typeof vi.spyOn>, response: object) {
  spy.mockResolvedValueOnce(jsonResponse(response));
  return spy;
}
