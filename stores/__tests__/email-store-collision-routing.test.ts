import { describe, it, expect, beforeEach, vi } from "vitest";
import { useEmailStore } from "@/stores/email-store";
import { useSettingsStore } from "@/stores/settings-store";
import { UNIFIED_INBOX_ID } from "@/lib/jmap/search-utils";
import { mergeAccountPages } from "@/lib/jmap/unified-query";
import { accountScopedKey } from "@/lib/thread-utils";
import type { Email, Mailbox } from "@/lib/jmap/types";
import { mkMailbox, mkClient, mkEmail } from "./unified-inbox-fixtures";

vi.mock("@/lib/jmap/unified-query", () => ({
  mergeAccountPages: vi.fn(),
}));

const mergeMock = vi.mocked(mergeAccountPages);

// JMAP ids are account-local (RFC 8620), so a unified list can hold two
// unrelated rows sharing the same id/threadId. These tests pin that every
// action lands on the account of the row the user acted on, never on
// whichever colliding row happens to sort first.

const allMailboxes: Mailbox[] = [
  mkMailbox({ id: "inbox-a", name: "Inbox", role: "inbox", accountId: "acct-primary" }),
  mkMailbox({ id: "trash-a", name: "Trash", role: "trash", accountId: "acct-primary" }),
  mkMailbox({ id: "archive-a", name: "Archive", role: "archive", accountId: "acct-primary" }),
  mkMailbox({ id: "folder-a", name: "Projects", accountId: "acct-primary" }),
  mkMailbox({ id: "acct-b:inbox-b", originalId: "inbox-b", name: "Inbox", role: "inbox", isShared: true, accountId: "acct-b" }),
  mkMailbox({ id: "acct-b:trash-b", originalId: "trash-b", name: "Trash", role: "trash", isShared: true, accountId: "acct-b" }),
  mkMailbox({ id: "acct-b:archive-b", originalId: "archive-b", name: "Archive", role: "archive", isShared: true, accountId: "acct-b" }),
];

// Colliding rows: same id and threadId in two accounts. The stamped acct-b
// row sorts first so a bare first-match scan would always pick it.
function collidingRows(): { groupRow: Email; primaryRow: Email } {
  return {
    groupRow: mkEmail({ id: "x1", accountId: "acct-b", mailboxIds: { "acct-b:inbox-b": true }, receivedAt: "2026-07-07T12:00:00Z" }),
    primaryRow: mkEmail({ id: "x1", mailboxIds: { "inbox-a": true }, receivedAt: "2026-07-07T11:00:00Z" }),
  };
}

