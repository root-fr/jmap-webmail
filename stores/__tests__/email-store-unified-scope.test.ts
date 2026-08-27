import { describe, it, expect, beforeEach, vi } from "vitest";
import { useEmailStore } from "@/stores/email-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { JMAPClient } from "@/lib/jmap/client";
import type { Mailbox } from "@/lib/jmap/types";
import { mkMailbox, mkEmail as makeEmail, mkClient as bareClient } from "./unified-inbox-fixtures";

const multiAccountMailboxes: Mailbox[] = [
  mkMailbox({ id: "inbox-a", name: "Inbox", role: "inbox", accountId: "acc-a" }),
  mkMailbox({ id: "acc-b:inbox-b", originalId: "inbox-b", name: "Inbox", role: "inbox", isShared: true, accountId: "acc-b" }),
  mkMailbox({ id: "acc-c:inbox-c", originalId: "inbox-c", name: "Inbox", role: "inbox", isShared: true, accountId: "acc-c" }),
];

const pageA = {
  accountId: 'acc-a',
  emails: [makeEmail({ id: 'a1', receivedAt: '2026-07-05T10:00:00Z' })],
  total: 1,
  anchor: null, // total 1 with 1 row buffered: exhausted
};
const pageB = {
  accountId: 'acc-b',
  emails: [makeEmail({ id: 'b1', receivedAt: '2026-07-06T10:00:00Z', accountId: 'acc-b' })],
  total: 1,
  anchor: null,
};

function mkClient(overrides: Record<string, unknown> = {}): JMAPClient {
  return bareClient({
    queryEmails: vi.fn().mockResolvedValue({ emails: [], total: 0, position: 0, hasMore: false }),
    queryEmailsUnified: vi.fn().mockResolvedValue([pageA, pageB]),
    ...overrides,
  });
}

describe("runQuery unified/cross-account routing", () => {
  beforeEach(() => {
    useEmailStore.setState({
      emails: [],
      mailboxes: multiAccountMailboxes,
      selectedMailbox: "inbox-a",
      currentQuery: { scope: { kind: "folder", mailboxId: "inbox-a" }, sort: { by: "receivedAt", ascending: false } },
      hasMoreEmails: false,
      totalEmails: 0,
      isLoading: false,
      error: null,
    });
    useSettingsStore.setState({ unifiedInboxExcludedAccounts: [] });
  });

  it("routes a unified scope through queryEmailsUnified targeting each included account's inbox", async () => {
    useSettingsStore.setState({ unifiedInboxExcludedAccounts: ["acc-c"] });
    const client = mkClient();

    await useEmailStore.getState().setScope(client, { kind: "unified" });

    expect(client.queryEmailsUnified).toHaveBeenCalledTimes(1);
    expect(client.queryEmailsUnified).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { kind: "unified" } }),
      { limit: expect.any(Number) },
      [
        { accountId: "acc-a", mailboxId: "inbox-a" },
        { accountId: "acc-b", mailboxId: "inbox-b" },
      ],
    );
  });

  it("fans an Everywhere search out across every session account instead of only the primary", async () => {
    const client = mkClient();

    await useEmailStore.getState().setScope(client, { kind: "all", includeTrashJunk: false });

    expect(client.queryEmails).not.toHaveBeenCalled();
    expect(client.queryEmailsUnified).toHaveBeenCalledWith(
      expect.anything(),
      { limit: expect.any(Number) },
      [{ accountId: "acc-a" }, { accountId: "acc-b" }, { accountId: "acc-c" }],
    );
  });

  it("stores the merged window with hasMoreEmails false and summed totals", async () => {
    const client = mkClient();

    await useEmailStore.getState().setScope(client, { kind: "unified" });

    const state = useEmailStore.getState();
    expect(state.emails.map((e) => e.id)).toEqual(["b1", "a1"]);
    expect(state.hasMoreEmails).toBe(false);
    expect(state.totalEmails).toBe(2);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("renders empty and records the pages when every account page failed", async () => {
    const failedPages = [
      { accountId: "acc-a", emails: [], anchor: null, failed: true },
      { accountId: "acc-b", emails: [], anchor: null, failed: true },
    ];
    const client = mkClient({
      queryEmailsUnified: vi.fn().mockResolvedValue(failedPages),
    });

    await useEmailStore.getState().setScope(client, { kind: "unified" });

    // No generic error-blanked path: the list renders empty and the stored
    // failed pages let the partial-failure notice name the accounts.
    const state = useEmailStore.getState();
    expect(state.error).toBeNull();
    expect(state.emails).toEqual([]);
    expect(state.unifiedPages).toEqual(failedPages);
    expect(state.isLoading).toBe(false);
  });

  it("keeps the single-account queryEmails path when only one account is in session", async () => {
    useEmailStore.setState({ mailboxes: [multiAccountMailboxes[0]] });
    const client = mkClient();

    await useEmailStore.getState().setScope(client, { kind: "all", includeTrashJunk: false });

    expect(client.queryEmails).toHaveBeenCalledTimes(1);
    expect(client.queryEmailsUnified).not.toHaveBeenCalled();
  });
});

