import { describe, it, expect, beforeEach, vi } from "vitest";
import { useEmailStore } from "@/stores/email-store";
import { useSettingsStore } from "@/stores/settings-store";
import { UNIFIED_INBOX_ID } from "@/lib/jmap/search-utils";
import type { AccountPage } from "@/lib/jmap/unified-query";
import type { Email, Mailbox } from "@/lib/jmap/types";
import { mkMailbox, mkClient, mkEmail as baseEmail } from "./unified-inbox-fixtures";

const allMailboxes: Mailbox[] = [
  mkMailbox({ id: "inbox-a", name: "Inbox", role: "inbox", accountId: "acc-a" }),
  mkMailbox({ id: "acc-b:inbox-b", originalId: "inbox-b", name: "Inbox", role: "inbox", isShared: true, accountId: "acc-b" }),
  mkMailbox({ id: "acc-c:inbox-c", originalId: "inbox-c", name: "Inbox", role: "inbox", isShared: true, accountId: "acc-c" }),
];

function mkEmail(id: string, iso: string, accountId?: string): Email {
  return baseEmail({
    id,
    receivedAt: iso,
    mailboxIds: { "inbox-a": true },
    ...(accountId ? { accountId } : {}),
  });
}

describe("email-store unified partial-failure notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      emailsPerPage: 50,
      unifiedInboxExcludedAccounts: [],
    });
    useEmailStore.setState({
      emails: [],
      mailboxes: allMailboxes,
      selectedMailbox: UNIFIED_INBOX_ID,
      selectedEmail: null,
      currentQuery: { scope: { kind: "unified" }, sort: { by: "receivedAt", ascending: false } },
      hasMoreEmails: false,
      totalEmails: 0,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      unifiedPages: [],
      unifiedCursors: null,
      unifiedDrained: [],
      failedAccounts: [],
    });
  });

  it("keeps successful pages and records the failed account", async () => {
    const a1 = mkEmail("a1", "2026-07-07T12:00:00Z");
    const a2 = mkEmail("a2", "2026-07-07T11:00:00Z");
    const pages: AccountPage[] = [
      { accountId: "acc-a", emails: [a1, a2], total: 2, anchor: null },
      { accountId: "acc-b", emails: [], anchor: null, failed: true },
    ];
    const queryEmailsUnified = vi.fn().mockResolvedValue(pages);
    const client = mkClient({ queryEmailsUnified });

    await useEmailStore.getState().fetchEmails(client, UNIFIED_INBOX_ID);

    const state = useEmailStore.getState();
    expect(state.error).toBeNull();
    expect(state.emails.map(e => e.id)).toEqual(["a1", "a2"]);
    expect(state.failedAccounts).toEqual(["acc-b"]);
  });

  it("records every failed account when several accounts fail", async () => {
    const a1 = mkEmail("a1", "2026-07-07T12:00:00Z");
    const pages: AccountPage[] = [
      { accountId: "acc-a", emails: [a1], total: 1, anchor: null },
      { accountId: "acc-b", emails: [], anchor: null, failed: true },
      { accountId: "acc-c", emails: [], anchor: null, failed: true },
    ];
    const queryEmailsUnified = vi.fn().mockResolvedValue(pages);
    const client = mkClient({ queryEmailsUnified });

    await useEmailStore.getState().fetchEmails(client, UNIFIED_INBOX_ID);

    expect(useEmailStore.getState().failedAccounts).toEqual(["acc-b", "acc-c"]);
  });

  it("dismissFailedAccounts clears the notice without touching the list", async () => {
    const a1 = mkEmail("a1", "2026-07-07T12:00:00Z");
    useEmailStore.setState({ emails: [a1], failedAccounts: ["acc-b"] });

    useEmailStore.getState().dismissFailedAccounts();

    const state = useEmailStore.getState();
    expect(state.failedAccounts).toEqual([]);
    expect(state.emails.map(e => e.id)).toEqual(["a1"]);
  });

  it("retryQuery re-runs the current query and clears the failure state", async () => {
    const a1 = mkEmail("a1", "2026-07-07T12:00:00Z");
    useEmailStore.setState({ emails: [a1], failedAccounts: ["acc-b"] });

    const b1 = mkEmail("b1", "2026-07-07T11:30:00Z", "acc-b");
    const pages: AccountPage[] = [
      { accountId: "acc-a", emails: [a1], total: 1, anchor: null },
      { accountId: "acc-b", emails: [b1], total: 1, anchor: null },
    ];
    const queryEmailsUnified = vi.fn().mockResolvedValue(pages);
    const client = mkClient({ queryEmailsUnified });

    await useEmailStore.getState().retryQuery(client);

    expect(queryEmailsUnified).toHaveBeenCalledTimes(1);
    const state = useEmailStore.getState();
    expect(state.emails.map(e => e.id)).toEqual(["a1", "b1"]);
    expect(state.failedAccounts).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it("loadMoreEmails clears the notice once a failed account's refetch succeeds", async () => {
    const a1 = mkEmail("a1", "2026-07-07T12:00:00Z");
    const a2 = mkEmail("a2", "2026-07-07T11:00:00Z");
    const initialPages: AccountPage[] = [
      { accountId: "acc-a", emails: [a1, a2], total: 2, anchor: null },
      { accountId: "acc-b", emails: [], anchor: null, failed: true },
    ];
    const b1 = mkEmail("b1", "2026-07-07T10:00:00Z", "acc-b");
    const recoveredPages: AccountPage[] = [
      { accountId: "acc-b", emails: [b1], total: 1, anchor: null },
    ];
    const queryEmailsUnified = vi.fn()
      .mockResolvedValueOnce(initialPages)
      .mockResolvedValueOnce(recoveredPages);
    const client = mkClient({ queryEmailsUnified });

    await useEmailStore.getState().fetchEmails(client, UNIFIED_INBOX_ID);
    expect(useEmailStore.getState().failedAccounts).toEqual(["acc-b"]);
    expect(useEmailStore.getState().hasMoreEmails).toBe(true);

    await useEmailStore.getState().loadMoreEmails(client);

    const state = useEmailStore.getState();
    expect(state.emails.map(e => e.id)).toEqual(["a1", "a2", "b1"]);
    expect(state.failedAccounts).toEqual([]);
  });

  it("loadMoreEmails surfaces an account whose refetch fails during paging", async () => {
    useSettingsStore.setState({ emailsPerPage: 2 });
    const a1 = mkEmail("a1", "2026-07-07T12:00:00Z");
    const a2 = mkEmail("a2", "2026-07-07T11:00:00Z");
    const b1 = mkEmail("b1", "2026-07-07T10:00:00Z", "acc-b");
    const initialPages: AccountPage[] = [
      { accountId: "acc-a", emails: [a1, a2], total: 5, anchor: "a2" },
      { accountId: "acc-b", emails: [b1], total: 1, anchor: null },
    ];
    const failedRefetch: AccountPage[] = [
      { accountId: "acc-a", emails: [], anchor: null, failed: true },
    ];
    const queryEmailsUnified = vi.fn()
      .mockResolvedValueOnce(initialPages)
      .mockResolvedValueOnce(failedRefetch);
    const client = mkClient({ queryEmailsUnified });

    await useEmailStore.getState().fetchEmails(client, UNIFIED_INBOX_ID);
    expect(useEmailStore.getState().failedAccounts).toEqual([]);
    expect(useEmailStore.getState().hasMoreEmails).toBe(true);

    await useEmailStore.getState().loadMoreEmails(client);

    const state = useEmailStore.getState();
    expect(state.emails.map(e => e.id)).toEqual(["a1", "a2", "b1"]);
    expect(state.failedAccounts).toEqual(["acc-a"]);
  });

  it("retryQuery ignores a second click while the retry is in flight", async () => {
    useEmailStore.setState({ failedAccounts: ["acc-b"] });
    const b1 = mkEmail("b1", "2026-07-07T11:30:00Z", "acc-b");
    const pages: AccountPage[] = [
      { accountId: "acc-a", emails: [], total: 0, anchor: null },
      { accountId: "acc-b", emails: [b1], total: 1, anchor: null },
    ];
    let resolveFetch!: (p: AccountPage[]) => void;
    const pending = new Promise<AccountPage[]>((resolve) => { resolveFetch = resolve; });
    const queryEmailsUnified = vi.fn().mockReturnValue(pending);
    const client = mkClient({ queryEmailsUnified });

    const first = useEmailStore.getState().retryQuery(client);
    const second = useEmailStore.getState().retryQuery(client);
    resolveFetch(pages);
    await Promise.all([first, second]);

    expect(queryEmailsUnified).toHaveBeenCalledTimes(1);
    expect(useEmailStore.getState().emails.map(e => e.id)).toEqual(["b1"]);
  });

  it("a stale retry response does not overwrite a newer search", async () => {
    useEmailStore.setState({ failedAccounts: ["acc-b"] });
    const r1 = mkEmail("r1", "2026-07-07T12:00:00Z", "acc-a");
    const retryPages: AccountPage[] = [
      { accountId: "acc-a", emails: [r1], total: 1, anchor: null },
    ];
    const s1 = mkEmail("s1", "2026-07-07T09:00:00Z", "acc-a");
    const searchPages: AccountPage[] = [
      { accountId: "acc-a", emails: [s1], total: 1, anchor: null },
      { accountId: "acc-b", emails: [], total: 0, anchor: null },
      { accountId: "acc-c", emails: [], total: 0, anchor: null },
    ];
    let resolveRetry!: (p: AccountPage[]) => void;
    const retryPending = new Promise<AccountPage[]>((resolve) => { resolveRetry = resolve; });
    const queryEmailsUnified = vi.fn()
      .mockReturnValueOnce(retryPending)
      .mockResolvedValueOnce(searchPages);
    const client = mkClient({ queryEmailsUnified });

    const retryPromise = useEmailStore.getState().retryQuery(client);
    await useEmailStore.getState().advancedSearch(client);
    resolveRetry(retryPages);
    await retryPromise;

    const state = useEmailStore.getState();
    expect(state.currentQuery.scope.kind).toBe("all");
    expect(state.emails.map(e => e.id)).toEqual(["s1"]);
  });

  it("a new folder query clears a stale failure notice", async () => {
    useEmailStore.setState({ failedAccounts: ["acc-b"] });
    const a1 = mkEmail("a1", "2026-07-07T12:00:00Z");
    const queryEmails = vi.fn().mockResolvedValue({ emails: [a1], total: 1, hasMore: false });
    const client = mkClient({ queryEmails });

    await useEmailStore.getState().fetchEmails(client, "inbox-a");

    const state = useEmailStore.getState();
    expect(state.emails.map(e => e.id)).toEqual(["a1"]);
    expect(state.failedAccounts).toEqual([]);
  });
});
