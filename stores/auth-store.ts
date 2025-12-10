import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { JMAPClient } from '@/lib/jmap/client';
import { useEmailStore } from './email-store';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  serverUrl: string | null;
  username: string | null;
  client: JMAPClient | null;

  login: (serverUrl: string, username: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
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

      login: async (serverUrl, username, password) => {
        set({ isLoading: true, error: null });

        try {
          // Create JMAP client
          const client = new JMAPClient(serverUrl, username, password);

          // Try to connect
          await client.connect();

          // Success - save state (but NOT the password)
          set({
            isAuthenticated: true,
            isLoading: false,
            serverUrl,
            username,
            client,
            error: null,
          });

          return true;
        } catch (error) {
          console.error('Login error:', error);
          let errorKey = 'generic';

          // Map common errors to translation keys
          if (error instanceof Error) {
            if (error.message.includes('Invalid username or password') ||
                error.message.includes('401') ||
                error.message.includes('Unauthorized')) {
              errorKey = 'invalid_credentials';
            } else if (error.message.includes('network') ||
                       error.message.includes('Failed to fetch')) {
              errorKey = 'connection_failed';
            }
          }

          set({
            isLoading: false,
            error: errorKey,
            isAuthenticated: false,
            client: null,
          });
          return false;
        }
      },

      logout: () => {
        const state = get();

        // Disconnect the JMAP client if it exists
        if (state.client) {
          state.client.disconnect();
        }

        set({
          isAuthenticated: false,
          serverUrl: null,
          username: null,
          client: null,
          error: null,
        });

        // Clear persisted storage
        localStorage.removeItem('auth-storage');

        // Clear email store state
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
      },

      checkAuth: async () => {
        const state = get();

        // If authenticated but no client (e.g., after page refresh), we can't restore the session
        // because we don't store passwords for security reasons
        if (state.isAuthenticated && !state.client) {
          // Reset auth state - user will need to log in again
          set({
            isAuthenticated: false,
            isLoading: false,
            client: null,
            serverUrl: null,
            username: null,
          });
        }

        // Mark loading as complete
        set({ isLoading: false });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // Only persist non-sensitive data
        serverUrl: state.serverUrl,
        username: state.username,
        // Don't persist isAuthenticated since we can't restore the session without a password
      }),
    }
  )
);