describe("cross-account id collisions in merged views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      emailsPerPage: 50,
      deleteAction: "trash",
      unifiedInboxExcludedAccounts: [],
    });
    const { groupRow, primaryRow } = collidingRows();
    useEmailStore.setState({
      emails: [groupRow, primaryRow],
      mailboxes: allMailboxes,
      selectedMailbox: UNIFIED_INBOX_ID,
      selectedEmail: null,
      selectedEmailIds: new Set(),
      currentQuery: { scope: { kind: "unified" }, sort: { by: "receivedAt", ascending: false } },
      error: null,
      spamUndoCache: new Map(),
      threadEmailsCache: new Map(),
      unifiedPages: [],
      unifiedCursors: null,
      unifiedDrained: [],
      isLoadingMore: false,
      hasMoreEmails: false,
    });
  });

  it("deleteEmail on the primary row trashes in the primary account, not the colliding group row's", async () => {
    const moveToTrash = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ moveToTrash });

    await useEmailStore.getState().deleteEmail(client, "x1", undefined);

    expect(moveToTrash).toHaveBeenCalledWith("x1", "trash-a", undefined);
    expect(useEmailStore.getState().emails.map(e => e.accountId)).toEqual(["acct-b"]);
  });

  it("deleteEmail on the group row trashes in acct-b and keeps the primary row", async () => {
    const moveToTrash = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ moveToTrash });

    await useEmailStore.getState().deleteEmail(client, "x1", "acct-b");

    expect(moveToTrash).toHaveBeenCalledWith("x1", "trash-b", "acct-b");
    expect(useEmailStore.getState().emails.map(e => e.accountId)).toEqual([undefined]);
  });

  it("toggleStar flags only the acted row's account", async () => {
    const toggleStar = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ toggleStar });

    await useEmailStore.getState().toggleStar(client, "x1", undefined);

    expect(toggleStar).toHaveBeenCalledWith("x1", true, undefined);
    const flags = useEmailStore.getState().emails.map(e => !!e.keywords.$flagged);
    expect(flags).toEqual([false, true]);
  });

  it("markAsSpam removes only the acted row and routes to its account", async () => {
    const markAsSpam = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ markAsSpam });

    await useEmailStore.getState().markAsSpam(client, "x1", "acct-b");

    expect(markAsSpam).toHaveBeenCalledWith("x1", "acct-b");
    expect(useEmailStore.getState().emails.map(e => e.accountId)).toEqual([undefined]);
  });

  it("moveThreadToMailbox follows the acted row's account on a colliding threadId", async () => {
    const moveThreadToMailbox = vi.fn().mockResolvedValue(["x1"]);
    const client = mkClient({ moveThreadToMailbox });

    await useEmailStore.getState().moveThreadToMailbox(client, "t-x1", "archive-a", "acct-b");

    expect(moveThreadToMailbox).toHaveBeenCalledWith("t-x1", "archive-b", "inbox-b", "acct-b");
    // The primary account's colliding conversation stays listed.
    expect(useEmailStore.getState().emails.map(e => e.accountId)).toEqual([undefined]);
  });

  it("moveThreadToMailbox with no stamp acts on the primary conversation", async () => {
    const moveThreadToMailbox = vi.fn().mockResolvedValue(["x1"]);
    const client = mkClient({ moveThreadToMailbox });

    await useEmailStore.getState().moveThreadToMailbox(client, "t-x1", "archive-a", undefined);

    expect(moveThreadToMailbox).toHaveBeenCalledWith("t-x1", "archive-a", "inbox-a", undefined);
    expect(useEmailStore.getState().emails.map(e => e.accountId)).toEqual(["acct-b"]);
  });

  it("selecting one of two colliding rows batch-deletes only that row's account", async () => {
    useEmailStore.setState({ selectedEmailIds: new Set([accountScopedKey("acct-b", "x1")]) });
    const batchMoveEmails = vi.fn().mockResolvedValue(undefined);
    const batchDeleteEmails = vi.fn();
    const client = mkClient({ batchMoveEmails, batchDeleteEmails });

    await useEmailStore.getState().batchDelete(client);

    expect(batchMoveEmails).toHaveBeenCalledTimes(1);
    expect(batchMoveEmails).toHaveBeenCalledWith(["x1"], "trash-b", "acct-b");
    expect(useEmailStore.getState().emails.map(e => e.accountId)).toEqual([undefined]);
  });

  it("batch move remaps the destination to each group's own account", async () => {
    useEmailStore.setState({
      selectedEmailIds: new Set([
        accountScopedKey(undefined, "x1"),
        accountScopedKey("acct-b", "x1"),
      ]),
    });
    const batchMoveEmails = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ batchMoveEmails, queryEmails: vi.fn().mockResolvedValue({ emails: [], total: 0, hasMore: false }) });

    await useEmailStore.getState().batchMoveToMailbox(client, "archive-a");

    expect(batchMoveEmails).toHaveBeenCalledTimes(2);
    expect(batchMoveEmails).toHaveBeenCalledWith(["x1"], "archive-b", "acct-b");
    expect(batchMoveEmails).toHaveBeenCalledWith(["x1"], "archive-a", undefined);
  });

  it("batch move refuses a destination with no equivalent in the owning account", async () => {
    useEmailStore.setState({ selectedEmailIds: new Set([accountScopedKey("acct-b", "x1")]) });
    const batchMoveEmails = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ batchMoveEmails, queryEmails: vi.fn().mockResolvedValue({ emails: [], total: 0, hasMore: false }) });

    await expect(useEmailStore.getState().batchMoveToMailbox(client, "folder-a")).rejects.toThrow();

    expect(batchMoveEmails).not.toHaveBeenCalled();
    expect(useEmailStore.getState().emails).toHaveLength(2);
    expect(useEmailStore.getState().error).toBeTruthy();
  });

  it("batchUndoSpam restores each selected row to its own account's inbox", async () => {
    useEmailStore.setState({
      selectedEmailIds: new Set([
        accountScopedKey(undefined, "x1"),
        accountScopedKey("acct-b", "x1"),
      ]),
    });
    const undoSpam = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ undoSpam });

    await useEmailStore.getState().batchUndoSpam(client);

    expect(undoSpam).toHaveBeenCalledTimes(2);
    expect(undoSpam).toHaveBeenCalledWith("x1", "inbox-b", "acct-b");
    expect(undoSpam).toHaveBeenCalledWith("x1", "inbox-a", undefined);
  });

  it("thread expansion caches colliding threads per account", async () => {
    const getThreadEmails = vi.fn()
      .mockResolvedValueOnce([mkEmail({ id: "x1" })])
      .mockResolvedValueOnce([mkEmail({ id: "x1", accountId: "acct-b" })]);
    const client = mkClient({ getThreadEmails });

    await useEmailStore.getState().fetchThreadEmails(client, "t-x1", undefined);
    await useEmailStore.getState().fetchThreadEmails(client, "t-x1", "acct-b");

    expect(getThreadEmails).toHaveBeenCalledTimes(2);
    expect(getThreadEmails).toHaveBeenNthCalledWith(1, "t-x1", undefined);
    expect(getThreadEmails).toHaveBeenNthCalledWith(2, "t-x1", "acct-b");
    const cache = useEmailStore.getState().threadEmailsCache;
    expect(cache.get(accountScopedKey(undefined, "t-x1"))).toHaveLength(1);
    expect(cache.get(accountScopedKey("acct-b", "t-x1"))).toHaveLength(1);
  });

  it("unified load-more keeps a row whose id collides with an already-listed account's row", async () => {
    const { groupRow, primaryRow } = collidingRows();
    useEmailStore.setState({
      emails: [primaryRow],
      hasMoreEmails: true,
      unifiedPages: [],
      unifiedCursors: [
        { accountId: "acct-primary", anchorEmailId: "x1", consumed: 1, exhausted: false },
        { accountId: "acct-b", anchorEmailId: null, consumed: 0, exhausted: false },
      ],
      unifiedDrained: [],
    });
    mergeMock.mockReturnValue({
      emails: [groupRow],
      cursors: [
        { accountId: "acct-primary", anchorEmailId: "x1", consumed: 1, exhausted: true },
        { accountId: "acct-b", anchorEmailId: "x1", consumed: 1, exhausted: true },
      ],
      drained: [],
    });
    const client = mkClient({});

    await useEmailStore.getState().loadMoreEmails(client);

    expect(useEmailStore.getState().emails.map(e => e.accountId)).toEqual([undefined, "acct-b"]);
  });
});