describe("cross-account read routing from a merged list", () => {
  const crossAccountRow = makeEmail({ id: "b1", threadId: "tb", accountId: "acc-b" });
  const primaryRow = makeEmail({ id: "a1", threadId: "ta" });

  beforeEach(() => {
    useEmailStore.setState({
      emails: [crossAccountRow, primaryRow],
      mailboxes: multiAccountMailboxes,
      selectedMailbox: "inbox-a",
      threadEmailsCache: new Map(),
      isLoadingThread: null,
      error: null,
    });
  });

  it("fetchEmailContent routes a cross-account row to its owning account", async () => {
    const getEmail = vi.fn().mockResolvedValue(crossAccountRow);
    const client = { getEmail } as unknown as JMAPClient;

    await useEmailStore.getState().fetchEmailContent(client, "b1", "acc-b");

    expect(getEmail).toHaveBeenCalledWith("b1", "acc-b");
  });

  it("fetchEmailContent keeps primary rows on the primary account", async () => {
    const getEmail = vi.fn().mockResolvedValue(primaryRow);
    const client = { getEmail } as unknown as JMAPClient;

    await useEmailStore.getState().fetchEmailContent(client, "a1");

    expect(getEmail).toHaveBeenCalledWith("a1", undefined);
  });

  it("fetchThreadEmails routes a cross-account thread to its owning account", async () => {
    const getThreadEmails = vi.fn().mockResolvedValue([crossAccountRow]);
    const client = { getThreadEmails } as unknown as JMAPClient;

    await useEmailStore.getState().fetchThreadEmails(client, "tb", "acc-b");

    expect(getThreadEmails).toHaveBeenCalledWith("tb", "acc-b");
  });
});

describe("refreshCurrentMailbox with a merged cross-account list", () => {
  const crossAccountRow = makeEmail({ id: "b1", threadId: "tb", accountId: "acc-b" });
  const primaryRow = makeEmail({ id: "a1", threadId: "ta" });

  beforeEach(() => {
    useEmailStore.setState({
      emails: [crossAccountRow, primaryRow],
      mailboxes: multiAccountMailboxes,
      selectedMailbox: "inbox-a",
      currentQuery: {
        text: "invoice",
        scope: { kind: "all", includeTrashJunk: false },
        sort: { by: "receivedAt", ascending: false },
      },
      hasMoreEmails: false,
      totalEmails: 2,
      error: null,
    });
    useSettingsStore.setState({ unifiedInboxExcludedAccounts: [] });
  });

  it("never replaces a merged list with a single-account refetch", async () => {
    const client = mkClient();

    await useEmailStore.getState().refreshCurrentMailbox(client);

    expect(client.queryEmails).not.toHaveBeenCalled();
    expect(useEmailStore.getState().emails.map((e) => e.id)).toEqual(["b1", "a1"]);
  });

  it("still refreshes single-account lists through queryEmails", async () => {
    useEmailStore.setState({
      mailboxes: [multiAccountMailboxes[0]],
      currentQuery: { scope: { kind: "folder", mailboxId: "inbox-a" }, sort: { by: "receivedAt", ascending: false } },
    });
    const client = mkClient();

    await useEmailStore.getState().refreshCurrentMailbox(client);

    expect(client.queryEmails).toHaveBeenCalledTimes(1);
  });
});
