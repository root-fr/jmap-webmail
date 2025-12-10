import { create } from "zustand";
import { Email, Mailbox, StateChange } from "@/lib/jmap/types";
import { JMAPClient } from "@/lib/jmap/client";
import { useSettingsStore } from "@/stores/settings-store";

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
  hasMoreEmails: boolean; // Track if more emails are available to load
  totalEmails: number; // Total number of emails in the current mailbox/query
  isPushConnected: boolean; // Track if push notifications are connected
  lastPushUpdate: number | null; // Timestamp of last push update
  newEmailNotification: Email | null; // New email notification for toast

  // Thread expansion state
  expandedThreadIds: Set<string>; // Which threads are expanded in the list
  threadEmailsCache: Map<string, Email[]>; // Cache of fully fetched thread emails
  isLoadingThread: string | null; // Thread ID currently being loaded

  setEmails: (emails: Email[]) => void;
  setMailboxes: (mailboxes: Mailbox[]) => void;
  selectEmail: (email: Email | null) => void;
  selectMailbox: (mailboxId: string) => void;
  setLoading: (loading: boolean) => void;
  setLoadingEmail: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSearchQuery: (query: string) => void;
  setQuota: (quota: { used: number; total: number } | null) => void;
  toggleEmailSelection: (emailId: string) => void;
  selectAllEmails: () => void;
  clearSelection: () => void;

  // JMAP operations
  fetchMailboxes: (client: JMAPClient) => Promise<void>;
  fetchEmails: (client: JMAPClient, mailboxId?: string) => Promise<void>;
  loadMoreEmails: (client: JMAPClient) => Promise<void>;
  fetchEmailContent: (client: JMAPClient, emailId: string) => Promise<Email | null>;
  fetchQuota: (client: JMAPClient) => Promise<void>;
  sendEmail: (client: JMAPClient, to: string[], subject: string, body: string, cc?: string[], bcc?: string[], draftId?: string) => Promise<void>;
  deleteEmail: (client: JMAPClient, emailId: string) => Promise<void>;
  markAsRead: (client: JMAPClient, emailId: string, read: boolean) => Promise<void>;
  moveToMailbox: (client: JMAPClient, emailId: string, mailboxId: string) => Promise<void>;
  searchEmails: (client: JMAPClient, query: string) => Promise<void>;
  toggleStar: (client: JMAPClient, emailId: string) => Promise<void>;

  // Batch operations
  batchMarkAsRead: (client: JMAPClient, read: boolean) => Promise<void>;
  batchDelete: (client: JMAPClient) => Promise<void>;
  batchMoveToMailbox: (client: JMAPClient, mailboxId: string) => Promise<void>;

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
  hasMoreEmails: false,
  totalEmails: 0,
  isPushConnected: false,
  lastPushUpdate: null,
  newEmailNotification: null,

  // Thread expansion state
  expandedThreadIds: new Set(),
  threadEmailsCache: new Map(),
  isLoadingThread: null,

  setEmails: (emails) => set({ emails }),
  setMailboxes: (mailboxes) => set({ mailboxes }),
  selectEmail: (email) => set({ selectedEmail: email }),
  selectMailbox: (mailboxId) => set({
    selectedMailbox: mailboxId,
    selectedEmail: null,
    selectedEmailIds: new Set(),
    expandedThreadIds: new Set(),
    threadEmailsCache: new Map(),
    isLoadingThread: null,
  }),
  setLoading: (loading) => set({ isLoading: loading }),
  setLoadingEmail: (loading) => set({ isLoadingEmail: loading }),
  setError: (error) => set({ error }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setQuota: (quota) => set({ quota }),

  toggleEmailSelection: (emailId) => {
    const { selectedEmailIds } = get();
    const newSelection = new Set(selectedEmailIds);
    if (newSelection.has(emailId)) {
      newSelection.delete(emailId);
    } else {
      newSelection.add(emailId);
    }
    set({ selectedEmailIds: newSelection });
  },

  selectAllEmails: () => {
    const { emails } = get();
    const allIds = new Set(emails.map(e => e.id));
    set({ selectedEmailIds: allIds });
  },

  clearSelection: () => {
    set({ selectedEmailIds: new Set() });
  },

  // JMAP operations
  fetchMailboxes: async (client) => {
    set({ isLoading: true, error: null });
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
      console.error('Failed to fetch emails:', error);
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
    const { isLoadingMore, hasMoreEmails, emails, selectedMailbox } = get();

    // Don't load if already loading or no more emails
    if (isLoadingMore || !hasMoreEmails) return;

    set({ isLoadingMore: true, error: null });
    try {
      // Find the mailbox to get its accountId (for shared folder support)
      const mailboxes = get().mailboxes;
      const mailbox = mailboxes.find(mb => mb.id === selectedMailbox);
      // Only pass accountId for shared mailboxes, not for primary account
      const accountId = mailbox?.isShared ? mailbox.accountId : undefined;
      // Use originalId for JMAP queries (shared mailboxes use namespaced IDs in the store)
      const jmapMailboxId = mailbox?.originalId || selectedMailbox;

      // Get emails per page from settings
      const emailsPerPage = useSettingsStore.getState().emailsPerPage;

      const result = await client.getEmails(jmapMailboxId, accountId, emailsPerPage, emails.length);

      set({
        emails: [...emails, ...result.emails],
        hasMoreEmails: result.hasMore,
        totalEmails: result.total,
        isLoadingMore: false
      });
    } catch (error) {
      console.error('Failed to load more emails:', error);
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

  sendEmail: async (client, to, subject, body, cc, bcc, draftId) => {
    set({ isLoading: true, error: null });
    try {
      await client.sendEmail(to, subject, body, cc, bcc, draftId);
      // Refresh emails after sending
      await get().fetchEmails(client);
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to send email",
        isLoading: false
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
      // Get the email to check its current mailboxes and read status
      const email = get().emails.find(e => e.id === emailId);
      if (!email) return;

      const isUnread = !email.keywords?.$seen;
      const currentMailboxIds = email.mailboxIds ? Object.keys(email.mailboxIds) : [];

      await client.moveEmail(emailId, destinationMailboxId);

      // Update local state and mailbox counters
      set((state) => {
        // Update mailbox counters
        const updatedMailboxes = state.mailboxes.map(mailbox => {
          // Remove from current mailboxes
          if (currentMailboxIds.includes(mailbox.id)) {
            return {
              ...mailbox,
              totalEmails: Math.max(0, mailbox.totalEmails - 1),
              unreadEmails: isUnread ? Math.max(0, mailbox.unreadEmails - 1) : mailbox.unreadEmails,
              totalThreads: Math.max(0, mailbox.totalThreads - 1),
              unreadThreads: isUnread ? Math.max(0, mailbox.unreadThreads - 1) : mailbox.unreadThreads
            };
          }
          // Add to destination mailbox
          else if (mailbox.id === destinationMailboxId) {
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

        // Update the email's mailboxIds
        const updatedEmails = state.emails.map(e => {
          if (e.id === emailId) {
            return {
              ...e,
              mailboxIds: { [destinationMailboxId]: true }
            };
          }
          return e;
        });

        // If moved email is selected, update selectedEmail too
        const updatedSelectedEmail = state.selectedEmail?.id === emailId
          ? { ...state.selectedEmail, mailboxIds: { [destinationMailboxId]: true } }
          : state.selectedEmail;

        return {
          emails: updatedEmails,
          selectedEmail: updatedSelectedEmail,
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
      const emails = await client.searchEmails(query);
      set({ emails, isLoading: false, hasMoreEmails: false, totalEmails: emails.length });
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

    set({ isLoading: true, error: null });
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
        isLoading: false
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to update emails",
        isLoading: false
      });
    }
  },

  batchDelete: async (client) => {
    const { selectedEmailIds, emails, mailboxes } = get();
    if (selectedEmailIds.size === 0) return;

    set({ isLoading: true, error: null });
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
        isLoading: false
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to delete emails",
        isLoading: false
      });
    }
  },

  batchMoveToMailbox: async (client, toMailboxId) => {
    const { selectedEmailIds, emails } = get();
    if (selectedEmailIds.size === 0) return;

    set({ isLoading: true, error: null });
    try {
      const emailIdsArray = Array.from(selectedEmailIds);
      await client.batchMoveEmails(emailIdsArray, toMailboxId);

      // Update local state - remove from current view since they moved
      const remainingEmails = emails.filter(e => !selectedEmailIds.has(e.id));

      set({
        emails: remainingEmails,
        selectedEmailIds: new Set(),
        isLoading: false
      });

      // Refresh emails to get updated list
      await get().fetchEmails(client, get().selectedMailbox);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to move emails",
        isLoading: false
      });
    }
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

      // Handle Email state changes - refresh current mailbox
      if (accountChanges.Email) {
        await get().refreshCurrentMailbox(client);
      }

      // Handle Mailbox state changes - refresh mailbox list
      if (accountChanges.Mailbox) {
        await get().fetchMailboxes(client);
      }

      // Could also handle Thread, EmailSubmission, Identity changes in the future
    } catch (error) {
      console.error('Failed to handle state change:', error);
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

      // Check if there are new emails by comparing the first email ID
      const currentFirstEmailId = get().emails[0]?.id;
      const newFirstEmailId = result.emails[0]?.id;

      // If the first email changed, we have a new email - trigger notification
      if (currentFirstEmailId !== newFirstEmailId && result.emails[0]) {
        get().handleNewEmailNotification(result.emails[0]);
      }

      set({
        emails: result.emails,
        hasMoreEmails: result.hasMore,
        totalEmails: result.total
      });
    } catch (error) {
      console.error('Failed to refresh current mailbox:', error);
      // Don't set error state for background refreshes to avoid disrupting the UI
    }
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
    } catch (error) {
      console.error('Failed to fetch thread emails:', error);
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