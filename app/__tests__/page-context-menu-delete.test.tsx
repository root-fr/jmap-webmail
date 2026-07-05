import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MouseEventHandler, ReactNode } from 'react';

// Shared, hoisted mock refs (available inside vi.mock factories)
const h = vi.hoisted(() => ({
  emailA: { id: 'a-id', threadId: 'thread-a', subject: 'A', keywords: { '$seen': true } },
  deleteEmail: vi.fn().mockResolvedValue(undefined),
  selectEmail: vi.fn(),
  client: { closePushNotifications: vi.fn() },
}));

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-media-query', () => ({
  useDeviceDetection: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}));
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }));
vi.mock('@/hooks/use-favicon-badge', () => ({ useFaviconBadge: () => {} }));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    client: h.client,
    logout: vi.fn(),
    checkAuth: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
  }),
}));

vi.mock('@/stores/email-store', () => {
  const store = {
    emails: [h.emailA],
    // non-empty mailboxes -> the mount loadData effect is skipped (no client.onStateChange etc.)
    mailboxes: [{ id: 'mb-inbox', role: 'inbox', name: 'Inbox', unreadEmails: 0 }],
    selectedEmail: h.emailA, // email A is "open"
    selectedMailbox: 'mb-inbox',
    quota: null,
    isPushConnected: false,
    newEmailNotification: null,
    selectEmail: h.selectEmail,
    selectMailbox: vi.fn(),
    selectAllEmails: vi.fn(),
    clearSelection: vi.fn(),
    fetchMailboxes: vi.fn(),
    fetchEmails: vi.fn(),
    fetchQuota: vi.fn(),
    sendEmail: vi.fn(),
    deleteEmail: h.deleteEmail,
    markAsRead: vi.fn(),
    toggleStar: vi.fn(),
    moveToMailbox: vi.fn(),
    moveThreadToMailbox: vi.fn(),
    searchEmails: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    isLoading: false,
    isLoadingEmail: false,
    setLoadingEmail: vi.fn(),
    setPushConnected: vi.fn(),
    handleStateChange: vi.fn(),
    refreshCurrentMailbox: vi.fn(),
    clearNewEmailNotification: vi.fn(),
    markAsSpam: vi.fn(),
    undoSpam: vi.fn(),
    searchFilters: {},
    isAdvancedSearchOpen: false,
    setSearchFilters: vi.fn(),
    clearSearchFilters: vi.fn(),
    toggleAdvancedSearch: vi.fn(),
    advancedSearch: vi.fn(),
    fetchTagCounts: vi.fn(),
  };
  const useEmailStore = () => store;
  useEmailStore.getState = () => store;
  return { useEmailStore };
});

vi.mock('@/stores/identity-store', () => ({ useIdentityStore: () => ({ identities: [] }) }));
vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: Object.assign(() => ({}), { getState: () => ({ markAsReadDelay: -1 }) }),
}));
vi.mock('@/stores/ui-store', () => ({
  useUIStore: () => ({
    activeView: 'list',
    sidebarOpen: false,
    setSidebarOpen: vi.fn(),
    setActiveView: vi.fn(),
    tabletListVisible: true,
    setTabletListVisible: vi.fn(),
  }),
}));
vi.mock('@/stores/contact-store', () => ({
  useContactStore: () => ({ supportsSync: false, createContact: vi.fn(), addLocalContact: vi.fn() }),
}));

// EmailList double: fires the page's real onDelete closure with a NON-selected email (B).
vi.mock('@/components/email/email-list', () => ({
  EmailList: (props: { onDelete: (email: { id: string; threadId: string; keywords: object }) => void }) => (
    <button
      data-testid="ctx-delete-b"
      onClick={() => props.onDelete({ id: 'b-id', threadId: 'thread-b', keywords: {} })}
    >
      delete B
    </button>
  ),
}));

const { noop, passthrough } = vi.hoisted(() => ({
  noop: () => null,
  passthrough: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('@/components/layout/sidebar', () => ({ Sidebar: noop }));
// EmailViewer double: mirrors the real toolbar, which wires onClick directly to
// the prop so React invokes the handler with a MouseEvent as the first argument.
vi.mock('@/components/email/email-viewer', () => ({
  EmailViewer: (props: { onDelete: MouseEventHandler<HTMLButtonElement> }) => (
    <button data-testid="viewer-delete" onClick={props.onDelete}>
      viewer delete
    </button>
  ),
}));
vi.mock('@/components/email/email-composer', () => ({ EmailComposer: noop }));
vi.mock('@/components/email/thread-conversation-view', () => ({ ThreadConversationView: noop }));
vi.mock('@/components/layout/mobile-header', () => ({ MobileHeader: noop, MobileViewerHeader: noop }));
vi.mock('@/components/keyboard-shortcuts-modal', () => ({ KeyboardShortcutsModal: noop }));
vi.mock('@/components/layout/navigation-rail', () => ({ NavigationRail: noop }));
vi.mock('@/components/search/advanced-search-panel', () => ({ AdvancedSearchPanel: noop }));
vi.mock('@/components/ui/welcome-banner', () => ({ WelcomeBanner: noop }));
vi.mock('@/contexts/drag-drop-context', () => ({ DragDropProvider: passthrough }));
vi.mock('@/components/error', () => ({
  ErrorBoundary: passthrough,
  SidebarErrorFallback: noop,
  EmailListErrorFallback: noop,
  EmailViewerErrorFallback: noop,
  ComposerErrorFallback: noop,
}));

import Home from '@/app/[locale]/page';

describe('context-menu delete targets the right-clicked email', () => {
  beforeEach(() => h.deleteEmail.mockClear());

  it('deletes the email passed by the context menu, not the open selectedEmail', async () => {
    render(<Home />);
    const btn = await screen.findByTestId('ctx-delete-b');
    fireEvent.click(btn);
    await waitFor(() => expect(h.deleteEmail).toHaveBeenCalled());
    // Regression: on master this is called with h.client, 'a-id' (the stale open email)
    expect(h.deleteEmail).toHaveBeenCalledWith(h.client, 'b-id');
  });

  it('viewer toolbar delete acts on the open email, ignoring the click event', async () => {
    render(<Home />);
    const btn = await screen.findByTestId('viewer-delete');
    fireEvent.click(btn);
    await waitFor(() => expect(h.deleteEmail).toHaveBeenCalled());
    // The toolbar passes a MouseEvent; the handler must fall back to selectedEmail
    // (a-id) rather than treating the event as the email and deleting undefined.
    expect(h.deleteEmail).toHaveBeenCalledWith(h.client, 'a-id');
  });
});
