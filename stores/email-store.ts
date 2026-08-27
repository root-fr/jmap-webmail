import { create } from "zustand";
import { Email, Mailbox, StateChange, ThreadGroup } from "@/lib/jmap/types";
import { JMAPClient, AnchorNotFoundError } from "@/lib/jmap/client";
import { useSettingsStore } from "@/stores/settings-store";
import { useCalendarStore } from "@/stores/calendar-store";
import { SearchFilters, EmailQuery, EmailScope, EmailSort, DEFAULT_SEARCH_FILTERS, isFilterEmpty, resolveScopeTargets, UNIFIED_INBOX_ID } from "@/lib/jmap/search-utils";
import { mergeAccountPages } from "@/lib/jmap/unified-query";
import type { AccountPage, UnifiedCursor, UnifiedTarget } from "@/lib/jmap/unified-query";
import { accountScopedKey, emailRowKey, sameRow, findEmailRow, findThreadRow, owningAccountId } from "@/lib/thread-utils";
import type { RowKey } from "@/lib/thread-utils";

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
  selectedEmailIds: Set<RowKey>; // Selected rows for batch ops, keyed by accountScopedKey(accountId, id)
  lastSelectedIndex: number | null;
  hasMoreEmails: boolean; // Track if more emails are available to load
  totalEmails: number; // Total number of emails in the current mailbox/query
  currentQuery: EmailQuery; // Single descriptor: browse/search/advanced-search/sort all derive from this
  unifiedPages: AccountPage[]; // per-account buffers backing the unified merge window
  unifiedCursors: UnifiedCursor[] | null; // null when the current list is not merged
  unifiedDrained: string[]; // account ids whose buffer drained; refetched on next load-more
  isPushConnected: boolean; // Track if push notifications are connected
  lastPushUpdate: number | null; // Timestamp of last push update
  newEmailNotification: Email | null; // New email notification for toast
  failedAccounts: string[]; // Account ids whose unified fetch failed (partial-failure notice)

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
  toggleEmailSelection: (selectionKey: RowKey, groupIndex?: number) => void;
  selectAllEmails: (threadGroups?: ThreadGroup[]) => void;
  clearSelection: () => void;
  selectRange: (fromIndex: number, toIndex: number, threadGroups: ThreadGroup[]) => void;
  selectByFilter: (filter: string, threadGroups: ThreadGroup[]) => void;

  // JMAP operations
  fetchMailboxes: (client: JMAPClient) => Promise<void>;
  fetchEmails: (client: JMAPClient, mailboxId?: string) => Promise<void>;
  loadMoreEmails: (client: JMAPClient) => Promise<void>;
  fetchEmailContent: (client: JMAPClient, emailId: string, accountId?: string) => Promise<Email | null>;
  fetchQuota: (client: JMAPClient) => Promise<void>;
  sendEmail: (client: JMAPClient, to: string[], subject: string, body: string, cc?: string[], bcc?: string[], identityId?: string, fromEmail?: string, draftId?: string, fromName?: string, accountId?: string) => Promise<void>;
  deleteEmail: (client: JMAPClient, emailId: string, accountId?: string) => Promise<void>;
  markAsRead: (client: JMAPClient, emailId: string, read: boolean, accountId?: string) => Promise<void>;
  moveToMailbox: (client: JMAPClient, emailId: string, mailboxId: string, accountId?: string) => Promise<void>;
  moveThreadToMailbox: (client: JMAPClient, threadId: string, mailboxId: string, accountId?: string) => Promise<void>;
  searchEmails: (client: JMAPClient, query: string) => Promise<void>;
  advancedSearch: (client: JMAPClient) => Promise<void>;
  setSort: (client: JMAPClient, sort: EmailSort) => Promise<void>;
  setScope: (client: JMAPClient, scope: EmailScope) => Promise<void>;
  dismissFailedAccounts: () => void;
  retryQuery: (client: JMAPClient) => Promise<void>;
  setSearchFilters: (filters: Partial<SearchFilters>) => void;
  clearSearchFilters: () => void;
  toggleAdvancedSearch: () => void;
  toggleStar: (client: JMAPClient, emailId: string, accountId?: string) => Promise<void>;

  // Batch operations
  batchMarkAsRead: (client: JMAPClient, read: boolean) => Promise<void>;
  batchDelete: (client: JMAPClient) => Promise<void>;
  batchMoveToMailbox: (client: JMAPClient, mailboxId: string) => Promise<void>;

  // Spam operations
  spamUndoCache: Map<string, { emailId: string; originalMailboxId: string; accountId?: string }>;
  markAsSpam: (client: JMAPClient, emailId: string, accountId?: string) => Promise<void>;
  undoSpam: (client: JMAPClient, emailId: string, accountId?: string) => Promise<void>;
  batchMarkAsSpam: (client: JMAPClient) => Promise<void>;
  batchUndoSpam: (client: JMAPClient) => Promise<void>;

  // Push notification handlers
  setPushConnected: (connected: boolean) => void;
  handleStateChange: (change: StateChange, client: JMAPClient) => Promise<void>;
  refreshCurrentMailbox: (client: JMAPClient) => Promise<void>;
  handleNewEmailNotification: (email: Email) => void;
  clearNewEmailNotification: () => void;

  // Thread expansion actions. Expansion state and the email cache are keyed
  // by accountScopedKey(accountId, threadId): thread ids are account-local.
  toggleThreadExpansion: (threadKey: string) => void;
  fetchThreadEmails: (client: JMAPClient, threadId: string, accountId?: string) => Promise<Email[]>;
  collapseAllThreads: () => void;
  updateThreadCache: (threadId: string, emails: Email[], accountId?: string) => void;

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

