import { describe, it, expect, beforeEach, vi } from "vitest";
import { useEmailStore } from "@/stores/email-store";
import { useSettingsStore } from "@/stores/settings-store";
import { UNIFIED_INBOX_ID } from "@/lib/jmap/search-utils";
import { mergeAccountPages } from "@/lib/jmap/unified-query";
import type { AccountPage, UnifiedCursor } from "@/lib/jmap/unified-query";
import type { Email, Mailbox } from "@/lib/jmap/types";
import { mkMailbox, mkClient, mkEmail as baseEmail } from "./unified-inbox-fixtures";
import { accountScopedKey } from "@/lib/thread-utils";

vi.mock("@/lib/jmap/unified-query", () => ({
  mergeAccountPages: vi.fn(),
}));

const mergeMock = vi.mocked(mergeAccountPages);

const allMailboxes: Mailbox[] = [
  mkMailbox({ id: "inbox-a", name: "Inbox", role: "inbox", accountId: "acct-primary" }),
  mkMailbox({ id: "trash-a", name: "Trash", role: "trash", accountId: "acct-primary" }),
  mkMailbox({ id: "archive-a", name: "Archive", role: "archive", accountId: "acct-primary" }),
  mkMailbox({ id: "acct-b:inbox-b", originalId: "inbox-b", name: "Inbox", role: "inbox", isShared: true, accountId: "acct-b" }),
  mkMailbox({ id: "acct-b:trash-b", originalId: "trash-b", name: "Trash", role: "trash", isShared: true, accountId: "acct-b" }),
  mkMailbox({ id: "acct-b:archive-b", originalId: "archive-b", name: "Archive", role: "archive", isShared: true, accountId: "acct-b" }),
  mkMailbox({ id: "acct-c:inbox-c", originalId: "inbox-c", name: "Inbox", role: "inbox", isShared: true, accountId: "acct-c" }),
];

function mkEmail(id: string, iso: string, accountId?: string): Email {
  return baseEmail({
    id,
    receivedAt: iso,
    mailboxIds: { [accountId ? `${accountId}:inbox-b` : "inbox-a"]: true },
    ...(accountId ? { accountId } : {}),
  });
}

