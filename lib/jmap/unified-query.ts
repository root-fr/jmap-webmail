import type { Email } from "./types";
import type { EmailSort } from "./search-utils";

export type UnifiedTarget = { accountId: string; mailboxId?: string };

export type AccountPage = {
  accountId: string;
  emails: Email[];
  total?: number;
  anchor: string | null;
  failed?: boolean;
};

export type UnifiedCursor = {
  accountId: string;
  anchorEmailId: string | null;
  consumed: number;
  exhausted: boolean;
};

function sortValue(email: Email, by: EmailSort["by"]): string | number {
  switch (by) {
    case "receivedAt": {
      const t = Date.parse(email.receivedAt);
      return Number.isNaN(t) ? 0 : t;
    }
    case "from":
      return (
        email.from?.[0]?.name ||
        email.from?.[0]?.email ||
        ""
      ).toLowerCase();
    case "subject":
      return (email.subject ?? "").toLowerCase();
    case "size":
      return email.size;
  }
}

function compareEmails(a: Email, b: Email, sort: EmailSort): number {
  const va = sortValue(a, sort.by);
  const vb = sortValue(b, sort.by);
  let cmp = va < vb ? -1 : va > vb ? 1 : 0;
  if (!sort.ascending) cmp = -cmp;
  if (cmp !== 0) return cmp;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

type Feed = { page: AccountPage; index: number; cursor: UnifiedCursor };

/**
 * K-way merge of per-account email buffers into one window in active sort
 * order, tie-breaking on email id ascending.
 *
 * Buffer contract: each page's `emails` holds that account's rows, already
 * server-sorted by `sort`; `anchor: null` means the server has no rows
 * beyond the buffer. Buffers may include rows already emitted on earlier
 * calls (stored pages, refetched top windows): when a cursor's
 * `anchorEmailId` appears in its buffer, merging resumes just after it, so
 * callers never slice. The merge stops as soon as a non-exhausted buffer
 * empties (its unfetched rows could sort before other buffers' heads) and
 * reports that account in `drained` so the caller re-fetches only those
 * accounts. Rows emitted this call per account = new `consumed` minus prior
 * `consumed`. Failed pages and cursors without a page pass through untouched.
 */
export function mergeAccountPages(
  pages: AccountPage[],
  sort: EmailSort,
  windowSize: number,
  cursors?: UnifiedCursor[]
): { emails: Email[]; cursors: UnifiedCursor[]; drained: string[] } {
  const prior = new Map((cursors ?? []).map((c) => [c.accountId, c]));
  const feeds: Feed[] = [];
  const passthrough: UnifiedCursor[] = [];

  for (const page of pages) {
    const base = prior.get(page.accountId) ?? {
      accountId: page.accountId,
      anchorEmailId: null,
      consumed: 0,
      exhausted: false,
    };
    prior.delete(page.accountId);
    if (page.failed) {
      passthrough.push(base);
    } else {
      // Resume after the prior anchor when the buffer still contains it.
      let index = 0;
      if (base.anchorEmailId !== null) {
        const at = page.emails.findIndex((e) => e.id === base.anchorEmailId);
        if (at >= 0) index = at + 1;
      }
      // Exhaustion is a property of the current buffer, not the cursor's
      // history: a refreshed page with an anchor proves the server has more,
      // so the flag is re-derived below instead of carried over.
      feeds.push({ page, index, cursor: { ...base, exhausted: false } });
    }
  }
  for (const c of prior.values()) passthrough.push(c);

  const emails: Email[] = [];
  const drained: string[] = [];
  let active = feeds.slice();

  while (emails.length < windowSize) {
    const stillActive: Feed[] = [];
    let blocked = false;
    for (const f of active) {
      if (f.index < f.page.emails.length) {
        stillActive.push(f);
      } else if (f.page.anchor !== null) {
        drained.push(f.cursor.accountId);
        blocked = true;
      } else {
        f.cursor.exhausted = true;
      }
    }
    active = stillActive;
    if (blocked || active.length === 0) break;

    let best = active[0];
    for (let i = 1; i < active.length; i++) {
      const head = active[i].page.emails[active[i].index];
      if (compareEmails(head, best.page.emails[best.index], sort) < 0) {
        best = active[i];
      }
    }
    const email = best.page.emails[best.index];
    emails.push(email);
    best.index += 1;
    best.cursor.consumed += 1;
    best.cursor.anchorEmailId = email.id;
  }

  for (const f of active) {
    if (f.index >= f.page.emails.length) {
      if (f.page.anchor !== null) drained.push(f.cursor.accountId);
      else f.cursor.exhausted = true;
    }
  }

  return {
    emails,
    cursors: [...feeds.map((f) => f.cursor), ...passthrough],
    drained,
  };
}
