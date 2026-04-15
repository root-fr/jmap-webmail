import { create } from "zustand";
import { Email, Mailbox, StateChange, ThreadGroup } from "@/lib/jmap/types";
import { JMAPClient } from "@/lib/jmap/client";
import { useSettingsStore } from "@/stores/settings-store";
import { useCalendarStore } from "@/stores/calendar-store";
import { SearchFilters, DEFAULT_SEARCH_FILTERS, buildJMAPFilter, isFilterEmpty } from "@/lib/jmap/search-utils";

interface EmailStore {
  emails: Email[];
  mailboxes: Mailbox[];
  selectedEmail: Email | null;
  selectedMailbox: string;
  isLoading: boolean;
  isLoadingEmail: boolean; // Track when a full email is being fetched
  isLoadingMore: boolean; // Track when loading more emails (pagination)
  error: string | null;
  searchQuery: string;
  quota: { used: number; total: number } | null;
  processingReadStatus: Set<string>; // Track emails being marked as read/unread
  selectedEmailIds: Set<string>; // Track selected emails for batch operations
  lastSelectedIndex: number | null;
  hasMoreEmails: boolean; // Track if more emails are available to load
  totalEmails: number; // Total number of emails in the current mailbox/query
  isPushConnected: boolean; // Track if push notifications are connected
  lastPushUpdate: number | null; // Timestamp of last push update
  newEmailNotification: Email | null; // New email notification for toast

  // Thread expansion state
  expandedThreadIds: Set<string>;
  threadEmailsCache: Map<string, Email[]>;
  isLoadingThread: string | null;

  // Advanced search state
  searchFilters: SearchFilters;
  isAdvancedSearchOpen: boolean;
  searchAbortController: AbortController | null;

  setEmails: (emails: Email[]) => void;
  setMailboxes: (mailboxes: Mailbox[]) => void;
  selectEmail: (email: Email | null) => void;
  selectMailbox: (mailboxId: string) => void;
  setLoading: (loading: boolean) => void;
  setLoadingEmail: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSearchQuery: (query: string) => void;
  setQuota: (quota: { used: number; total: number } | null) => void;
  toggleEmailSelection: (emailId: string, groupIndex?: number) => void;
  selectAllEmails: (threadGroups?: ThreadGroup[]) => void;
  clearSelection: () => void;
  selectRange: (fromIndex: number, toIndex: number, threadGroups: ThreadGroup[]) => void;
  selectByFilter: (filter: string, threadGroups: ThreadGroup[]) => void;

  // JMAP operations
  fetchMailboxes: (client: JMAPClient) => Promise<void>;
  fetchEmails: (client: JMAPClient, mailboxId?: string) => Promise<void>;
  loadMoreEmails: (client: JMAPClient) => Promise<void>;
  fetchEmailContent: (client: JMAPClient, emailId: string) => Promise<Email | null>;
  fetchQuota: (client: JMAPClient) => Promise<void>;
  sendEmail: (client: JMAPClient, to: string[], subject: string, body: string, cc?: string[], bcc?: string[], identityId?: string, fromEmail?: string, draftId?: string, fromName?: string) => Promise<void>;
  deleteEmail: (client: JMAPClient, emailId: string) => Promise<void>;
  markAsRead: (client: JMAPClient, emailId: string, read: boolean) => Promise<void>;
  moveToMailbox: (client: JMAPClient, emailId: string, mailboxId: string) => Promise<void>;
  searchEmails: (client: JMAPClient, query: string) => Promise<void>;
  advancedSearch: (client: JMAPClient) => Promise<void>;
  setSearchFilters: (filters: Partial<SearchFilters>) => void;
  clearSearchFilters: () => void;
  toggleAdvancedSearch: () => void;
  toggleStar: (client: JMAPClient, emailId: string) => Promise<void>;

  // Batch operations
  batchMarkAsRead: (client: JMAPClient, read: boolean) => Promise<void>;
  batchDelete: (client: JMAPClient) => Promise<void>;
  batchMoveToMailbox: (client: JMAPClient, mailboxId: string) => Promise<void>;

  // Spam operations
  spamUndoCache: Map<string, { emailId: string; originalMailboxId: string; accountId?: string }>;
  markAsSpam: (client: JMAPClient, emailId: string) => Promise<void>;
  undoSpam: (client: JMAPClient, emailId: string) => Promise<void>;
  batchMarkAsSpam: (client: JMAPClient, emailIds: string[]) => Promise<void>;
  batchUndoSpam: (client: JMAPClient, emailIds: string[]) => Promise<void>;

  // Push notification handlers
  setPushConnected: (connected: boolean) => void;
  handleStateChange: (change: StateChange, client: JMAPClient) => Promise<void>;
  refreshCurrentMailbox: (client: JMAPClient) => Promise<void>;
  handleNewEmailNotification: (email: Email) => void;
  clearNewEmailNotification: () => void;

  // Thread expansion actions
  toggleThreadExpansion: (threadId: string) => void;
  fetchThreadEmails: (client: JMAPClient, threadId: string) => Promise<Email[]>;
  collapseAllThreads: () => void;
  updateThreadCache: (threadId: string, emails: Email[]) => void;

  // Tag counts
  tagCounts: Record<string, number>;
  fetchTagCounts: (client: JMAPClient) => Promise<void>;

  // Empty folder
  emptyFolder: (client: JMAPClient, mailboxId: string, onProgress?: (deleted: number, total: number) => void) => Promise<void>;

  createMailbox: (client: JMAPClient, name: string, parentId?: string) => Promise<string | null>;
  renameMailbox: (client: JMAPClient, mailboxId: string, newName: string) => Promise<boolean>;
  moveMailbox: (client: JMAPClient, mailboxId: string, newParentId: string | null) => Promise<boolean>;
  deleteMailbox: (client: JMAPClient, mailboxId: string) => Promise<boolean>;

  // Mock data for demo
  loadMockData: () => void;
}