describe("email-store unified inbox path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      emailsPerPage: 50,
      deleteAction: "trash",
      unifiedInboxExcludedAccounts: [],
    });
    useEmailStore.setState({
      emails: [],
      mailboxes: allMailboxes,
      selectedMailbox: UNIFIED_INBOX_ID,
      selectedEmail: null,
      selectedEmailIds: new Set(),
      currentQuery: { scope: { kind: "unified" }, sort: { by: "receivedAt", ascending: false } },
      hasMoreEmails: false,
      totalEmails: 0,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      unifiedPages: [],
      unifiedCursors: null,
      unifiedDrained: [],
    });
  });

  it("fetchEmails on the unified sentinel runs one unified query against included inboxes", async () => {
    useSettingsStore.setState({ unifiedInboxExcludedAccounts: ["acct-c"] });
    const a1 = mkEmail("a1", "2026-07-07T12:00:00Z");
    const b1 = mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b");
    const pages: AccountPage[] = [
      { accountId: "acct-primary", emails: [a1], total: 1, anchor: null },
      { accountId: "acct-b", emails: [b1], total: 1, anchor: null },
    ];
    const cursors: UnifiedCursor[] = [
      { accountId: "acct-primary", anchorEmailId: "a1", consumed: 1, exhausted: true },
      { accountId: "acct-b", anchorEmailId: "b1", consumed: 1, exhausted: true },
    ];
    mergeMock.mockReturnValue({ emails: [a1, b1], cursors, drained: [] });
    const queryEmailsUnified = vi.fn().mockResolvedValue(pages);
    const queryEmails = vi.fn();
    const client = mkClient({ queryEmailsUnified, queryEmails });

    await useEmailStore.getState().fetchEmails(client, UNIFIED_INBOX_ID);

    expect(queryEmails).not.toHaveBeenCalled();
    expect(queryEmailsUnified).toHaveBeenCalledTimes(1);
    const [query, page, targets] = queryEmailsUnified.mock.calls[0];
    expect(query.scope).toEqual({ kind: "unified" });
    expect(page).toEqual({ limit: 50 });
    expect(targets).toEqual([
      { accountId: "acct-primary", mailboxId: "inbox-a" },
      { accountId: "acct-b", mailboxId: "inbox-b" },
    ]);
    expect(mergeMock).toHaveBeenCalledWith(pages, { by: "receivedAt", ascending: false }, 50, undefined);
    const state = useEmailStore.getState();
    expect(state.emails.map(e => e.id)).toEqual(["a1", "b1"]);
    expect(state.hasMoreEmails).toBe(false);
    expect(state.totalEmails).toBe(2);
    expect(state.currentQuery.scope).toEqual({ kind: "unified" });
  });

  it("archive from the unified list patches the owning account, not the primary (#281 class)", async () => {
    useEmailStore.setState({ emails: [mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b")] });
    const moveEmail = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ moveEmail });

    await useEmailStore.getState().moveToMailbox(client, "b1", "acct-b:archive-b", "acct-b");

    expect(moveEmail).toHaveBeenCalledWith("b1", "archive-b", "acct-b");
  });

  it("archive of a primary-account row from the unified list stays on the primary account", async () => {
    useEmailStore.setState({ emails: [mkEmail("a1", "2026-07-07T12:00:00Z")] });
    const moveEmail = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ moveEmail });

    await useEmailStore.getState().moveToMailbox(client, "a1", "archive-a");

    expect(moveEmail).toHaveBeenCalledWith("a1", "archive-a", undefined);
  });

  it("delete from the unified list moves to the owning account's trash", async () => {
    useEmailStore.setState({ emails: [mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b")] });
    const moveToTrash = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ moveToTrash });

    await useEmailStore.getState().deleteEmail(client, "b1", "acct-b");

    expect(moveToTrash).toHaveBeenCalledWith("b1", "trash-b", "acct-b");
  });

  it("batch mark-as-read from the unified list groups ids per owning account", async () => {
    useEmailStore.setState({
      emails: [
        mkEmail("a1", "2026-07-07T12:00:00Z"),
        mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b"),
        mkEmail("b2", "2026-07-07T10:00:00Z", "acct-b"),
      ],
      selectedEmailIds: new Set([
        accountScopedKey(undefined, "a1"),
        accountScopedKey("acct-b", "b1"),
        accountScopedKey("acct-b", "b2"),
      ]),
    });
    const batchMarkAsRead = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ batchMarkAsRead });

    await useEmailStore.getState().batchMarkAsRead(client, true);

    expect(batchMarkAsRead).toHaveBeenCalledTimes(2);
    expect(batchMarkAsRead).toHaveBeenCalledWith(["a1"], true, undefined);
    expect(batchMarkAsRead).toHaveBeenCalledWith(["b1", "b2"], true, "acct-b");
  });

  it("batch delete from the unified list moves each group to its own account's trash", async () => {
    useEmailStore.setState({
      emails: [
        mkEmail("a1", "2026-07-07T12:00:00Z"),
        mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b"),
      ],
      selectedEmailIds: new Set([
        accountScopedKey(undefined, "a1"),
        accountScopedKey("acct-b", "b1"),
      ]),
    });
    const batchMoveEmails = vi.fn().mockResolvedValue(undefined);
    const batchDeleteEmails = vi.fn();
    const client = mkClient({ batchMoveEmails, batchDeleteEmails });

    await useEmailStore.getState().batchDelete(client);

    expect(batchDeleteEmails).not.toHaveBeenCalled();
    expect(batchMoveEmails).toHaveBeenCalledTimes(2);
    expect(batchMoveEmails).toHaveBeenCalledWith(["a1"], "trash-a", undefined);
    expect(batchMoveEmails).toHaveBeenCalledWith(["b1"], "trash-b", "acct-b");
  });

  it("batch move from the unified list routes to the owning account and refreshes via the unified path", async () => {
    useEmailStore.setState({
      emails: [
        mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b"),
        mkEmail("b2", "2026-07-07T10:00:00Z", "acct-b"),
      ],
      selectedEmailIds: new Set([
        accountScopedKey("acct-b", "b1"),
        accountScopedKey("acct-b", "b2"),
      ]),
      unifiedCursors: [
        { accountId: "acct-b", anchorEmailId: "b2", consumed: 2, exhausted: true },
      ],
    });
    const batchMoveEmails = vi.fn().mockResolvedValue(undefined);
    const queryEmailsUnified = vi.fn().mockResolvedValue([]);
    mergeMock.mockReturnValue({ emails: [], cursors: [], drained: [] });
    const client = mkClient({ batchMoveEmails, queryEmailsUnified });

    await useEmailStore.getState().batchMoveToMailbox(client, "acct-b:archive-b");

    expect(batchMoveEmails).toHaveBeenCalledTimes(1);
    // The store id acct-b:archive-b resolves to the account-local JMAP id.
    expect(batchMoveEmails).toHaveBeenCalledWith(["b1", "b2"], "archive-b", "acct-b");
    expect(queryEmailsUnified).toHaveBeenCalledTimes(1);
  });

  it("delete from a merged Everywhere search routes to the row's owning account", async () => {
    useEmailStore.setState({
      selectedMailbox: "inbox-a",
      currentQuery: { scope: { kind: "all", includeTrashJunk: false }, sort: { by: "receivedAt", ascending: false } },
      emails: [mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b")],
    });
    const moveToTrash = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ moveToTrash });

    await useEmailStore.getState().deleteEmail(client, "b1", "acct-b");

    expect(moveToTrash).toHaveBeenCalledWith("b1", "trash-b", "acct-b");
  });

  it("toggleStar from the unified list patches the owning account", async () => {
    useEmailStore.setState({ emails: [mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b")] });
    const toggleStar = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ toggleStar });

    await useEmailStore.getState().toggleStar(client, "b1", "acct-b");

    expect(toggleStar).toHaveBeenCalledWith("b1", true, "acct-b");
  });

  it("markAsSpam from the unified list routes to the owning account and caches its inbox for undo", async () => {
    useEmailStore.setState({ emails: [mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b")] });
    const markAsSpam = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ markAsSpam });

    await useEmailStore.getState().markAsSpam(client, "b1", "acct-b");

    expect(markAsSpam).toHaveBeenCalledWith("b1", "acct-b");
    expect(useEmailStore.getState().spamUndoCache.get(accountScopedKey("acct-b", "b1"))).toEqual({
      emailId: "b1",
      originalMailboxId: "inbox-b",
      accountId: "acct-b",
    });
  });

  it("batchMarkAsSpam from the unified list routes each email to its owning account", async () => {
    useEmailStore.setState({
      emails: [
        mkEmail("a1", "2026-07-07T12:00:00Z"),
        mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b"),
      ],
      selectedEmailIds: new Set([
        accountScopedKey(undefined, "a1"),
        accountScopedKey("acct-b", "b1"),
      ]),
    });
    const markAsSpam = vi.fn().mockResolvedValue(undefined);
    const client = mkClient({ markAsSpam });

    await useEmailStore.getState().batchMarkAsSpam(client);

    expect(markAsSpam).toHaveBeenCalledTimes(2);
    expect(markAsSpam).toHaveBeenCalledWith("a1", undefined);
    expect(markAsSpam).toHaveBeenCalledWith("b1", "acct-b");
  });

  it("archiving a thread from the unified list detaches it from the owning account's inbox", async () => {
    useEmailStore.setState({ emails: [mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b")] });
    const moveThreadToMailbox = vi.fn().mockResolvedValue(["b1"]);
    const client = mkClient({ moveThreadToMailbox });

    // Callers resolve role mailboxes from the flat list, so from the unified
    // view the destination arrives as the primary account's Archive.
    await useEmailStore.getState().moveThreadToMailbox(client, "t-b1", "archive-a", "acct-b");

    expect(moveThreadToMailbox).toHaveBeenCalledWith("t-b1", "archive-b", "inbox-b", "acct-b");
  });

  it("push refresh keeps the merged list intact when one account's page fails", async () => {
    const a1 = mkEmail("a1", "2026-07-07T12:00:00Z");
    const b1 = mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b");
    useEmailStore.setState({
      emails: [a1, b1],
      unifiedPages: [
        { accountId: "acct-primary", emails: [a1], total: 1, anchor: null },
        { accountId: "acct-b", emails: [b1], total: 1, anchor: null },
      ],
      unifiedCursors: [
        { accountId: "acct-primary", anchorEmailId: "a1", consumed: 1, exhausted: true },
        { accountId: "acct-b", anchorEmailId: "b1", consumed: 1, exhausted: true },
      ],
    });
    const queryEmailsUnified = vi.fn().mockResolvedValue([
      { accountId: "acct-primary", emails: [a1], total: 1, anchor: null },
      { accountId: "acct-b", emails: [], anchor: null, failed: true },
      { accountId: "acct-c", emails: [], total: 0, anchor: null },
    ]);
    mergeMock.mockReturnValue({ emails: [a1], cursors: [], drained: [] });
    const client = mkClient({ queryEmailsUnified });

    await useEmailStore.getState().refreshCurrentMailbox(client);

    expect(useEmailStore.getState().emails.map(e => e.id)).toEqual(["a1", "b1"]);
  });

  it("an all-failed unified fetch renders empty instead of an error-blanked list", async () => {
    const failedPages: AccountPage[] = [
      { accountId: "acct-primary", emails: [], anchor: null, failed: true },
      { accountId: "acct-b", emails: [], anchor: null, failed: true },
      { accountId: "acct-c", emails: [], anchor: null, failed: true },
    ];
    const queryEmailsUnified = vi.fn().mockResolvedValue(failedPages);
    mergeMock.mockReturnValue({
      emails: [],
      cursors: failedPages.map(p => ({ accountId: p.accountId, anchorEmailId: null, consumed: 0, exhausted: false })),
      drained: [],
    });
    const client = mkClient({ queryEmailsUnified });

    await useEmailStore.getState().fetchEmails(client, UNIFIED_INBOX_ID);

    const state = useEmailStore.getState();
    expect(state.error).toBeNull();
    expect(state.emails).toEqual([]);
    expect(state.unifiedPages).toEqual(failedPages);
  });

  it("loadMoreEmails retries accounts whose page failed on the initial fetch", async () => {
    const a1 = mkEmail("a1", "2026-07-07T12:00:00Z");
    const pageA: AccountPage = { accountId: "acct-primary", emails: [a1], total: 1, anchor: null };
    const failedB: AccountPage = { accountId: "acct-b", emails: [], anchor: null, failed: true };
    const seededCursors: UnifiedCursor[] = [
      { accountId: "acct-primary", anchorEmailId: "a1", consumed: 1, exhausted: true },
      { accountId: "acct-b", anchorEmailId: null, consumed: 0, exhausted: false },
    ];
    useEmailStore.setState({
      emails: [a1],
      hasMoreEmails: true,
      unifiedPages: [pageA, failedB],
      unifiedCursors: seededCursors,
      unifiedDrained: [],
    });

    const b1 = mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b");
    const recoveredB: AccountPage = { accountId: "acct-b", emails: [b1], total: 1, anchor: null };
    const queryEmailsUnified = vi.fn().mockResolvedValue([recoveredB]);
    mergeMock.mockReturnValue({
      emails: [b1],
      cursors: [
        { accountId: "acct-primary", anchorEmailId: "a1", consumed: 1, exhausted: true },
        { accountId: "acct-b", anchorEmailId: "b1", consumed: 1, exhausted: true },
      ],
      drained: [],
    });
    const client = mkClient({ queryEmailsUnified });

    await useEmailStore.getState().loadMoreEmails(client);

    expect(queryEmailsUnified).toHaveBeenCalledTimes(1);
    const [, page, targets] = queryEmailsUnified.mock.calls[0];
    expect(page).toEqual({ limit: 50 });
    expect(targets).toEqual([{ accountId: "acct-b", mailboxId: "inbox-b" }]);
    expect(mergeMock).toHaveBeenCalledWith(
      [pageA, recoveredB],
      { by: "receivedAt", ascending: false },
      50,
      seededCursors,
    );
    const state = useEmailStore.getState();
    expect(state.emails.map(e => e.id)).toEqual(["a1", "b1"]);
    expect(state.unifiedPages).toEqual([pageA, recoveredB]);
    expect(state.hasMoreEmails).toBe(false);
  });

  it("a failed folder query clears stale unified state so push refresh can recover", async () => {
    useEmailStore.setState({
      selectedMailbox: "inbox-a",
      unifiedPages: [{ accountId: "acct-b", emails: [], anchor: null }],
      unifiedCursors: [{ accountId: "acct-b", anchorEmailId: null, consumed: 0, exhausted: false }],
      unifiedDrained: ["acct-b"],
    });
    const queryEmails = vi.fn().mockRejectedValue(new Error("boom"));
    const client = mkClient({ queryEmails });

    await useEmailStore.getState().fetchEmails(client, "inbox-a");

    const state = useEmailStore.getState();
    expect(state.error).toBe("boom");
    expect(state.unifiedCursors).toBeNull();
    expect(state.unifiedPages).toEqual([]);
    expect(state.unifiedDrained).toEqual([]);
  });

  it("loadMoreEmails in unified scope refetches only drained accounts and merges through cursors", async () => {
    const a1 = mkEmail("a1", "2026-07-07T12:00:00Z");
    const b1 = mkEmail("b1", "2026-07-07T11:00:00Z", "acct-b");
    const bufferedPages: AccountPage[] = [
      { accountId: "acct-primary", emails: [a1], total: 10, anchor: "a1" },
      { accountId: "acct-b", emails: [b1], total: 10, anchor: "b1" },
    ];
    const cursors: UnifiedCursor[] = [
      { accountId: "acct-primary", anchorEmailId: "a1", consumed: 1, exhausted: false },
      { accountId: "acct-b", anchorEmailId: "b1", consumed: 1, exhausted: false },
    ];
    useEmailStore.setState({
      emails: [a1, b1],
      hasMoreEmails: true,
      unifiedPages: bufferedPages,
      unifiedCursors: cursors,
      unifiedDrained: ["acct-b"],
    });

    const b2 = mkEmail("b2", "2026-07-07T10:30:00Z", "acct-b");
    const refreshedB: AccountPage = { accountId: "acct-b", emails: [b1, b2], total: 10, anchor: "b2" };
    const queryEmailsUnified = vi.fn().mockResolvedValue([refreshedB]);
    const nextCursors: UnifiedCursor[] = [
      { accountId: "acct-primary", anchorEmailId: "a1", consumed: 1, exhausted: false },
      { accountId: "acct-b", anchorEmailId: "b2", consumed: 2, exhausted: false },
    ];
    mergeMock.mockReturnValue({ emails: [b2], cursors: nextCursors, drained: ["acct-primary"] });
    const client = mkClient({ queryEmailsUnified });

    await useEmailStore.getState().loadMoreEmails(client);

    expect(queryEmailsUnified).toHaveBeenCalledTimes(1);
    const [query, page, targets] = queryEmailsUnified.mock.calls[0];
    expect(query.scope).toEqual({ kind: "unified" });
    expect(page).toEqual({ limit: 51 });
    expect(targets).toEqual([{ accountId: "acct-b", mailboxId: "inbox-b" }]);
    expect(mergeMock).toHaveBeenCalledWith(
      [bufferedPages[0], refreshedB],
      { by: "receivedAt", ascending: false },
      50,
      cursors,
    );
    const state = useEmailStore.getState();
    expect(state.emails.map(e => e.id)).toEqual(["a1", "b1", "b2"]);
    expect(state.unifiedDrained).toEqual(["acct-primary"]);
    expect(state.hasMoreEmails).toBe(true);
    expect(state.isLoadingMore).toBe(false);
  });
});
