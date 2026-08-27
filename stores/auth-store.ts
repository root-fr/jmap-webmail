import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { JMAPClient } from '@/lib/jmap/client';
import { useEmailStore } from './email-store';
import { useIdentityStore } from './identity-store';
import { useContactStore } from './contact-store';
import { useVacationStore } from './vacation-store';
import { useCalendarStore } from './calendar-store';
import { useFilterStore } from './filter-store';
import { debug } from '@/lib/debug';
import type { Identity } from '@/lib/jmap/types';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  serverUrl: string | null;
  username: string | null;
  client: JMAPClient | null;
  identities: Identity[];
  primaryIdentity: Identity | null;
  authMode: 'basic' | 'oauth';
  rememberMe: boolean;
  accessToken: string | null;
  tokenExpiresAt: number | null;

  login: (serverUrl: string, username: string, password: string, totp?: string, rememberMe?: boolean) => Promise<boolean>;
  loginWithOAuth: (serverUrl: string, code: string, codeVerifier: string, redirectUri: string) => Promise<boolean>;
  refreshAccessToken: () => Promise<string | null>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

const ERROR_PATTERNS: Array<{ key: string; matches: string[] }> = [
  { key: 'cors_blocked', matches: ['CORS_ERROR'] },
  { key: 'invalid_credentials', matches: ['Invalid username or password', '401', 'Unauthorized'] },
  { key: 'connection_failed', matches: ['network', 'Failed to fetch', 'NetworkError', 'ECONNREFUSED'] },
  { key: 'server_error', matches: ['500', '502', '503', '504', 'Internal Server Error', 'Service Unavailable'] },
];

function classifyLoginError(error: unknown): string {
  if (!(error instanceof Error)) return 'generic';
  const msg = error.message;
  for (const { key, matches } of ERROR_PATTERNS) {
    if (matches.some((pattern) => msg.includes(pattern))) return key;
  }
  return 'generic';
}

function loadIdentities(rawIdentities: Identity[], username: string): { identities: Identity[]; primaryIdentity: Identity | null } {
  const identities = [...rawIdentities].sort((a, b) => {
    const aMatch = a.email === username ? -1 : 0;
    const bMatch = b.email === username ? -1 : 0;
    return aMatch - bMatch;
  });
  const primaryIdentity = identities[0] ?? null;
  useIdentityStore.getState().setIdentities(identities);
  return { identities, primaryIdentity };
}

function markSessionExpired(): void {
  try { sessionStorage.setItem('session_expired', 'true'); } catch { /* noop */ }
}

function initializeFeatureStores(client: JMAPClient): void {
  useIdentityStore.getState().loadAccountIdentities(client).catch((err) => debug.error('Failed to load account identities:', err));

  if (client.supportsContacts()) {
    const contactStore = useContactStore.getState();
    contactStore.setSupportsSync(true);
    contactStore.fetchAddressBooks(client).catch((err) => debug.error('Failed to fetch address books:', err));
    contactStore.fetchContacts(client).catch((err) => debug.error('Failed to fetch contacts:', err));
  } else {
    useContactStore.getState().setSupportsSync(false);
  }

  const vacationStore = useVacationStore.getState();
  if (client.supportsVacationResponse()) {
    vacationStore.setSupported(true);
    vacationStore.fetchVacationResponse(client).catch((err) => debug.error('Failed to fetch vacation response:', err));
  } else {
    vacationStore.setSupported(false);
  }

  if (client.supportsCalendars()) {
    const calendarStore = useCalendarStore.getState();
    calendarStore.setSupported(true);
    calendarStore.fetchCalendars(client).catch((err) => debug.error('Failed to fetch calendars:', err));
  }

  if (client.supportsSieve()) {
    const filterStore = useFilterStore.getState();
    filterStore.setSupported(true);
    filterStore.fetchFilters(client).catch((err) => debug.error('Failed to fetch filters:', err));
  }
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshPromise: Promise<string | null> | null = null;

function scheduleRefresh(expiresIn: number, refreshFn: () => Promise<string | null>): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const refreshAt = Math.max((expiresIn - 60) * 1000, 10_000);
  refreshTimer = setTimeout(() => {
    refreshFn().catch((err) => {
      debug.error('Scheduled token refresh failed:', err);
    });
  }, refreshAt);
}

