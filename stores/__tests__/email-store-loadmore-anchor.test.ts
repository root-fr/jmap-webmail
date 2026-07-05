import { describe, it, expect, beforeEach, vi } from "vitest";
import { useEmailStore } from "@/stores/email-store";
import { AnchorNotFoundError } from "@/lib/jmap/client";
import type { JMAPClient } from "@/lib/jmap/client";
import type { EmailQuery } from "@/lib/jmap/search-utils";
import type { Email, Mailbox } from "@/lib/jmap/types";

function mkEmail(id: string, iso: string): Email {
  return {
    id,
    threadId: `t-${id}`,
    mailboxIds: { inbox: true },
    keywords: { $seen: true },
    size: 100,
    receivedAt: iso,
    from: [{ email: "a@b.c" }],
    to: [{ email: "you@b.c" }],
    subject: `s-${id}`,
    preview: "",
    hasAttachment: false,
  } as Email;
}

const inbox: Mailbox = {
  id: "inbox",
  name: "Inbox",
  role: "inbox",
  sortOrder: 1,
  totalEmails: 6,
  unreadEmails: 0,
  totalThreads: 6,
  unreadThreads: 0,
  myRights: {
    mayReadItems: true, mayAddItems: true, mayRemoveItems: true,
    maySetSeen: true, maySetKeywords: true, mayCreateChild: true,
    mayRename: true, mayDelete: true, maySubmit: true,
  },
  isSubscribed: true,
} as Mailbox;

const folderQuery: EmailQuery = {
  scope: { kind: "folder", mailboxId: "inbox" },
  sort: { by: "receivedAt", ascending: false },
};

// Page 1: ids 1,2,3 (receivedAt descending)
const page1 = [
  mkEmail("1", "2026-07-05T12:00:00Z"),
  mkEmail("2", "2026-07-05T11:00:00Z"),
  mkEmail("3", "2026-07-05T10:00:00Z"),
];

function seed(client: Partial<JMAPClient>) {
  useEmailStore.setState({
    emails: [...page1],
    mailboxes: [inbox],
    selectedMailbox: "inbox",
    currentQuery: folderQuery,
    hasMoreEmails: true,
    totalEmails: 6,
    isLoadingMore: false,
    error: null,
  });
  return client as JMAPClient;
}

describe("loadMoreEmails — anchor paging (#71)", () => {
  beforeEach(() => {
    useEmailStore.setState({ error: null, isLoadingMore: false });
  });

  it("continues from the last loaded id and never duplicates or gaps when the set drifts", async () => {
    // Server excludes the anchor (anchorOffset:1); we deliberately return the
    // anchor id 3 in the page too, to prove the merge de-dupes it.
    const queryEmails = vi.fn().mockResolvedValue({
      emails: [
        mkEmail("3", "2026-07-05T10:00:00Z"),
        mkEmail("4", "2026-07-05T09:00:00Z"),
        mkEmail("5", "2026-07-05T08:00:00Z"),
        mkEmail("6", "2026-07-05T07:00:00Z"),
      ],
      total: 6,
      position: 3,
      hasMore: false,
    });
    const client = seed({ queryEmails });

    await useEmailStore.getState().loadMoreEmails(client);

    expect(queryEmails).toHaveBeenCalledWith(
      folderQuery,
      { limit: expect.any(Number), anchor: "3", anchorOffset: 1 },
      undefined,
    );
    const state = useEmailStore.getState();
    expect(state.emails.map((e) => e.id)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(state.hasMoreEmails).toBe(false);
    expect(state.totalEmails).toBe(6);
    expect(state.isLoadingMore).toBe(false);
    expect(state.error).toBeNull();
  });

  it("falls back once to a positional window and surfaces a non-fatal error when the anchor is gone", async () => {
    const queryEmails = vi
      .fn()
      .mockRejectedValueOnce(new AnchorNotFoundError())
      .mockResolvedValueOnce({
        emails: [
          mkEmail("1", "2026-07-05T12:00:00Z"),
          mkEmail("2", "2026-07-05T11:00:00Z"),
          mkEmail("4", "2026-07-05T09:00:00Z"),
          mkEmail("5", "2026-07-05T08:00:00Z"),
          mkEmail("6", "2026-07-05T07:00:00Z"),
        ],
        total: 6,
        position: 0,
        hasMore: true,
      });
    const client = seed({ queryEmails });

    await useEmailStore.getState().loadMoreEmails(client);

    expect(queryEmails).toHaveBeenCalledTimes(2);
    // Second (fallback) call is positional: no anchor.
    const fallbackPage = queryEmails.mock.calls[1][1] as { anchor?: string };
    expect(fallbackPage.anchor).toBeUndefined();

    const state = useEmailStore.getState();
    expect(state.emails.map((e) => e.id)).toEqual(["1", "2", "4", "5", "6"]);
    expect(state.hasMoreEmails).toBe(true);
    expect(state.isLoadingMore).toBe(false);
    expect(state.error).toBeTruthy(); // non-fatal notice, list preserved
  });
});