// JMAP calls against a shared mailbox must target the owning account,
// not the primary accountId the client was initialised with.
function resolveMailboxAccount(mailboxes: Mailbox[], mailboxId: string) {
  const currentMailbox = mailboxes.find(mb => mb.id === mailboxId);
  return {
    currentMailbox,
    accountId: currentMailbox?.isShared ? currentMailbox.accountId : undefined,
  };
}

// Global-scope queries run against the primary account; folder scope resolves
// the owning account for shared mailboxes.
function accountIdForScope(
  scope: EmailScope,
  mailboxes: Mailbox[],
  selectedMailbox: string,
): string | undefined {
  return scope.kind === "folder"
    ? resolveMailboxAccount(mailboxes, selectedMailbox).accountId
    : undefined;
}

// In merged views (unified inbox, cross-account Everywhere search) rows come
// from several accounts, so the owning account is the Email.accountId stamp —
// non-primary rows always carry it — never the selected mailbox. Unstamped
// rows fall back to shared-mailbox resolution for plain folder browsing.
function accountIdForEmail(
  email: Email | undefined,
  mailboxes: Mailbox[],
  selectedMailbox: string,
): string | undefined {
  return owningAccountId(email, mailboxes, selectedMailbox);
}

// Batch writes must target each row's owning account; outside the unified
// view every selected row shares the folder's account, so this collapses to
// a single group. Selection membership is account-scoped: colliding ids from
// two accounts must not both match one checkbox.
function groupSelectionByAccount(
  emails: Email[],
  selectedEmailIds: Set<string>,
  mailboxes: Mailbox[],
  selectedMailbox: string,
): Map<string | undefined, Email[]> {
  const groups = new Map<string | undefined, Email[]>();
  for (const email of emails) {
    if (!selectedEmailIds.has(emailRowKey(email))) continue;
    const accountId = accountIdForEmail(email, mailboxes, selectedMailbox);
    const rows = groups.get(accountId) ?? [];
    rows.push(email);
    groups.set(accountId, rows);
  }
  return groups;
}

function isSelectedRow(email: Email, selectedEmailIds: Set<RowKey>): boolean {
  return selectedEmailIds.has(emailRowKey(email));
}


// A destination picked from the merged folder list can belong to another
// account, but a JMAP move must name a mailbox of the owning account. Remap
// role folders (Archive, Trash, ...) to the owning account's equivalent and
// refuse anything else rather than sending a foreign mailbox id the server
// could resolve to an arbitrary folder.
function resolveDestinationForAccount(
  mailboxes: Mailbox[],
  destinationMailboxId: string,
  accountId: string | undefined,
): Mailbox | undefined {
  const dest = mailboxes.find(mb => mb.id === destinationMailboxId);
  if (!dest) return undefined;
  const destAccount = dest.isShared ? dest.accountId : undefined;
  if (destAccount === accountId) return dest;
  if (!dest.role) return undefined;
  return findAccountMailboxByRole(mailboxes, dest.role, accountId);
}

function hasUnifiedMore(cursors: UnifiedCursor[]): boolean {
  return cursors.some(c => !c.exhausted);
}

function failedAccountIds(pages: AccountPage[]): string[] {
  return pages.filter(p => p.failed).map(p => p.accountId);
}

// Role-folder lookup in a specific account; undefined accountId = primary.
function findAccountMailboxByRole(mailboxes: Mailbox[], role: string, accountId: string | undefined): Mailbox | undefined {
  return mailboxes.find(mb =>
    mb.role === role &&
    (accountId ? mb.isShared === true && mb.accountId === accountId : !mb.isShared),
  );
}

// Merged views have no real selected mailbox; writes fall back to the owning
// account's inbox (primary inbox when the row is unstamped).
function findAccountInbox(mailboxes: Mailbox[], accountId: string | undefined): Mailbox | undefined {
  return findAccountMailboxByRole(mailboxes, 'inbox', accountId);
}

// Reset for every non-merged (or failed) list so stale merge state can never
// steer refreshCurrentMailbox into the merged branch.
function clearedUnifiedState() {
  return {
    unifiedPages: [] as AccountPage[],
    unifiedCursors: null,
    unifiedDrained: [] as string[],
    failedAccounts: [] as string[],
  };
}

async function fetchUnifiedWindow(
  get: () => EmailStore,
  client: JMAPClient,
  query: EmailQuery,
  limit: number,
  precomputedTargets?: UnifiedTarget[],
): Promise<{ pages: AccountPage[]; merged: ReturnType<typeof mergeAccountPages> }> {
  const excluded = useSettingsStore.getState().unifiedInboxExcludedAccounts;
  const targets = precomputedTargets
    ?? resolveScopeTargets(query.scope, get().mailboxes, excluded)
    ?? [];
  const pages = targets.length > 0
    ? await client.queryEmailsUnified(query, { limit }, targets)
    : [];
  // Failed pages pass through the merge untouched: the list renders whatever
  // survived (possibly empty) and the partial-failure notice names the
  // accounts — never the generic error-blanked path.
  const merged = mergeAccountPages(pages, query.sort, limit, undefined);
  return { pages, merged };
}

// Skip state updates when a refreshed window is identical, avoiding
// re-renders that cause a visible list flicker on every poll tick.
function listChanged(prev: Email[], next: Email[]): boolean {
  return (
    prev.length !== next.length ||
    next.some((email, i) => {
      const curr = prev[i];
      return (
        curr.id !== email.id ||
        curr.threadId !== email.threadId ||
        JSON.stringify(curr.keywords) !== JSON.stringify(email.keywords)
      );
    })
  );
}