export const useEmailStore = create<EmailStore>((set, get) => ({
  emails: [],
  mailboxes: [],
  selectedEmail: null,
  selectedMailbox: "",
  isLoading: false,
  isLoadingEmail: false,
  isLoadingMore: false,
  error: null,
  searchQuery: "",
  quota: null,
  processingReadStatus: new Set(),
  selectedEmailIds: new Set(),
  lastSelectedIndex: null,
  hasMoreEmails: false,
  totalEmails: 0,
  isPushConnected: false,
  lastPushUpdate: null,
  newEmailNotification: null,

  // Thread expansion state
  expandedThreadIds: new Set(),
  threadEmailsCache: new Map(),
  isLoadingThread: null,

  // Advanced search state
  searchFilters: { ...DEFAULT_SEARCH_FILTERS },
  isAdvancedSearchOpen: false,
  searchAbortController: null,

  // Tag counts
  tagCounts: {},

  // Spam undo cache
  spamUndoCache: new Map(),

  setEmails: (emails) => set({ emails }),
  setMailboxes: (mailboxes) => set({ mailboxes }),
  selectEmail: (email) => set({ selectedEmail: email }),
  selectMailbox: (mailboxId) => set({
    selectedMailbox: mailboxId,
    selectedEmail: null,
    selectedEmailIds: new Set(),
    lastSelectedIndex: null,
    expandedThreadIds: new Set(),
    threadEmailsCache: new Map(),
    isLoadingThread: null,
  }),
  setLoading: (loading) => set({ isLoading: loading }),
  setLoadingEmail: (loading) => set({ isLoadingEmail: loading }),
  setError: (error) => set({ error }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setQuota: (quota) => set({ quota }),

  toggleEmailSelection: (emailId, groupIndex) => {
    const { selectedEmailIds } = get();
    const newSelection = new Set(selectedEmailIds);
    if (newSelection.has(emailId)) {
      newSelection.delete(emailId);
    } else {
      newSelection.add(emailId);
    }
    set({
      selectedEmailIds: newSelection,
      lastSelectedIndex: groupIndex ?? get().lastSelectedIndex,
    });
  },

  selectAllEmails: (threadGroups) => {
    if (threadGroups) {
      const allIds = new Set(threadGroups.map(g => g.latestEmail.id));
      set({ selectedEmailIds: allIds, lastSelectedIndex: null });
    } else {
      const { emails } = get();
      const allIds = new Set(emails.map(e => e.id));
      set({ selectedEmailIds: allIds });
    }
  },

  clearSelection: () => {
    set({ selectedEmailIds: new Set(), lastSelectedIndex: null });
  },

  selectRange: (fromIndex, toIndex, threadGroups) => {
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const { selectedEmailIds } = get();
    const newSelection = new Set(selectedEmailIds);
    for (let i = start; i <= end; i++) {
      const group = threadGroups[i];
      if (group) {
        newSelection.add(group.latestEmail.id);
      }
    }
    set({ selectedEmailIds: newSelection, lastSelectedIndex: toIndex });
  },

  selectByFilter: (filter, threadGroups) => {
    if (filter === 'none') {
      set({ selectedEmailIds: new Set(), lastSelectedIndex: null });
      return;
    }
    if (filter === 'all') {
      const allIds = new Set(threadGroups.map(g => g.latestEmail.id));
      set({ selectedEmailIds: allIds, lastSelectedIndex: null });
      return;
    }
    const newSelection = new Set<string>();
    for (const group of threadGroups) {
      const email = group.latestEmail;
      const seen = !!email.keywords?.$seen;
      const flagged = !!email.keywords?.$flagged;
      const match =
        (filter === 'read' && seen) ||
        (filter === 'unread' && !seen) ||
        (filter === 'starred' && flagged) ||
        (filter === 'unstarred' && !flagged);
      if (match) {
        newSelection.add(email.id);
      }
    }
    set({ selectedEmailIds: newSelection, lastSelectedIndex: null });
  },

  // JMAP operations
  fetchMailboxes: async (client) => {
    if (get().mailboxes.length === 0) {
      set({ isLoading: true, error: null });
    }
    try {
      const mailboxes = await client.getAllMailboxes();

      // Auto-select inbox if no mailbox is currently selected
      const currentSelectedMailbox = get().selectedMailbox;
      if (!currentSelectedMailbox) {
        // Find inbox from PRIMARY account (not shared accounts)
        const inboxMailbox = mailboxes.find(m => m.role === 'inbox' && !m.isShared);
        if (inboxMailbox) {
          set({ mailboxes, selectedMailbox: inboxMailbox.id, isLoading: false });
        } else {
          set({ mailboxes, isLoading: false });
        }
      } else {
        set({ mailboxes, isLoading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to fetch mailboxes",
        isLoading: false
      });
    }
  },

  fetchEmails: async (client, mailboxId) => {
    set({ isLoading: true, error: null }); // Keep previous emails visible during transition
    try {
      const targetMailboxId = mailboxId || get().selectedMailbox;

      // Find the mailbox to get its accountId (for shared folder support)
      const mailboxes = get().mailboxes;
      const mailbox = mailboxes.find(mb => mb.id === targetMailboxId);
      // Only pass accountId for shared mailboxes, not for primary account
      const accountId = mailbox?.isShared ? mailbox.accountId : undefined;
      // Use originalId for JMAP queries (shared mailboxes use namespaced IDs in the store)
      const jmapMailboxId = mailbox?.originalId || targetMailboxId;

      // Get emails per page from settings
      const emailsPerPage = useSettingsStore.getState().emailsPerPage;

      const result = await client.getEmails(jmapMailboxId, accountId, emailsPerPage, 0);
      set({
        emails: result.emails,
        hasMoreEmails: result.hasMore,
        totalEmails: result.total,
        isLoading: false
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to fetch emails",
        isLoading: false,
        emails: [],
        hasMoreEmails: false,
        totalEmails: 0
      });
    }
  },

  loadMoreEmails: async (client) => {
    const { isLoadingMore, hasMoreEmails, emails, selectedMailbox, searchQuery } = get();

    // Don't load if already loading or no more emails
    if (isLoadingMore || !hasMoreEmails) return;

    set({ isLoadingMore: true, error: null });
    try {
      // Get emails per page from settings
      const emailsPerPage = useSettingsStore.getState().emailsPerPage;

      let result;

      const { searchFilters } = get();
      const hasFilters = !isFilterEmpty(searchFilters);

      if (searchQuery || hasFilters) {
        const mailboxes = get().mailboxes;
        const mailbox = mailboxes.find(mb => mb.id === selectedMailbox);
        const jmapMailboxId = mailbox?.originalId || selectedMailbox;
        const accountId = mailbox?.isShared ? mailbox.accountId : undefined;

        if (hasFilters) {
          const filter = buildJMAPFilter(searchQuery, searchFilters, jmapMailboxId);
          result = await client.advancedSearchEmails(filter, accountId, emailsPerPage, emails.length);
        } else {
          result = await client.searchEmails(searchQuery, jmapMailboxId, accountId, emailsPerPage, emails.length);
        }
      } else {
        // Load more from mailbox
        // Find the mailbox to get its accountId (for shared folder support)
        const mailboxes = get().mailboxes;
        const mailbox = mailboxes.find(mb => mb.id === selectedMailbox);
        // Only pass accountId for shared mailboxes, not for primary account
        const accountId = mailbox?.isShared ? mailbox.accountId : undefined;
        // Use originalId for JMAP queries (shared mailboxes use namespaced IDs in the store)
        const jmapMailboxId = mailbox?.originalId || selectedMailbox;

        result = await client.getEmails(jmapMailboxId, accountId, emailsPerPage, emails.length);
      }

      set({
        emails: [...emails, ...result.emails],
        hasMoreEmails: result.hasMore,
        totalEmails: result.total,
        isLoadingMore: false
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to load more emails",
        isLoadingMore: false
      });
    }
  },

  fetchEmailContent: async (client, emailId) => {
    try {
      // Find the selected mailbox to determine accountId (for shared folders)
      const selectedMailboxId = get().selectedMailbox;
      const mailboxes = get().mailboxes;
      const mailbox = mailboxes.find(mb => mb.id === selectedMailboxId);

      // Only pass accountId for shared mailboxes
      const accountId = mailbox?.isShared ? mailbox.accountId : undefined;

      const email = await client.getEmail(emailId, accountId);

      if (email) {
        set({ selectedEmail: email });
      }
      return email;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to fetch email content"
      });
      return null;
    }
  },

  fetchQuota: async (client) => {
    try {
      const quota = await client.getQuota();
      set({ quota });
    } catch {
      // Don't set error state as quota is optional
    }
  },

  sendEmail: async (client, to, subject, body, cc, bcc, identityId, fromEmail, draftId, fromName) => {
    set({ error: null });
    try {
      await client.sendEmail(to, subject, body, cc, bcc, identityId, fromEmail, draftId, fromName);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to send email",
      });
      throw error;
    }
  },

  deleteEmail: async (client, emailId) => {
    try {
      // Get the email to check if it's unread and which mailboxes it belongs to
      const email = get().emails.find(e => e.id === emailId);
      if (!email) return;

      const isUnread = !email.keywords?.$seen;

      // Get delete action preference from settings
      const deleteAction = useSettingsStore.getState().deleteAction;

      // Determine accountId for shared folders
      const selectedMailboxId = get().selectedMailbox;
      const mailboxes = get().mailboxes;
      const currentMailbox = mailboxes.find(mb => mb.id === selectedMailboxId);
      const accountId = currentMailbox?.isShared ? currentMailbox.accountId : undefined;

      // If deleteAction is 'trash', try to move to trash mailbox
      if (deleteAction === 'trash') {
        // Find trash mailbox for the correct account
        const trashMailbox = mailboxes.find(mb => {
          if (accountId) {
            // For shared folders, match by accountId
            return mb.role === 'trash' && mb.accountId === accountId;
          }
          // For primary account, find trash that's not from a shared folder
          return mb.role === 'trash' && !mb.isShared;
        });

        if (trashMailbox) {
          // Use originalId for shared mailboxes if available
          const trashId = trashMailbox.originalId || trashMailbox.id;
          await client.moveToTrash(emailId, trashId, accountId);

          // Remove from local state (email moved to trash, not in current view)
          set((state) => {
            let updatedMailboxes = state.mailboxes;

            // Update counters for source mailbox (email leaving)
            if (email.mailboxIds) {
              updatedMailboxes = state.mailboxes.map(mailbox => {
                if (email.mailboxIds[mailbox.id]) {
                  return {
                    ...mailbox,
                    totalEmails: Math.max(0, mailbox.totalEmails - 1),
                    unreadEmails: isUnread ? Math.max(0, mailbox.unreadEmails - 1) : mailbox.unreadEmails,
                    totalThreads: Math.max(0, mailbox.totalThreads - 1),
                    unreadThreads: isUnread ? Math.max(0, mailbox.unreadThreads - 1) : mailbox.unreadThreads
                  };
                }
                // Update trash mailbox counters (email arriving)
                if (mailbox.id === trashMailbox.id) {
                  return {
                    ...mailbox,
                    totalEmails: mailbox.totalEmails + 1,
                    unreadEmails: isUnread ? mailbox.unreadEmails + 1 : mailbox.unreadEmails,
                    totalThreads: mailbox.totalThreads + 1,
                    unreadThreads: isUnread ? mailbox.unreadThreads + 1 : mailbox.unreadThreads
                  };
                }
                return mailbox;
              });
            }

            return {
              emails: state.emails.filter(e => e.id !== emailId),
              selectedEmail: state.selectedEmail?.id === emailId ? null : state.selectedEmail,
              mailboxes: updatedMailboxes
            };
          });
          return;
        }
        // If no trash mailbox found, fall through to permanent delete
      }

      // Permanent delete
      await client.deleteEmail(emailId);

      // Remove from local state and update mailbox counters if needed
      set((state) => {
        let updatedMailboxes = state.mailboxes;

        // If the email was unread, decrement the unread counters
        if (isUnread && email.mailboxIds) {
          updatedMailboxes = state.mailboxes.map(mailbox => {
            if (email.mailboxIds[mailbox.id]) {
              return {
                ...mailbox,
                totalEmails: Math.max(0, mailbox.totalEmails - 1),
                unreadEmails: Math.max(0, mailbox.unreadEmails - 1),
                totalThreads: Math.max(0, mailbox.totalThreads - 1),
                unreadThreads: Math.max(0, mailbox.unreadThreads - 1)
              };
            }
            return mailbox;
          });
        } else if (email.mailboxIds) {
          // If email was read, only decrement total counters
          updatedMailboxes = state.mailboxes.map(mailbox => {
            if (email.mailboxIds[mailbox.id]) {
              return {
                ...mailbox,
                totalEmails: Math.max(0, mailbox.totalEmails - 1),
                totalThreads: Math.max(0, mailbox.totalThreads - 1)
              };
            }
            return mailbox;
          });
        }

        return {
          emails: state.emails.filter(e => e.id !== emailId),
          selectedEmail: state.selectedEmail?.id === emailId ? null : state.selectedEmail,
          mailboxes: updatedMailboxes
        };
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to delete email"
      });
      throw error;
    }
  },

  markAsRead: async (client, emailId, read) => {
    try {
      // Check if this email is already being processed
      const processingKey = `${emailId}-${read}`;
      const currentProcessing = get().processingReadStatus;
      if (currentProcessing.has(processingKey)) {
        return; // Already being processed
      }

      // Get the email to check its current state and mailboxes
      const email = get().emails.find(e => e.id === emailId);
      if (!email) return;

      // Check if already in the desired state
      const isCurrentlyRead = email.keywords?.$seen === true;
      if (isCurrentlyRead === read) {
        return; // Already in desired state
      }

      // Add to processing set
      set((state) => ({
        processingReadStatus: new Set([...state.processingReadStatus, processingKey])
      }));

      // Determine accountId for shared folders
      const selectedMailboxId = get().selectedMailbox;
      const mailboxes = get().mailboxes;
      const mailbox = mailboxes.find(mb => mb.id === selectedMailboxId);
      const accountId = mailbox?.isShared ? mailbox.accountId : undefined;

      await client.markAsRead(emailId, read, accountId);

      // Update local state including mailbox counters
      set((state) => {
        // Remove from processing set
        const newProcessingSet = new Set(state.processingReadStatus);
        newProcessingSet.delete(processingKey);

        // Only update counters if the state is actually changing
        const emailInState = state.emails.find(e => e.id === emailId);
        if (!emailInState) return { processingReadStatus: newProcessingSet };

        const wasRead = emailInState.keywords?.$seen === true;
        if (wasRead === read) {
          return { processingReadStatus: newProcessingSet }; // State unchanged, skip counter update
        }

        const updatedMailboxes = state.mailboxes.map(mailbox => {
          // Check if this email belongs to this mailbox
          if (emailInState.mailboxIds && emailInState.mailboxIds[mailbox.id]) {
            // Adjust unread counter: -1 if marking as read, +1 if marking as unread
            const delta = read ? -1 : 1;
            return {
              ...mailbox,
              unreadEmails: Math.max(0, mailbox.unreadEmails + delta),
              unreadThreads: Math.max(0, mailbox.unreadThreads + delta)
            };
          }
          return mailbox;
        });

        return {
          emails: state.emails.map(e =>
            e.id === emailId ? { ...e, keywords: { ...e.keywords, $seen: read } } : e
          ),
          selectedEmail: state.selectedEmail?.id === emailId
            ? { ...state.selectedEmail, keywords: { ...state.selectedEmail.keywords, $seen: read } }
            : state.selectedEmail,
          mailboxes: updatedMailboxes,
          processingReadStatus: newProcessingSet
        };
      });
    } catch (error) {
      // Remove from processing set on error
      set((state) => {
        const newProcessingSet = new Set(state.processingReadStatus);
        newProcessingSet.delete(`${emailId}-${read}`);
        return {
          processingReadStatus: newProcessingSet,
          error: error instanceof Error ? error.message : "Failed to update email"
        };
      });
      throw error;
    }
  },

  moveToMailbox: async (client, emailId, destinationMailboxId) => {
    try {
      const email = get().emails.find(e => e.id === emailId);
      if (!email) return;

      const isUnread = !email.keywords?.$seen;
      const currentMailboxIds = email.mailboxIds ? Object.keys(email.mailboxIds) : [];

      const { selectedMailbox, mailboxes } = get();
      const currentMailbox = mailboxes.find(mb => mb.id === selectedMailbox);
      const accountId = currentMailbox?.isShared ? currentMailbox.accountId : undefined;

      const destMailbox = mailboxes.find(mb => mb.id === destinationMailboxId);
      const jmapDestId = destMailbox?.originalId || destinationMailboxId;

      await client.moveEmail(emailId, jmapDestId, accountId);

      set((state) => {
        const updatedMailboxes = state.mailboxes.map(mailbox => {
          if (currentMailboxIds.includes(mailbox.id)) {
            return {
              ...mailbox,
              totalEmails: Math.max(0, mailbox.totalEmails - 1),
              unreadEmails: isUnread ? Math.max(0, mailbox.unreadEmails - 1) : mailbox.unreadEmails,
              totalThreads: Math.max(0, mailbox.totalThreads - 1),
              unreadThreads: isUnread ? Math.max(0, mailbox.unreadThreads - 1) : mailbox.unreadThreads
            };
          }
          if (mailbox.id === destinationMailboxId) {
            return {
              ...mailbox,
              totalEmails: mailbox.totalEmails + 1,
              unreadEmails: isUnread ? mailbox.unreadEmails + 1 : mailbox.unreadEmails,
              totalThreads: mailbox.totalThreads + 1,
              unreadThreads: isUnread ? mailbox.unreadThreads + 1 : mailbox.unreadThreads
            };
          }
          return mailbox;
        });

        return {
          emails: state.emails.filter(e => e.id !== emailId),
          selectedEmail: state.selectedEmail?.id === emailId ? null : state.selectedEmail,
          mailboxes: updatedMailboxes
        };
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to move email"
      });
      throw error;
    }
  },

  searchEmails: async (client, query) => {
    set({ isLoading: true, error: null, searchQuery: query, emails: [], hasMoreEmails: false, totalEmails: 0 }); // Clear emails for loading state
    try {
      // Get the current mailbox to scope the search
      const selectedMailbox = get().selectedMailbox;
      const mailboxes = get().mailboxes;
      const mailbox = mailboxes.find(mb => mb.id === selectedMailbox);
      // Use originalId for shared mailboxes
      const jmapMailboxId = mailbox?.originalId || selectedMailbox;
      // Only pass accountId for shared mailboxes, not for primary account
      const accountId = mailbox?.isShared ? mailbox.accountId : undefined;

      // Get emails per page from settings
      const emailsPerPage = useSettingsStore.getState().emailsPerPage;
      const result = await client.searchEmails(query, jmapMailboxId, accountId, emailsPerPage, 0);
      set({
        emails: result.emails,
        hasMoreEmails: result.hasMore,
        totalEmails: result.total,
        isLoading: false
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to search emails",
        isLoading: false,
        emails: [],
        hasMoreEmails: false,
        totalEmails: 0
      });
    }
  },

  advancedSearch: async (client) => {
    const { searchQuery, searchFilters, selectedMailbox, mailboxes, searchAbortController } = get();

    if (searchAbortController) {
      searchAbortController.abort();
    }

    const controller = new AbortController();
    set({
      isLoading: true,
      error: null,
      emails: [],
      hasMoreEmails: false,
      totalEmails: 0,
      searchAbortController: controller,
    });

    try {
      const mailbox = mailboxes.find(mb => mb.id === selectedMailbox);
      const jmapMailboxId = mailbox?.originalId || selectedMailbox;
      const accountId = mailbox?.isShared ? mailbox.accountId : undefined;

      const filter = buildJMAPFilter(searchQuery, searchFilters, jmapMailboxId);
      const emailsPerPage = useSettingsStore.getState().emailsPerPage;
      const result = await client.advancedSearchEmails(filter, accountId, emailsPerPage, 0);

      if (controller.signal.aborted) return;

      set({
        emails: result.emails,
        hasMoreEmails: result.hasMore,
        totalEmails: result.total,
        isLoading: false,
        searchAbortController: null,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      set({
        error: error instanceof Error ? error.message : "Failed to search emails",
        isLoading: false,
        emails: [],
        hasMoreEmails: false,
        totalEmails: 0,
        searchAbortController: null,
      });
    }
  },

  setSearchFilters: (filters) => {
    set((state) => ({
      searchFilters: { ...state.searchFilters, ...filters },
    }));
  },

  clearSearchFilters: () => {
    set({ searchFilters: { ...DEFAULT_SEARCH_FILTERS } });
  },

  toggleAdvancedSearch: () => {
    set((state) => ({ isAdvancedSearchOpen: !state.isAdvancedSearchOpen }));
  },

  toggleStar: async (client, emailId) => {
    try {
      const email = get().emails.find(e => e.id === emailId);
      if (!email) return;

      const isFlagged = email.keywords.$flagged || false;
      await client.toggleStar(emailId, !isFlagged);

      // Update local state
      set((state) => ({
        emails: state.emails.map(e =>
          e.id === emailId ? { ...e, keywords: { ...e.keywords, $flagged: !isFlagged } } : e
        ),
        selectedEmail: state.selectedEmail?.id === emailId
          ? { ...state.selectedEmail, keywords: { ...state.selectedEmail.keywords, $flagged: !isFlagged } }
          : state.selectedEmail
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to update star"
      });
      throw error;
    }
  },

  // Batch operations
  batchMarkAsRead: async (client, read) => {
    const { selectedEmailIds, emails, mailboxes } = get();
    if (selectedEmailIds.size === 0) return;

    set({ error: null });
    try {
      const emailIdsArray = Array.from(selectedEmailIds);
      await client.batchMarkAsRead(emailIdsArray, read);

      // Update local state
      const updatedEmails = emails.map(email =>
        selectedEmailIds.has(email.id)
          ? { ...email, keywords: { ...email.keywords, $seen: read } }
          : email
      );

      // Update mailbox counters
      const affectedEmails = emails.filter(e => selectedEmailIds.has(e.id));
      const updatedMailboxes = mailboxes.map(mailbox => {
        let deltaUnread = 0;
        affectedEmails.forEach(email => {
          if (email.mailboxIds?.[mailbox.id]) {
            const wasRead = email.keywords?.$seen === true;
            if (wasRead !== read) {
              deltaUnread += read ? -1 : 1;
            }
          }
        });

        return {
          ...mailbox,
          unreadEmails: Math.max(0, mailbox.unreadEmails + deltaUnread),
          unreadThreads: Math.max(0, mailbox.unreadThreads + deltaUnread)
        };
      });

      set({
        emails: updatedEmails,
        mailboxes: updatedMailboxes,
        selectedEmailIds: new Set(),
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to update emails",
      });
    }
  },

  batchDelete: async (client) => {
    const { selectedEmailIds, emails, mailboxes } = get();
    if (selectedEmailIds.size === 0) return;

    set({ error: null });
    try {
      const emailIdsArray = Array.from(selectedEmailIds);
      await client.batchDeleteEmails(emailIdsArray);

      // Remove deleted emails from local state
      const remainingEmails = emails.filter(e => !selectedEmailIds.has(e.id));

      // Update mailbox counters
      const deletedEmails = emails.filter(e => selectedEmailIds.has(e.id));
      const updatedMailboxes = mailboxes.map(mailbox => {
        let deltaTotalEmails = 0;
        let deltaUnreadEmails = 0;

        deletedEmails.forEach(email => {
          if (email.mailboxIds?.[mailbox.id]) {
            deltaTotalEmails--;
            if (!email.keywords?.$seen) {
              deltaUnreadEmails--;
            }
          }
        });

        return {
          ...mailbox,
          totalEmails: Math.max(0, mailbox.totalEmails + deltaTotalEmails),
          unreadEmails: Math.max(0, mailbox.unreadEmails + deltaUnreadEmails),
          totalThreads: Math.max(0, mailbox.totalThreads + deltaTotalEmails),
          unreadThreads: Math.max(0, mailbox.unreadThreads + deltaUnreadEmails)
        };
      });

      set({
        emails: remainingEmails,
        mailboxes: updatedMailboxes,
        selectedEmailIds: new Set(),
        selectedEmail: null,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to delete emails",
      });
    }
  },

  batchMoveToMailbox: async (client, toMailboxId) => {
    const { selectedEmailIds, emails } = get();
    if (selectedEmailIds.size === 0) return;

    set({ error: null });
    try {
      const emailIdsArray = Array.from(selectedEmailIds);
      await client.batchMoveEmails(emailIdsArray, toMailboxId);

      // Update local state - remove from current view since they moved
      const remainingEmails = emails.filter(e => !selectedEmailIds.has(e.id));

      set({
        emails: remainingEmails,
        selectedEmailIds: new Set(),
      });

      // Silent refresh to sync with server
      await get().refreshCurrentMailbox(client);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to move emails",
      });
    }
  },

  // Spam operations
  markAsSpam: async (client, emailId) => {
    const { selectedMailbox, mailboxes, emails } = get();
    const email = emails.find(e => e.id === emailId);
    if (!email) return;

    const currentMailbox = mailboxes.find(m => m.id === selectedMailbox);
    if (!currentMailbox) return;

    get().spamUndoCache.set(emailId, {
      emailId,
      originalMailboxId: currentMailbox.originalId || currentMailbox.id,
      accountId: currentMailbox.accountId,
    });

    await client.markAsSpam(emailId, currentMailbox.accountId);

    set(state => ({
      emails: state.emails.filter(e => e.id !== emailId),
      selectedEmail: state.selectedEmail?.id === emailId ? null : state.selectedEmail,
    }));

    const currentIndex = emails.findIndex(e => e.id === emailId);
    if (currentIndex >= 0 && currentIndex < emails.length - 1) {
      set({ selectedEmail: emails[currentIndex + 1] });
    }
  },

  undoSpam: async (client, emailId) => {
    const { mailboxes, selectedMailbox } = get();

    // Try cache first (preserves exact original mailbox for toast undo)
    const cachedData = get().spamUndoCache.get(emailId);

    let targetMailboxId: string;
    let accountId: string | undefined;

    if (cachedData) {
      // Use cached original mailbox (more accurate for immediate undo)
      targetMailboxId = cachedData.originalMailboxId;
      accountId = cachedData.accountId;
      get().spamUndoCache.delete(emailId);
    } else {
      // Fall back to finding Inbox (generic "not spam" button/menu)
      const currentMailbox = mailboxes.find(m => m.id === selectedMailbox);
      accountId = currentMailbox?.accountId;

      // Find inbox in same account
      const inboxMailbox = mailboxes.find(m =>
        m.role === 'inbox' &&
        (accountId ? m.accountId === accountId : !m.accountId)
      );

      if (!inboxMailbox) {
        throw new Error('Inbox not found');
      }

      targetMailboxId = inboxMailbox.originalId || inboxMailbox.id;
    }

    await client.undoSpam(emailId, targetMailboxId, accountId);
    await get().fetchEmails(client, selectedMailbox);
  },

  batchMarkAsSpam: async (client, emailIds) => {
    const { selectedMailbox, mailboxes } = get();

    const currentMailbox = mailboxes.find(m => m.id === selectedMailbox);
    if (!currentMailbox) return;

    for (const emailId of emailIds) {
      await client.markAsSpam(emailId, currentMailbox.accountId);
    }

    set(state => ({
      emails: state.emails.filter(e => !emailIds.includes(e.id)),
      selectedEmail: emailIds.includes(state.selectedEmail?.id || '') ? null : state.selectedEmail,
      selectedEmailIds: new Set(),
    }));
  },

  batchUndoSpam: async (client: JMAPClient, emailIds: string[]) => {
    const { mailboxes, selectedMailbox } = get();

    // Find inbox (batch operations don't preserve original mailboxes)
    const currentMailbox = mailboxes.find(m => m.id === selectedMailbox);
    const accountId = currentMailbox?.accountId;

    const inboxMailbox = mailboxes.find(m =>
      m.role === 'inbox' &&
      (accountId ? m.accountId === accountId : !m.accountId)
    );

    if (!inboxMailbox) {
      throw new Error('Inbox not found');
    }

    for (const emailId of emailIds) {
      await client.undoSpam(emailId, inboxMailbox.originalId || inboxMailbox.id, accountId);
    }

    set(state => ({
      emails: state.emails.filter(e => !emailIds.includes(e.id)),
      selectedEmail: emailIds.includes(state.selectedEmail?.id || '') ? null : state.selectedEmail,
      selectedEmailIds: new Set(),
    }));
  },

  // Push notification handlers
  setPushConnected: (connected) => {
    set({ isPushConnected: connected });
  },

  handleStateChange: async (change, client) => {
    try {
      // Update last push update timestamp
      set({ lastPushUpdate: Date.now() });

      // Get the current account ID from the client (assuming primary account)
      const accountId = client.getAccountId();

      // Check if there are changes for this account
      const accountChanges = change.changed[accountId];
      if (!accountChanges) return;

      // Handle Email state changes - refresh current mailbox and mailbox counts
      if (accountChanges.Email) {
        await get().refreshCurrentMailbox(client);
        get().fetchTagCounts(client);
        get().fetchMailboxes(client);
      }

      // Handle Mailbox state changes - refresh mailbox list
      if (accountChanges.Mailbox && !accountChanges.Email) {
        await get().fetchMailboxes(client);
      }

      // Handle Calendar/CalendarEvent state changes - refresh calendar data
      if (accountChanges.Calendar || accountChanges.CalendarEvent) {
        const calendarStore = useCalendarStore.getState();
        if (calendarStore.supportsCalendar) {
          calendarStore.fetchCalendars(client);
          const { dateRange, selectedCalendarIds } = calendarStore;
          if (dateRange && selectedCalendarIds.length > 0) {
            calendarStore.fetchEvents(client, dateRange.start, dateRange.end);
          }
        }
      }

      // Handle SieveScript state changes - refresh filter rules
      if (accountChanges.SieveScript) {
        const { useFilterStore } = await import('./filter-store');
        const filterStore = useFilterStore.getState();
        if (filterStore.isSupported) {
          filterStore.fetchFilters(client).catch(() => {});
        }
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to handle push notification"
      });
    }
  },

  refreshCurrentMailbox: async (client) => {
    const { selectedMailbox } = get();

    // Only refresh if a mailbox is currently selected
    if (!selectedMailbox) return;

    try {
      // Fetch emails for the current mailbox without clearing the list first
      // This provides a smoother update experience
      const mailboxes = get().mailboxes;
      const mailbox = mailboxes.find(mb => mb.id === selectedMailbox);
      const accountId = mailbox?.isShared ? mailbox.accountId : undefined;
      const jmapMailboxId = mailbox?.originalId || selectedMailbox;

      // Get emails per page from settings
      const emailsPerPage = useSettingsStore.getState().emailsPerPage;

      const result = await client.getEmails(jmapMailboxId, accountId, emailsPerPage, 0);

      const currentEmails = get().emails;

      // Check if there are new emails by comparing the first email ID
      const currentFirstEmailId = currentEmails[0]?.id;
      const newFirstEmailId = result.emails[0]?.id;

      // If the first email changed, we have a new email - trigger notification
      if (currentFirstEmailId !== newFirstEmailId && result.emails[0]) {
        get().handleNewEmailNotification(result.emails[0]);
      }

      // Skip state update if emails haven't actually changed to avoid
      // unnecessary re-renders that cause a visible list flicker
      const hasChanged =
        currentEmails.length !== result.emails.length ||
        result.emails.some((email, i) => {
          const curr = currentEmails[i];
          return (
            curr.id !== email.id ||
            curr.threadId !== email.threadId ||
            JSON.stringify(curr.keywords) !== JSON.stringify(email.keywords)
          );
        });

      if (hasChanged) {
        set({
          emails: result.emails,
          hasMoreEmails: result.hasMore,
          totalEmails: result.total,
        });
      }
    } catch { /* silent: push refresh is best-effort */ }
  },

  handleNewEmailNotification: (email) => {
    // Set the new email notification state
    // This can be consumed by a toast component
    set({ newEmailNotification: email });
  },

  clearNewEmailNotification: () => {
    set({ newEmailNotification: null });
  },

  // Thread expansion actions
  toggleThreadExpansion: (threadId) => {
    const { expandedThreadIds } = get();
    const newExpandedThreadIds = new Set(expandedThreadIds);

    if (newExpandedThreadIds.has(threadId)) {
      newExpandedThreadIds.delete(threadId);
    } else {
      newExpandedThreadIds.add(threadId);
    }

    set({ expandedThreadIds: newExpandedThreadIds });
  },

  fetchThreadEmails: async (client, threadId) => {
    const { threadEmailsCache, selectedMailbox, mailboxes } = get();

    // Check if we already have this thread cached
    const cachedEmails = threadEmailsCache.get(threadId);
    if (cachedEmails && cachedEmails.length > 0) {
      return cachedEmails;
    }

    // Set loading state
    set({ isLoadingThread: threadId });

    try {
      // Determine accountId for shared folders
      const mailbox = mailboxes.find(mb => mb.id === selectedMailbox);
      const accountId = mailbox?.isShared ? mailbox.accountId : undefined;

      // Fetch all emails in the thread
      const emails = await client.getThreadEmails(threadId, accountId);

      // Update cache
      const newCache = new Map(get().threadEmailsCache);
      newCache.set(threadId, emails);

      set({
        threadEmailsCache: newCache,
        isLoadingThread: null
      });

      return emails;
    } catch {
      set({ isLoadingThread: null });
      return [];
    }
  },

  collapseAllThreads: () => {
    set({
      expandedThreadIds: new Set(),
      isLoadingThread: null
    });
  },

  updateThreadCache: (threadId, emails) => {
    const newCache = new Map(get().threadEmailsCache);
    newCache.set(threadId, emails);
    set({ threadEmailsCache: newCache });
  },

  fetchTagCounts: async (client) => {
    try {
      const tags = ["red", "orange", "yellow", "green", "blue", "purple", "pink"];
      const tagCounts = await client.queryTagCounts(tags);
      set({ tagCounts });
    } catch { /* silent: tag counts are non-critical */ }
  },

  emptyFolder: async (client, mailboxId, onProgress) => {
    const mailboxes = get().mailboxes;
    const mailbox = mailboxes.find(mb => mb.id === mailboxId);
    const jmapMailboxId = mailbox?.originalId || mailboxId;

    let totalDeleted = 0;
    let totalEmails = 0;

    const firstBatch = await client.queryMailboxEmailIds(jmapMailboxId, 500, 0);
    totalEmails = firstBatch.total;

    if (totalEmails === 0) return;

    let ids = firstBatch.ids;

    while (ids.length > 0) {
      try {
        await client.batchDeleteEmails(ids);
        totalDeleted += ids.length;
        onProgress?.(totalDeleted, totalEmails);
      } catch {
        throw new Error(`Deleted ${totalDeleted} of ${totalEmails} emails before failure`);
      }

      if (totalDeleted >= totalEmails) break;

      const nextBatch = await client.queryMailboxEmailIds(jmapMailboxId, 500, 0);
      ids = nextBatch.ids;
      if (ids.length === 0) break;
    }

    await get().fetchMailboxes(client);
    if (get().selectedMailbox === mailboxId) {
      set({ emails: [], totalEmails: 0, hasMoreEmails: false });
    }
  },

  createMailbox: async (client, name, parentId) => {
    const tempId = `temp-${Date.now()}`;
    const mailboxes = get().mailboxes;

    const tempMailbox: Mailbox = {
      id: tempId,
      name,
      parentId: parentId || undefined,
      sortOrder: 999,
      totalEmails: 0,
      unreadEmails: 0,
      totalThreads: 0,
      unreadThreads: 0,
      myRights: {
        mayReadItems: true, mayAddItems: true, mayRemoveItems: true,
        maySetSeen: true, maySetKeywords: true, mayCreateChild: true,
        mayRename: true, mayDelete: true, maySubmit: false,
      },
      isSubscribed: true,
    };

    set({ mailboxes: [...mailboxes, tempMailbox] });

    try {
      const realId = await client.createMailbox(name, parentId);

      set((state) => {
        const updated = state.mailboxes.map(mb =>
          mb.id === tempId ? { ...mb, id: realId } : mb
        );
        const newState: Partial<EmailStore> = { mailboxes: updated };
        if (state.selectedMailbox === tempId) {
          newState.selectedMailbox = realId;
        }
        return newState;
      });

      return realId;
    } catch (error) {
      set({ mailboxes: get().mailboxes.filter(mb => mb.id !== tempId) });
      throw error;
    }
  },

  renameMailbox: async (client, mailboxId, newName) => {
    const mailboxes = get().mailboxes;
    const mailbox = mailboxes.find(mb => mb.id === mailboxId);
    if (!mailbox) return false;

    const previousName = mailbox.name;
    const jmapId = mailbox.originalId || mailboxId;

    set({
      mailboxes: mailboxes.map(mb =>
        mb.id === mailboxId ? { ...mb, name: newName } : mb
      ),
    });

    try {
      await client.updateMailbox(jmapId, { name: newName });
      return true;
    } catch (error) {
      set({
        mailboxes: get().mailboxes.map(mb =>
          mb.id === mailboxId ? { ...mb, name: previousName } : mb
        ),
      });
      throw error;
    }
  },

  moveMailbox: async (client, mailboxId, newParentId) => {
    const mailboxes = get().mailboxes;
    const mailbox = mailboxes.find(mb => mb.id === mailboxId);
    if (!mailbox) return false;

    const previousParentId = mailbox.parentId;
    const jmapId = mailbox.originalId || mailboxId;

    set({
      mailboxes: mailboxes.map(mb =>
        mb.id === mailboxId ? { ...mb, parentId: newParentId || undefined } : mb
      ),
    });

    try {
      await client.updateMailbox(jmapId, { parentId: newParentId });
      return true;
    } catch (error) {
      set({
        mailboxes: get().mailboxes.map(mb =>
          mb.id === mailboxId ? { ...mb, parentId: previousParentId } : mb
        ),
      });
      throw error;
    }
  },

  deleteMailbox: async (client, mailboxId) => {
    const mailboxes = get().mailboxes;
    const mailbox = mailboxes.find(mb => mb.id === mailboxId);
    if (!mailbox) return false;

    if (get().selectedMailbox === mailboxId) {
      const inbox = mailboxes.find(mb => mb.role === 'inbox');
      if (inbox) set({ selectedMailbox: inbox.id });
    }

    const collectDescendants = (parentId: string): Mailbox[] => {
      const children = mailboxes.filter(mb => mb.parentId === parentId);
      const descendants: Mailbox[] = [];
      for (const child of children) {
        descendants.push(...collectDescendants(child.id));
        descendants.push(child);
      }
      return descendants;
    };

    const descendants = collectDescendants(mailboxId);
    const allToDelete = [...descendants, mailbox];
    const allIds = new Set(allToDelete.map(mb => mb.id));

    const trashMailbox = mailboxes.find(mb => mb.role === 'trash');
    const trashId = trashMailbox?.originalId || trashMailbox?.id;

    set({ mailboxes: mailboxes.filter(mb => !allIds.has(mb.id)) });

    try {
      for (const mb of allToDelete) {
        const jmapId = mb.originalId || mb.id;

        if (trashId && mb.totalEmails > 0) {
          let position = 0;
          while (true) {
            const batch = await client.queryMailboxEmailIds(jmapId, 500, position);
            if (batch.ids.length === 0) break;
            await client.batchMoveEmails(batch.ids, trashId);
            if (batch.ids.length < 500) break;
            position = 0;
          }
        }

        await client.destroyMailbox(jmapId);
      }

      await get().fetchMailboxes(client);
      return true;
    } catch (error) {
      await get().fetchMailboxes(client);
      throw error;
    }
  },

  loadMockData: () => {
    const mockEmails: Email[] = [
      {
        id: "1",
        threadId: "thread-1",
        mailboxIds: { inbox: true },
        keywords: { $seen: false },
        size: 1024,
        receivedAt: new Date().toISOString(),
        from: [{ name: "Alice Johnson", email: "alice@example.com" }],
        to: [{ email: "you@example.com" }],
        subject: "Q4 Budget Review Meeting",
        preview: "Hi team, I wanted to schedule a meeting to review our Q4 budget projections. Are you available this Thursday at 2 PM? We need to discuss...",
        hasAttachment: true,
      },
      {
        id: "2",
        threadId: "thread-2",
        mailboxIds: { inbox: true },
        keywords: { $seen: true, $flagged: true },
        size: 512,
        receivedAt: new Date(Date.now() - 3600000).toISOString(),
        from: [{ name: "Bob Smith", email: "bob@company.com" }],
        to: [{ email: "you@example.com" }],
        subject: "Re: Project Timeline Update",
        preview: "Thanks for the update. The new timeline looks good to me. I've reviewed the milestones and everything seems achievable...",
        hasAttachment: false,
      },
      {
        id: "3",
        threadId: "thread-3",
        mailboxIds: { inbox: true },
        keywords: { $seen: false },
        size: 2048,
        receivedAt: new Date(Date.now() - 7200000).toISOString(),
        from: [{ name: "Carol White", email: "carol@design.co" }],
        to: [{ email: "you@example.com" }],
        subject: "New Design Mockups Ready",
        preview: "Hey! The new mockups for the landing page are ready for review. I've incorporated all the feedback from last week's meeting...",
        hasAttachment: true,
      },
      {
        id: "4",
        threadId: "thread-4",
        mailboxIds: { inbox: true },
        keywords: { $seen: true },
        size: 768,
        receivedAt: new Date(Date.now() - 86400000).toISOString(),
        from: [{ name: "GitHub", email: "notifications@github.com" }],
        to: [{ email: "you@example.com" }],
        subject: "[PR] Feature: Add authentication module",
        preview: "A new pull request has been opened in your repository. This PR adds a comprehensive authentication module with OAuth support...",
        hasAttachment: false,
      },
      {
        id: "5",
        threadId: "thread-5",
        mailboxIds: { inbox: true },
        keywords: { $seen: true },
        size: 1536,
        receivedAt: new Date(Date.now() - 172800000).toISOString(),
        from: [{ name: "David Lee", email: "david@startup.io" }],
        to: [{ email: "you@example.com" }],
        subject: "Investment Proposal Discussion",
        preview: "Following up on our call yesterday, I'm sending over the investment proposal we discussed. The terms are quite favorable...",
        hasAttachment: true,
      },
    ];

    const mockMailboxes: Mailbox[] = [
      {
        id: "inbox",
        name: "Inbox",
        role: "inbox",
        sortOrder: 1,
        totalEmails: 5,
        unreadEmails: 2,
        totalThreads: 5,
        unreadThreads: 2,
        myRights: {
          mayReadItems: true,
          mayAddItems: true,
          mayRemoveItems: true,
          maySetSeen: true,
          maySetKeywords: true,
          mayCreateChild: true,
          mayRename: true,
          mayDelete: true,
          maySubmit: true,
        },
        isSubscribed: true,
      },
    ];

    set({
      emails: mockEmails,
      mailboxes: mockMailboxes,
    });
  },
}));