function clearRefreshTimer(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  refreshPromise = null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      isLoading: false,
      error: null,
      serverUrl: null,
      username: null,
      client: null,
      identities: [],
      primaryIdentity: null,
      authMode: 'basic',
      rememberMe: false,
      accessToken: null,
      tokenExpiresAt: null,

      login: async (serverUrl, username, password, totp, rememberMe) => {
        const effectivePassword = totp ? `${password}$${totp}` : password;
        set({ isLoading: true, error: null });

        try {
          const client = new JMAPClient(serverUrl, username, effectivePassword);
          await client.connect();

          const { identities, primaryIdentity } = loadIdentities(await client.getIdentities(), username);
          initializeFeatureStores(client);

          set({
            isAuthenticated: true,
            isLoading: false,
            serverUrl,
            username,
            client,
            identities,
            primaryIdentity,
            authMode: 'basic',
            accessToken: null,
            tokenExpiresAt: null,
            error: null,
          });

          if (rememberMe) {
            try {
              const res = await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverUrl, username, password: effectivePassword }),
              });
              if (res.ok) {
                set({ rememberMe: true });
              } else {
                debug.error('Failed to store session: server returned', res.status);
              }
            } catch (err) {
              debug.error('Failed to store session:', err);
            }
          }

          return true;
        } catch (error) {
          debug.error('Login error:', error);
          set({
            isLoading: false,
            error: classifyLoginError(error),
            isAuthenticated: false,
            client: null,
          });
          return false;
        }
      },

      loginWithOAuth: async (serverUrl, code, codeVerifier, redirectUri) => {
        set({ isLoading: true, error: null });

        try {
          const tokenRes = await fetch('/api/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
          });

          if (!tokenRes.ok) {
            throw new Error('token_exchange_failed');
          }

          const { access_token, expires_in } = await tokenRes.json();

          const refreshFn = get().refreshAccessToken;
          const client = JMAPClient.withBearer(serverUrl, access_token, '', () => refreshFn());
          await client.connect();

          const username = client.getUsername();
          const { identities, primaryIdentity } = loadIdentities(await client.getIdentities(), username);
          initializeFeatureStores(client);

          set({
            isAuthenticated: true,
            isLoading: false,
            serverUrl,
            username,
            client,
            identities,
            primaryIdentity,
            authMode: 'oauth',
            accessToken: access_token,
            tokenExpiresAt: Date.now() + expires_in * 1000,
            error: null,
          });

          scheduleRefresh(expires_in, get().refreshAccessToken);

          return true;
        } catch (error) {
          debug.error('OAuth login error:', error);
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'generic',
            isAuthenticated: false,
            client: null,
          });
          return false;
        }
      },

      refreshAccessToken: async () => {
        if (refreshPromise) return refreshPromise;

        refreshPromise = (async () => {
          try {
            const res = await fetch('/api/auth/token', { method: 'PUT' });

            if (!res.ok) {
              markSessionExpired();
              get().logout();
              return null;
            }

            const { access_token, expires_in } = await res.json();

            get().client?.updateAccessToken(access_token);

            set({
              accessToken: access_token,
              tokenExpiresAt: Date.now() + expires_in * 1000,
            });

            scheduleRefresh(expires_in, get().refreshAccessToken);
            return access_token;
          } catch (error) {
            debug.error('Token refresh failed:', error);
            markSessionExpired();
            get().logout();
            return null;
          } finally {
            refreshPromise = null;
          }
        })();

        return refreshPromise;
      },

      logout: () => {
        const state = get();
        const wasOAuth = state.authMode === 'oauth';

        clearRefreshTimer();
        state.client?.disconnect();

        set({
          isAuthenticated: false,
          serverUrl: null,
          username: null,
          client: null,
          identities: [],
          primaryIdentity: null,
          authMode: 'basic',
          rememberMe: false,
          accessToken: null,
          tokenExpiresAt: null,
          error: null,
        });

        localStorage.removeItem('auth-storage');

        useEmailStore.setState({
          emails: [],
          mailboxes: [],
          selectedEmail: null,
          selectedMailbox: "",
          isLoading: false,
          error: null,
          searchQuery: "",
          quota: null,
        });

        useIdentityStore.getState().clearIdentities();
        useContactStore.getState().clearContacts();
        useVacationStore.getState().clearState();
        useCalendarStore.getState().clearState();
        useFilterStore.getState().clearState();

        fetch('/api/auth/session', { method: 'DELETE' }).catch((err) => {
          debug.error('Failed to clear session cookie:', err);
        });

        if (wasOAuth) {
          fetch('/api/auth/token', { method: 'DELETE' })
            .then((res) => {
              if (!res.ok) throw new Error(`Revocation failed: ${res.status}`);
              return res.json();
            })
            .then((data) => {
              if (data.end_session_url) {
                const locale = window.location.pathname.split('/')[1] || 'en';
                const redirectUri = `${window.location.origin}/${locale}/login`;
                const url = new URL(data.end_session_url);
                url.searchParams.set('post_logout_redirect_uri', redirectUri);
                window.location.href = url.toString();
              }
            })
            .catch((err) => {
              debug.error('OAuth logout cleanup failed:', err);
            });
        }
      },

      checkAuth: async () => {
        const state = get();

        if (state.isAuthenticated && !state.client) {
          if (state.authMode === 'oauth' && state.serverUrl) {
            set({ isLoading: true });
            try {
              const token = await get().refreshAccessToken();
              if (token && state.serverUrl) {
                const refreshFn = get().refreshAccessToken;
                const client = JMAPClient.withBearer(state.serverUrl, token, state.username || '', () => refreshFn());
                await client.connect();

                const { identities, primaryIdentity } = loadIdentities(await client.getIdentities(), state.username || '');
                initializeFeatureStores(client);

                set({
                  isAuthenticated: true,
                  isLoading: false,
                  client,
                  identities,
                  primaryIdentity,
                  accessToken: token,
                });
                return;
              }
            } catch (error) {
              debug.error('OAuth session restore failed:', error);
              clearRefreshTimer();
            }
          }

          if (state.authMode === 'basic') {
            set({ isLoading: true });
            try {
              const res = await fetch('/api/auth/session');
              if (res.ok) {
                const data = await res.json();
                if (!data.serverUrl || !data.username || !data.password) {
                  debug.error('Session restore returned incomplete data');
                  throw new Error('Incomplete session data');
                }
                const { serverUrl, username, password } = data;
                const client = new JMAPClient(serverUrl, username, password);
                await client.connect();

                const { identities, primaryIdentity } = loadIdentities(await client.getIdentities(), username);
                initializeFeatureStores(client);

                set({
                  isAuthenticated: true,
                  isLoading: false,
                  serverUrl,
                  username,
                  client,
                  identities,
                  primaryIdentity,
                  authMode: 'basic',
                });
                return;
              }
            } catch (error) {
              debug.error('Basic session restore failed:', error);
            }
          }

          markSessionExpired();

          set({
            isAuthenticated: false,
            isLoading: false,
            client: null,
            serverUrl: null,
            username: null,
            authMode: 'basic',
            rememberMe: false,
            accessToken: null,
            tokenExpiresAt: null,
          });
        }

        set({ isLoading: false });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        username: state.username,
        authMode: state.authMode,
        isAuthenticated: (state.authMode === 'oauth' || state.rememberMe)
          ? state.isAuthenticated
          : undefined,
        rememberMe: state.rememberMe,
      }),
    }
  )
);
