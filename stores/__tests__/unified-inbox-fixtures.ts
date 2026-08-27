import type { Email, Mailbox } from "@/lib/jmap/types";
import type { JMAPClient } from "@/lib/jmap/client";

const ALL_RIGHTS = {
  mayReadItems: true, mayAddItems: true, mayRemoveItems: true,
  maySetSeen: true, maySetKeywords: true, mayCreateChild: true,
  mayRename: true, mayDelete: true, maySubmit: true,
};

export function mkMailbox(o: Partial<Mailbox>): Mailbox {
  return {
    id: "", name: "", sortOrder: 1,
    totalEmails: 0, unreadEmails: 0, totalThreads: 0, unreadThreads: 0,
    myRights: ALL_RIGHTS, isSubscribed: true,
    ...o,
  } as Mailbox;
}

export function mkEmail(o: Partial<Email> & { id: string }): Email {
  return {
    threadId: `t-${o.id}`,
    mailboxIds: {},
    keywords: {},
    size: 100,
    receivedAt: "2026-07-01T00:00:00Z",
    hasAttachment: false,
    ...o,
  } as Email;
}

export function mkClient(overrides: Record<string, unknown> = {}): JMAPClient {
  return { ...overrides } as unknown as JMAPClient;
}