// Single query path: browse/search/advanced-search/sort all build one
// EmailQuery descriptor and run it through client.queryEmails from the first page.
async function runQuery(
  set: (partial: Partial<EmailStore>) => void,
  get: () => EmailStore,
  client: JMAPClient,
  query: EmailQuery,
  accountId?: string,
  controller?: AbortController,
): Promise<void> {
  const { emailsPerPage, unifiedInboxExcludedAccounts } = useSettingsStore.getState();
  try {
    const targets = resolveScopeTargets(
      query.scope,
      get().mailboxes,
      unifiedInboxExcludedAccounts,
    );

    if (query.scope.kind === "unified" || (targets !== null && targets.length > 1)) {
      const { pages, merged } = await fetchUnifiedWindow(get, client, query, emailsPerPage, targets ?? []);
      if (controller?.signal.aborted) return;
      set({
        currentQuery: query,
        emails: merged.emails,
        hasMoreEmails: hasUnifiedMore(merged.cursors),
        failedAccounts: failedAccountIds(pages),
        // The merged count is only truthful when every account reported one.
        totalEmails:
          pages.length > 0 && pages.every((p) => p.total !== undefined)
            ? pages.reduce((sum, p) => sum + (p.total ?? 0), 0)
            : 0,
        unifiedPages: pages,
        unifiedCursors: merged.cursors,
        unifiedDrained: merged.drained,
        isLoading: false,
        ...(controller ? { searchAbortController: null } : {}),
      });
      return;
    }

    const result = await client.queryEmails(query, { limit: emailsPerPage }, accountId);
    if (controller?.signal.aborted) return;
    set({
      currentQuery: query,
      emails: result.emails,
      hasMoreEmails: result.hasMore,
      totalEmails: result.total,
      ...clearedUnifiedState(),
      isLoading: false,
      ...(controller ? { searchAbortController: null } : {}),
    });
  } catch (error) {
    if (controller?.signal.aborted) return;
    set({
      currentQuery: query,
      error: error instanceof Error ? error.message : "Failed to fetch emails",
      isLoading: false,
      emails: [],
      hasMoreEmails: false,
      totalEmails: 0,
      ...clearedUnifiedState(),
      ...(controller ? { searchAbortController: null } : {}),
    });
  }
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
  currentQuery: { scope: { kind: "folder", mailboxId: "" }, sort: { by: "receivedAt", ascending: false } },
  unifiedPages: [],
  unifiedCursors: null,
  unifiedDrained: [],
  isPushConnected: false,
  lastPushUpdate: null,
  newEmailNotification: null,
  failedAccounts: [],

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

  toggleEmailSelection: (selectionKey, groupIndex) => {
    const { selectedEmailIds } = get();
    const newSelection = new Set(selectedEmailIds);
    if (newSelection.has(selectionKey)) {
      newSelection.delete(selectionKey);
    } else {
      newSelection.add(selectionKey);
    }
    set({
      selectedEmailIds: newSelection,
      lastSelectedIndex: groupIndex ?? get().lastSelectedIndex,
    });
  },

  selectAllEmails: (threadGroups) => {
    if (threadGroups) {
      const allIds = new Set(threadGroups.map(g => emailRowKey(g.latestEmail)));
      set({ selectedEmailIds: allIds, lastSelectedIndex: null });
    } else {
      const { emails } = get();
      const allIds = new Set(emails.map(e => emailRowKey(e)));
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
        newSelection.add(emailRowKey(group.latestEmail));
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
      const allIds = new Set(threadGroups.map(g => emailRowKey(g.latestEmail)));
      set({ selectedEmailIds: allIds, lastSelectedIndex: null });
      return;
    }
    const newSelection = new Set<RowKey>();
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
        newSelection.add(emailRowKey(email));
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
    const targetMailboxId = mailboxId || get().selectedMailbox;

    // Virtual All Inboxes: the sentinel must be handled before shared-mailbox
    // resolution — it shares the accountId:mailboxId shape but is not a JMAP id.
    if (targetMailboxId === UNIFIED_INBOX_ID) {
      const query: EmailQuery = {
        scope: { kind: "unified" },
        sort: get().currentQuery.sort,
      };
      await runQuery(set, get, client, query);
      return;
    }

    const { currentMailbox, accountId } = resolveMailboxAccount(get().mailboxes, targetMailboxId);
    // Use originalId for JMAP queries (shared mailboxes use namespaced IDs in the store)
    const jmapMailboxId = currentMailbox?.originalId || targetMailboxId;

    const query: EmailQuery = {
      scope: { kind: "folder", mailboxId: jmapMailboxId },
      sort: get().currentQuery.sort,
    };
    await runQuery(set, get, client, query, accountId);
  },

  loadMoreEmails: async (client) => {
    const { isLoadingMore, hasMoreEmails, emails, currentQuery, mailboxes, selectedMailbox, totalEmails } = get();

    // Don't load if already loading or there are no more emails.
    if (isLoadingMore || !hasMoreEmails) return;

    const { unifiedPages, unifiedCursors, unifiedDrained } = get();
    if (unifiedCursors) {
      set({ isLoadingMore: true, error: null });
      const { emailsPerPage, unifiedInboxExcludedAccounts } = useSettingsStore.getState();
      try {
        let pages = unifiedPages;
        // Refetch drained accounts plus any whose page failed: a failed page
        // keeps its cursor non-exhausted but never lands in drained, so
        // without the retry Load More would stay visible yet fetch nothing.
        const refetchIds = new Set([...unifiedDrained, ...failedAccountIds(unifiedPages)]);
        if (refetchIds.size > 0) {
          // Fresh top window sized to the rows already consumed plus one
          // page; mergeAccountPages resumes after each cursor's anchorEmailId
          // inside that window, so concurrent inserts/removals cannot drift
          // the window (same principle as the #71 anchor fix).
          const targets = (resolveScopeTargets(currentQuery.scope, mailboxes, unifiedInboxExcludedAccounts) ?? [])
            .filter(t => refetchIds.has(t.accountId));
          const maxConsumed = unifiedCursors
            .filter(c => refetchIds.has(c.accountId))
            .reduce((max, c) => Math.max(max, c.consumed), 0);
          const refreshed = await client.queryEmailsUnified(
            currentQuery,
            { limit: maxConsumed + emailsPerPage },
            targets,
          );
          const refreshedByAccount = new Map(refreshed.map(p => [p.accountId, p]));
          pages = unifiedPages.map(p => refreshedByAccount.get(p.accountId) ?? p);
        }
        const merged = mergeAccountPages(pages, currentQuery.sort, emailsPerPage, unifiedCursors);
        const seen = new Set(emails.map(e => emailRowKey(e)));
        set({
          emails: [...emails, ...merged.emails.filter(e => !seen.has(emailRowKey(e)))],
          hasMoreEmails: hasUnifiedMore(merged.cursors),
          // Failed pages are refetched above, so their status is fresh:
          // recompute the notice or a recovered account stays flagged and a
          // newly failing one is never surfaced.
          failedAccounts: failedAccountIds(pages),
          unifiedPages: pages,
          unifiedCursors: merged.cursors,
          unifiedDrained: merged.drained,
          isLoadingMore: false,
        });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : "Failed to load more emails",
          isLoadingMore: false,
        });
      }
      return;
    }

    // Anchor the next page to the last loaded id. Offset paging (position:
    // emails.length) drifts when a message is inserted/removed between page
    // loads, duplicating or skipping rows (#71); the anchor is stable.
    const anchorId = emails[emails.length - 1]?.id;
    if (!anchorId) return;

    set({ isLoadingMore: true, error: null });

    const emailsPerPage = useSettingsStore.getState().emailsPerPage;
    const accountId = accountIdForScope(currentQuery.scope, mailboxes, selectedMailbox);

    const appendNew = (incoming: Email[]) => {
      const seen = new Set(emails.map(e => e.id));
      return [...emails, ...incoming.filter(e => !seen.has(e.id))];
    };

    try {
      const result = await client.queryEmails(
        currentQuery,
        { limit: emailsPerPage, anchor: anchorId, anchorOffset: 1 },
        accountId,
      );
      set({
        emails: appendNew(result.emails),
        hasMoreEmails: result.hasMore,
        // Anchor pages omit `total`; keep the count from the initial page.
        totalEmails: result.total || totalEmails,
        isLoadingMore: false,
      });
    } catch (error) {
      if (error instanceof AnchorNotFoundError) {
        // The anchor row was deleted/moved between pages. EmailPage has no
        // positional cursor, so continue once from a fresh top window sized to
        // the currently loaded rows plus one page instead of looping forever,
        // and surface a non-fatal notice while keeping the list populated.
        try {
          const result = await client.queryEmails(
            currentQuery,
            { limit: emails.length + emailsPerPage },
            accountId,
          );
          set({
            emails: result.emails,
            hasMoreEmails: result.hasMore,
            totalEmails: result.total,
            isLoadingMore: false,
            error: "Some messages moved while loading; the list was refreshed.",
          });
        } catch (fallbackError) {
          set({
            error: fallbackError instanceof Error ? fallbackError.message : "Failed to load more emails",
            isLoadingMore: false,
          });
        }
      } else {
        set({
          error: error instanceof Error ? error.message : "Failed to load more emails",
          isLoadingMore: false,
        });
      }
    }
  },

  fetchEmailContent: async (client, emailId, accountId) => {
    try {
      const row = findEmailRow(get().emails, emailId, accountId);
      const resolvedAccountId =
        accountIdForEmail(row, get().mailboxes, get().selectedMailbox) ?? accountId;

      const email = await client.getEmail(emailId, resolvedAccountId);

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

  sendEmail: async (client, to, subject, body, cc, bcc, identityId, fromEmail, draftId, fromName, accountId) => {
    set({ error: null });
    try {
      await client.sendEmail(to, subject, body, cc, bcc, identityId, fromEmail, draftId, fromName, accountId);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to send email",
      });
      throw error;
    }
  },

  deleteEmail: async (client, emailId, rowAccountId) => {
    try {
      // Get the email to check if it's unread and which mailboxes it belongs to
      const email = findEmailRow(get().emails, emailId, rowAccountId);
      if (!email) return;

      const isUnread = !email.keywords?.$seen;

      // Get delete action preference from settings
      const deleteAction = useSettingsStore.getState().deleteAction;

      const mailboxes = get().mailboxes;
      const accountId = accountIdForEmail(email, mailboxes, get().selectedMailbox);

      // If deleteAction is 'trash', try to move to trash mailbox
      if (deleteAction === 'trash') {
        // Find trash mailbox for the correct account
        const trashMailbox = findAccountMailboxByRole(mailboxes, 'trash', accountId);

        if (trashMailbox && !email.mailboxIds?.[trashMailbox.id]) {
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
              emails: state.emails.filter(e => !sameRow(e, emailId, email.accountId)),
              selectedEmail: state.selectedEmail !== null && sameRow(state.selectedEmail, emailId, email.accountId)
                ? null : state.selectedEmail,
              mailboxes: updatedMailboxes
            };
          });
          return;
        }
        // If no trash mailbox found, fall through to permanent delete
      }

      // Permanent delete
      await client.deleteEmail(emailId, accountId);

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
          emails: state.emails.filter(e => !sameRow(e, emailId, email.accountId)),
          selectedEmail: state.selectedEmail !== null && sameRow(state.selectedEmail, emailId, email.accountId)
            ? null : state.selectedEmail,
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

  markAsRead: async (client, emailId, read, rowAccountId) => {
    // Get the email to check its current state and mailboxes
    const email = findEmailRow(get().emails, emailId, rowAccountId);
    if (!email) return;

    try {
      // Check if this email is already being processed
      const processingKey = `${accountScopedKey(email.accountId, emailId)}-${read}`;
      const currentProcessing = get().processingReadStatus;
      if (currentProcessing.has(processingKey)) {
        return; // Already being processed
      }

      // Check if already in the desired state
      const isCurrentlyRead = email.keywords?.$seen === true;
      if (isCurrentlyRead === read) {
        return; // Already in desired state
      }

      // Add to processing set
      set((state) => ({
        processingReadStatus: new Set([...state.processingReadStatus, processingKey])
      }));

      const accountId = accountIdForEmail(email, get().mailboxes, get().selectedMailbox);

      await client.markAsRead(emailId, read, accountId);

      // Update local state including mailbox counters
      set((state) => {
        // Remove from processing set
        const newProcessingSet = new Set(state.processingReadStatus);
        newProcessingSet.delete(processingKey);

        // Only update counters if the state is actually changing
        const emailInState = state.emails.find(e => sameRow(e, emailId, email.accountId));
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
            sameRow(e, emailId, email.accountId)
              ? { ...e, keywords: { ...e.keywords, $seen: read } } : e
          ),
          selectedEmail: state.selectedEmail !== null && sameRow(state.selectedEmail, emailId, email.accountId)
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
        newProcessingSet.delete(`${accountScopedKey(email.accountId, emailId)}-${read}`);
        return {
          processingReadStatus: newProcessingSet,
          error: error instanceof Error ? error.message : "Failed to update email"
        };
      });
      throw error;
    }
  },

  moveThreadToMailbox: async (client, threadId, destinationMailboxId, rowAccountId) => {
    try {
      const { mailboxes, selectedMailbox, emails } = get();
      const threadRow = findThreadRow(emails, threadId, rowAccountId);
      const accountId = accountIdForEmail(threadRow, mailboxes, selectedMailbox);
      const threadAccountStamp = threadRow?.accountId;
      const { currentMailbox } = resolveMailboxAccount(mailboxes, selectedMailbox);

      // Callers resolve role mailboxes (e.g. Archive) from the flat list, so in
      // a merged view the destination can be another account's folder; remap it
      // to the owning account's same-role folder.
      const resolvedDest = resolveDestinationForAccount(mailboxes, destinationMailboxId, accountId);
      if (!resolvedDest) {
        throw new Error("No equivalent folder in the message's account");
      }
      const jmapDestId = resolvedDest.originalId || resolvedDest.id;
      const effectiveDestId = resolvedDest.id;

      // Detach the conversation from the mailbox the user is viewing (e.g. Inbox),
      // leaving its Sent/Drafts copies in place. Shared mailboxes use namespaced
      // ids. Merged views have no real selected mailbox: detach from the owning
      // account's inbox instead.
      const sourceMailbox = currentMailbox ?? findAccountInbox(mailboxes, accountId);
      const jmapSourceId = sourceMailbox ? (sourceMailbox.originalId || sourceMailbox.id) : selectedMailbox;

      const movedIds = await client.moveThreadToMailbox(threadId, jmapDestId, jmapSourceId, accountId);
      if (movedIds.length === 0) return;

      const movedSet = new Set(movedIds);

      // Walk the locally known emails to compute per-source-mailbox deltas
      // so the sidebar stays consistent without a full refetch. Any thread
      // emails we don't have locally (older messages, different mailbox)
      // will be reconciled on the next JMAP push.
      const unreadByMailbox = new Map<string, number>();
      const totalByMailbox = new Map<string, number>();
      let movedUnreadTotal = 0;
      let movedThreadWasUnread = false;
      for (const e of emails) {
        if (!movedSet.has(e.id) || e.accountId !== threadAccountStamp) continue;
        const isUnread = !e.keywords?.$seen;
        if (isUnread) {
          movedUnreadTotal += 1;
          movedThreadWasUnread = true;
        }
        const ids = e.mailboxIds ? Object.keys(e.mailboxIds) : [];
        for (const mbId of ids) {
          totalByMailbox.set(mbId, (totalByMailbox.get(mbId) || 0) + 1);
          if (isUnread) unreadByMailbox.set(mbId, (unreadByMailbox.get(mbId) || 0) + 1);
        }
      }

      set((state) => ({
        emails: state.emails.filter(e => !(movedSet.has(e.id) && e.accountId === threadAccountStamp)),
        selectedEmail: state.selectedEmail && movedSet.has(state.selectedEmail.id)
          && state.selectedEmail.accountId === threadAccountStamp ? null : state.selectedEmail,
        mailboxes: state.mailboxes.map(mailbox => {
          const totalDelta = totalByMailbox.get(mailbox.id) || 0;
          const unreadDelta = unreadByMailbox.get(mailbox.id) || 0;
          if (totalDelta > 0 && mailbox.id !== effectiveDestId) {
            return {
              ...mailbox,
              totalEmails: Math.max(0, mailbox.totalEmails - totalDelta),
              unreadEmails: Math.max(0, mailbox.unreadEmails - unreadDelta),
              totalThreads: Math.max(0, mailbox.totalThreads - 1),
              unreadThreads: Math.max(0, mailbox.unreadThreads - (movedThreadWasUnread ? 1 : 0)),
            };
          }
          if (mailbox.id === effectiveDestId) {
            return {
              ...mailbox,
              totalEmails: mailbox.totalEmails + movedIds.length,
              unreadEmails: mailbox.unreadEmails + movedUnreadTotal,
              totalThreads: mailbox.totalThreads + 1,
              unreadThreads: mailbox.unreadThreads + (movedThreadWasUnread ? 1 : 0),
            };
          }
          return mailbox;
        }),
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to move thread" });
      throw error;
    }
  },

  moveToMailbox: async (client, emailId, destinationMailboxId, rowAccountId) => {
    try {
      const email = findEmailRow(get().emails, emailId, rowAccountId);
      if (!email) return;

      const isUnread = !email.keywords?.$seen;
      const currentMailboxIds = email.mailboxIds ? Object.keys(email.mailboxIds) : [];

      const { selectedMailbox, mailboxes } = get();
      const accountId = accountIdForEmail(email, mailboxes, selectedMailbox);

      const resolvedDest = resolveDestinationForAccount(mailboxes, destinationMailboxId, accountId);
      if (!resolvedDest) {
        throw new Error("No equivalent folder in the message's account");
      }
      const jmapDestId = resolvedDest.originalId || resolvedDest.id;

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
          if (mailbox.id === resolvedDest.id) {
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
          emails: state.emails.filter(e => !sameRow(e, emailId, email.accountId)),
          selectedEmail: state.selectedEmail !== null && sameRow(state.selectedEmail, emailId, email.accountId)
            ? null : state.selectedEmail,
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
    const emailQuery: EmailQuery = {
      text: query,
      scope: { kind: "all", includeTrashJunk: false },
      sort: get().currentQuery.sort,
    };
    await runQuery(set, get, client, emailQuery);
  },

  advancedSearch: async (client) => {
    const { searchQuery, searchFilters, searchAbortController } = get();

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

    const query: EmailQuery = {
      text: searchQuery || undefined,
      filters: searchFilters,
      scope: { kind: "all", includeTrashJunk: false },
      sort: get().currentQuery.sort,
    };
    await runQuery(set, get, client, query, undefined, controller);
  },

  setSort: async (client, sort) => {
    set({ isLoading: true, error: null });
    const query: EmailQuery = { ...get().currentQuery, sort };
    const accountId = accountIdForScope(query.scope, get().mailboxes, get().selectedMailbox);
    await runQuery(set, get, client, query, accountId);
  },

  setScope: async (client, scope) => {
    set({ isLoading: true, error: null });
    const query: EmailQuery = { ...get().currentQuery, scope };
    const accountId = accountIdForScope(scope, get().mailboxes, get().selectedMailbox);
    await runQuery(set, get, client, query, accountId);
  },

  dismissFailedAccounts: () => set({ failedAccounts: [] }),

  retryQuery: async (client) => {
    if (get().isLoading) return;
    // Register a controller so a newer advancedSearch can invalidate this
    // retry; without it a slow retry resolving last would overwrite the
    // newer results and reset currentQuery to the stale descriptor.
    get().searchAbortController?.abort();
    const controller = new AbortController();
    set({ isLoading: true, error: null, failedAccounts: [], searchAbortController: controller });
    const query = get().currentQuery;
    const accountId = accountIdForScope(query.scope, get().mailboxes, get().selectedMailbox);
    await runQuery(set, get, client, query, accountId, controller);
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

  toggleStar: async (client, emailId, rowAccountId) => {
    try {
      const email = findEmailRow(get().emails, emailId, rowAccountId);
      if (!email) return;

      const isFlagged = email.keywords.$flagged || false;
      const accountId = accountIdForEmail(email, get().mailboxes, get().selectedMailbox);
      await client.toggleStar(emailId, !isFlagged, accountId);

      // Update local state
      set((state) => ({
        emails: state.emails.map(e =>
          sameRow(e, emailId, email.accountId)
            ? { ...e, keywords: { ...e.keywords, $flagged: !isFlagged } } : e
        ),
        selectedEmail: state.selectedEmail !== null && sameRow(state.selectedEmail, emailId, email.accountId)
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
    const { selectedEmailIds, emails, mailboxes, selectedMailbox } = get();
    if (selectedEmailIds.size === 0) return;

    set({ error: null });
    try {
      const groups = groupSelectionByAccount(emails, selectedEmailIds, mailboxes, selectedMailbox);
      for (const [accountId, rows] of groups) {
        await client.batchMarkAsRead(rows.map(r => r.id), read, accountId);
      }

      // Update local state
      const updatedEmails = emails.map(email =>
        isSelectedRow(email, selectedEmailIds)
          ? { ...email, keywords: { ...email.keywords, $seen: read } }
          : email
      );

      // Update mailbox counters
      const affectedEmails = emails.filter(e => isSelectedRow(e, selectedEmailIds));
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
    const { selectedEmailIds, emails, mailboxes, selectedMailbox } = get();
    if (selectedEmailIds.size === 0) return;

    set({ error: null });
    try {
      const deletedEmails = emails.filter(e => isSelectedRow(e, selectedEmailIds));

      const deleteAction = useSettingsStore.getState().deleteAction;

      // Permanent destroy only when the user is actually viewing Trash. Mere
      // Trash membership (a message tagged into several mailboxes) must still
      // move-to-Trash from any other folder, never destroy irrecoverably.
      const viewingTrash = mailboxes.find(mb => mb.id === selectedMailbox)?.role === 'trash';

      // Each group targets its own account's Trash so a unified-view delete
      // never lands in the wrong account.
      const trashIdByEmail = new Map<string, string>();
      const groups = groupSelectionByAccount(emails, selectedEmailIds, mailboxes, selectedMailbox);
      for (const [accountId, rows] of groups) {
        const ids = rows.map(r => r.id);
        const trashMailbox = deleteAction === 'trash'
          ? findAccountMailboxByRole(mailboxes, 'trash', accountId)
          : undefined;
        if (trashMailbox && !viewingTrash) {
          await client.batchMoveEmails(ids, trashMailbox.originalId || trashMailbox.id, accountId);
          for (const row of rows) trashIdByEmail.set(emailRowKey(row), trashMailbox.id);
        } else {
          await client.batchDeleteEmails(ids, accountId);
        }
      }

      const remainingEmails = emails.filter(e => !isSelectedRow(e, selectedEmailIds));

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
          if (trashIdByEmail.get(emailRowKey(email)) === mailbox.id && !email.mailboxIds?.[mailbox.id]) {
            deltaTotalEmails++;
            if (!email.keywords?.$seen) {
              deltaUnreadEmails++;
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
    const { selectedEmailIds, emails, mailboxes, selectedMailbox } = get();
    if (selectedEmailIds.size === 0) return;

    set({ error: null });
    try {
      const groups = groupSelectionByAccount(emails, selectedEmailIds, mailboxes, selectedMailbox);
      const movedKeys = new Set<string>();
      let unresolvedCount = 0;
      for (const [accountId, rows] of groups) {
        // The destination was picked from the merged folder list; each account
        // group must move into its own account's folder, never a foreign id.
        const resolvedDest = resolveDestinationForAccount(mailboxes, toMailboxId, accountId);
        if (!resolvedDest) {
          unresolvedCount += rows.length;
          continue;
        }
        await client.batchMoveEmails(rows.map(r => r.id), resolvedDest.originalId || resolvedDest.id, accountId);
        for (const row of rows) movedKeys.add(emailRowKey(row));
      }

      // Update local state - remove from current view since they moved
      const remainingEmails = emails.filter(e => !movedKeys.has(emailRowKey(e)));

      set({
        emails: remainingEmails,
        selectedEmailIds: new Set(),
      });

      // Silent refresh to sync with server
      await get().refreshCurrentMailbox(client);

      if (unresolvedCount > 0) {
        throw new Error("Some messages stayed put: their account has no equivalent folder");
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to move emails",
      });
      throw error;
    }
  },

  // Spam operations
  markAsSpam: async (client, emailId, rowAccountId) => {
    const { selectedMailbox, mailboxes, emails } = get();
    const email = findEmailRow(emails, emailId, rowAccountId);
    if (!email) return;

    const accountId = accountIdForEmail(email, mailboxes, selectedMailbox);
    // Merged views (unified inbox, cross-account search) have no real selected
    // mailbox; undo then restores to the owning account's inbox, matching
    // undoSpam's cache-miss fallback.
    const sourceMailbox = mailboxes.find(m => m.id === selectedMailbox)
      ?? findAccountInbox(mailboxes, accountId);
    if (!sourceMailbox) return;

    get().spamUndoCache.set(accountScopedKey(email.accountId, emailId), {
      emailId,
      originalMailboxId: sourceMailbox.originalId || sourceMailbox.id,
      accountId,
    });

    await client.markAsSpam(emailId, accountId);

    set(state => ({
      emails: state.emails.filter(e => !sameRow(e, emailId, email.accountId)),
      selectedEmail: state.selectedEmail !== null && sameRow(state.selectedEmail, emailId, email.accountId)
        ? null : state.selectedEmail,
    }));

    const currentIndex = emails.findIndex(e => sameRow(e, emailId, email.accountId));
    if (currentIndex >= 0 && currentIndex < emails.length - 1) {
      set({ selectedEmail: emails[currentIndex + 1] });
    }
  },

  undoSpam: async (client, emailId, rowAccountId) => {
    const { mailboxes, selectedMailbox } = get();

    // Try cache first (preserves exact original mailbox for toast undo)
    const cachedData = get().spamUndoCache.get(accountScopedKey(rowAccountId, emailId));

    let targetMailboxId: string;
    let accountId: string | undefined;

    if (cachedData) {
      // Use cached original mailbox (more accurate for immediate undo)
      targetMailboxId = cachedData.originalMailboxId;
      accountId = cachedData.accountId;
      get().spamUndoCache.delete(accountScopedKey(rowAccountId, emailId));
    } else if (rowAccountId !== undefined) {
      // Merged-view row: the stamp names the owning account directly.
      const inboxMailbox = findAccountInbox(mailboxes, rowAccountId);
      if (!inboxMailbox) {
        throw new Error('Inbox not found');
      }
      accountId = rowAccountId;
      targetMailboxId = inboxMailbox.originalId || inboxMailbox.id;
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

  batchMarkAsSpam: async (client) => {
    const { selectedMailbox, mailboxes, emails, selectedEmailIds } = get();
    const selectedRows = emails.filter(e => isSelectedRow(e, selectedEmailIds));

    for (const email of selectedRows) {
      await client.markAsSpam(email.id, accountIdForEmail(email, mailboxes, selectedMailbox));
    }

    set(state => ({
      emails: state.emails.filter(e => !isSelectedRow(e, selectedEmailIds)),
      selectedEmail: state.selectedEmail && isSelectedRow(state.selectedEmail, selectedEmailIds)
        ? null : state.selectedEmail,
      selectedEmailIds: new Set(),
    }));
  },

  batchUndoSpam: async (client) => {
    const { mailboxes, selectedMailbox, emails, selectedEmailIds } = get();
    const selectedRows = emails.filter(e => isSelectedRow(e, selectedEmailIds));

    // Batch operations don't preserve original mailboxes: restore each row to
    // its own account's Inbox. Resolve every target before the first write so
    // a missing Inbox aborts cleanly instead of mid-loop.
    const targets = selectedRows.map(email => {
      const accountId = accountIdForEmail(email, mailboxes, selectedMailbox);
      const inboxMailbox = findAccountInbox(mailboxes, accountId);
      if (!inboxMailbox) {
        throw new Error('Inbox not found');
      }
      return { email, accountId, inboxId: inboxMailbox.originalId || inboxMailbox.id };
    });
    for (const { email, accountId, inboxId } of targets) {
      await client.undoSpam(email.id, inboxId, accountId);
    }

    set(state => ({
      emails: state.emails.filter(e => !isSelectedRow(e, selectedEmailIds)),
      selectedEmail: state.selectedEmail && isSelectedRow(state.selectedEmail, selectedEmailIds)
        ? null : state.selectedEmail,
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

      // Union of change types across every account in the payload, so a
      // group/shared account's new mail refreshes the UI like the primary's.
      const changedTypes = new Set(
        Object.values(change.changed).flatMap((types) => Object.keys(types)),
      );
      if (changedTypes.size === 0) return;

      if (changedTypes.has('Email')) {
        await get().refreshCurrentMailbox(client);
        get().fetchTagCounts(client);
        get().fetchMailboxes(client);
      }

      // Skip if already triggered by an Email change in the same push,
      // to avoid a double fetch
      if (changedTypes.has('Mailbox') && !changedTypes.has('Email')) {
        await get().fetchMailboxes(client);
      }

      // Handle Calendar/CalendarEvent state changes - refresh calendar data
      if (changedTypes.has('Calendar') || changedTypes.has('CalendarEvent')) {
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
      if (changedTypes.has('SieveScript')) {
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
    const { selectedMailbox, currentQuery } = get();

    // Only refresh when a mailbox is currently selected.
    if (!selectedMailbox) return;

    // A merged cross-account list whose cursors are not (yet) known cannot be
    // rebuilt by the single-account query below: refetching would silently
    // swap the merged rows for primary-account-only ones. Cursor-backed
    // merged lists refresh through the fan-out branch inside the try.
    if (!get().unifiedCursors) {
      const refreshTargets = resolveScopeTargets(
        currentQuery.scope,
        get().mailboxes,
        useSettingsStore.getState().unifiedInboxExcludedAccounts,
      );
      if (
        currentQuery.scope.kind === "unified" ||
        (refreshTargets !== null && refreshTargets.length > 1)
      ) {
        return;
      }
    }

    try {
      const emailsPerPage = useSettingsStore.getState().emailsPerPage;
      const currentEmails = get().emails;
      // Refetch as many rows as are currently loaded so a background refresh
      // doesn't collapse deep pagination back to the first page.
      const limit = Math.max(currentEmails.length, emailsPerPage);

      // Merged lists (unified inbox, cross-account Everywhere) refresh through
      // the same fan-out + merge path, with a fresh window sized to the loaded
      // rows so pagination depth is kept.
      if (get().unifiedCursors) {
        const { pages, merged } = await fetchUnifiedWindow(get, client, currentQuery, limit);
        // A failed page means the refreshed window is missing that account's
        // rows; replacing the list would silently drop them. Push refresh is
        // best-effort, so keep the previous list and try again next tick.
        if (pages.some(p => p.failed)) return;
        if (listChanged(currentEmails, merged.emails)) {
          set({
            emails: merged.emails,
            hasMoreEmails: hasUnifiedMore(merged.cursors),
            unifiedPages: pages,
            unifiedCursors: merged.cursors,
            unifiedDrained: merged.drained,
          });
        }
        return;
      }

      const mailboxes = get().mailboxes;
      const { accountId } = resolveMailboxAccount(mailboxes, selectedMailbox);

      // Re-run the SAME descriptor (folder OR search). Because scope lives in
      // currentQuery, a background push can never swap a search list for a
      // folder page.
      const result = await client.queryEmails(currentQuery, { limit }, accountId);

      // Chime only for a plain folder browse — never mid-search — and only for
      // genuinely newer mail: a later receivedAt than the previous newest AND
      // an id we hadn't already loaded (avoids a false chime when a remote
      // delete/move promotes an older email).
      const isFolderBrowse =
        currentQuery.scope.kind === 'folder' &&
        !currentQuery.text &&
        isFilterEmpty(currentQuery.filters ?? DEFAULT_SEARCH_FILTERS);
      const prevNewest = currentEmails[0];
      const newest = result.emails[0];
      if (
        isFolderBrowse &&
        newest &&
        (!prevNewest ||
          (new Date(newest.receivedAt).getTime() > new Date(prevNewest.receivedAt).getTime() &&
            !currentEmails.some(e => e.id === newest.id)))
      ) {
        get().handleNewEmailNotification(newest);
      }

      const hasChanged = listChanged(currentEmails, result.emails);

      if (hasChanged) {
        set({
          emails: result.emails,
          hasMoreEmails: result.hasMore,
          totalEmails: result.total,
        });
      }
    } catch { /* silent: push refresh is best-effort, keep the previous list */ }
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

  fetchThreadEmails: async (client, threadId, rowAccountId) => {
    const { threadEmailsCache, selectedMailbox, mailboxes } = get();
    const threadKey = accountScopedKey(rowAccountId, threadId);

    // Check if we already have this thread cached
    const cachedEmails = threadEmailsCache.get(threadKey);
    if (cachedEmails && cachedEmails.length > 0) {
      return cachedEmails;
    }

    // Set loading state
    set({ isLoadingThread: threadKey });

    try {
      const accountId = accountIdForEmail(
        findThreadRow(get().emails, threadId, rowAccountId),
        mailboxes,
        selectedMailbox,
      );

      // Fetch all emails in the thread
      const emails = await client.getThreadEmails(threadId, accountId);

      // Update cache
      const newCache = new Map(get().threadEmailsCache);
      newCache.set(threadKey, emails);

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

  updateThreadCache: (threadId, emails, accountId) => {
    const newCache = new Map(get().threadEmailsCache);
    newCache.set(accountScopedKey(accountId, threadId), emails);
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
          let guardId: string | null = null;
          while (true) {
            const batch = await client.queryMailboxEmailIds(jmapId, 500, 0);
            if (batch.ids.length === 0) break;
            // If the same page keeps coming back the mailbox is not draining
            // (e.g. a shared-mailbox move that the server rejected); abort
            // instead of spinning forever.
            if (batch.ids[0] === guardId) {
              throw new Error(`Mailbox ${jmapId} did not drain; aborting to avoid an infinite loop`);
            }
            guardId = batch.ids[0];
            await client.batchMoveEmails(batch.ids, trashId);
            if (batch.ids.length < 500) break;
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