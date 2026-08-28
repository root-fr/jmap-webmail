import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const discoverOAuth = vi.fn();
vi.mock('@/lib/oauth/discovery', () => ({
  discoverOAuth: (...args: unknown[]) => discoverOAuth(...args),
}));

const cookieStore = {
  jar: new Map<string, string>(),
  get(name: string) {
    const value = this.jar.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set: vi.fn(function (this: typeof cookieStore, name: string, value: string) {
    this.jar.set(name, value);
  }),
  delete: vi.fn(function (this: typeof cookieStore, name: string) {
    this.jar.delete(name);
  }),
};

vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
}));

const METADATA = {
  token_endpoint: 'https://idp.example/token',
  revocation_endpoint: 'https://idp.example/revoke',
  end_session_endpoint: 'https://idp.example/logout',
};

async function loadRoute() {
  vi.resetModules();
  return import('../route');
}

describe('OIDC token route', () => {
  beforeEach(() => {
    process.env.OAUTH_CLIENT_ID = 'webmail-client';
    process.env.JMAP_SERVER_URL = 'https://mail.example';
    cookieStore.jar.clear();
    cookieStore.set.mockClear();
    cookieStore.delete.mockClear();
    discoverOAuth.mockReset();
    discoverOAuth.mockResolvedValue(METADATA);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          access_token: 'at-1',
          refresh_token: 'rt-1',
          id_token: 'idt-1',
          expires_in: 3600,
        }),
        text: async () => '',
      })),
    );
  });

  it('stores the id_token in a cookie at code exchange', async () => {
    const { POST } = await loadRoute();
    const request = {
      json: async () => ({ code: 'c', code_verifier: 'v', redirect_uri: 'https://app/cb' }),
    };

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(cookieStore.jar.get('jmap_idt')).toBe('idt-1');
  });

  it('sends id_token_hint and client_id on the end-session URL at logout', async () => {
    cookieStore.jar.set('jmap_rt', 'rt-1');
    cookieStore.jar.set('jmap_idt', 'idt-1');
    const { DELETE } = await loadRoute();

    const response = await DELETE();
    const body = await response.json();

    const url = new URL(body.end_session_url);
    expect(url.origin + url.pathname).toBe('https://idp.example/logout');
    expect(url.searchParams.get('id_token_hint')).toBe('idt-1');
    expect(url.searchParams.get('client_id')).toBe('webmail-client');
    expect(cookieStore.jar.has('jmap_idt')).toBe(false);
  });

  it('falls back to client_id alone when no id_token was stored', async () => {
    cookieStore.jar.set('jmap_rt', 'rt-1');
    const { DELETE } = await loadRoute();

    const response = await DELETE();
    const body = await response.json();

    const url = new URL(body.end_session_url);
    expect(url.searchParams.get('client_id')).toBe('webmail-client');
    expect(url.searchParams.get('id_token_hint')).toBeNull();
  });

  it('rotates the stored id_token on refresh', async () => {
    cookieStore.jar.set('jmap_rt', 'rt-1');
    cookieStore.jar.set('jmap_idt', 'idt-old');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ access_token: 'at-2', id_token: 'idt-2', expires_in: 3600 }),
        text: async () => '',
      })),
    );
    const { PUT } = await loadRoute();

    const response = await PUT();

    expect(response.status).toBe(200);
    expect(cookieStore.jar.get('jmap_idt')).toBe('idt-2');
  });
});
