import { describe, it, expect } from 'vitest';
import {
  buildQueryRequest,
  resolveScopeTargets,
  UNIFIED_INBOX_ID,
  type EmailQuery,
  type EmailPage,
} from '../jmap/search-utils';
import type { Mailbox } from '../jmap/types';

const baseSort = { by: 'receivedAt' as const, ascending: false };
const firstPage: EmailPage = { limit: 50 };
const noRoles = {};

describe('buildQueryRequest', () => {
  describe('folder scope', () => {
    it('sets inMailbox from the mailboxId with no text', () => {
      const q: EmailQuery = { scope: { kind: 'folder', mailboxId: 'mb1' }, sort: baseSort };
      const r = buildQueryRequest(q, firstPage, noRoles);
      expect(r.filter).toEqual({ inMailbox: 'mb1' });
    });

    it('AND-combines text with inMailbox', () => {
      const q: EmailQuery = { text: 'hello', scope: { kind: 'folder', mailboxId: 'mb1' }, sort: baseSort };
      const r = buildQueryRequest(q, firstPage, noRoles);
      expect(r.filter).toEqual({
        operator: 'AND',
        conditions: [{ text: 'hello' }, { inMailbox: 'mb1' }],
      });
    });

    it('never adds a trash/junk NOT clause even when role ids are known', () => {
      const q: EmailQuery = { text: 'hi', scope: { kind: 'folder', mailboxId: 'mb1' }, sort: baseSort };
      const r = buildQueryRequest(q, firstPage, { trashId: 't', junkId: 'j' });
      expect(JSON.stringify(r.filter)).not.toContain('NOT');
    });
  });

  describe('global scope', () => {
    it('excludes trash and junk via NOT when includeTrashJunk is false', () => {
      const q: EmailQuery = { text: 'hi', scope: { kind: 'all', includeTrashJunk: false }, sort: baseSort };
      const r = buildQueryRequest(q, firstPage, { trashId: 't', junkId: 'j' });
      expect(r.filter).toEqual({
        operator: 'AND',
        conditions: [
          { text: 'hi' },
          { operator: 'NOT', conditions: [{ inMailbox: 't' }, { inMailbox: 'j' }] },
        ],
      });
    });

    it('omits the NOT clause entirely when includeTrashJunk is true', () => {
      const q: EmailQuery = { text: 'hi', scope: { kind: 'all', includeTrashJunk: true }, sort: baseSort };
      const r = buildQueryRequest(q, firstPage, { trashId: 't', junkId: 'j' });
      expect(r.filter).toEqual({ text: 'hi' });
    });

    it('drops only the missing role from the NOT clause (junk id absent)', () => {
      const q: EmailQuery = { text: 'hi', scope: { kind: 'all', includeTrashJunk: false }, sort: baseSort };
      const r = buildQueryRequest(q, firstPage, { trashId: 't' });
      expect(r.filter).toEqual({
        operator: 'AND',
        conditions: [{ text: 'hi' }, { operator: 'NOT', conditions: [{ inMailbox: 't' }] }],
      });
    });

    it('omits the NOT clause when both role ids are missing', () => {
      const q: EmailQuery = { text: 'hi', scope: { kind: 'all', includeTrashJunk: false }, sort: baseSort };
      const r = buildQueryRequest(q, firstPage, noRoles);
      expect(r.filter).toEqual({ text: 'hi' });
    });

    it('collapses an empty base to the bare NOT clause', () => {
      const q: EmailQuery = { scope: { kind: 'all', includeTrashJunk: false }, sort: baseSort };
      const r = buildQueryRequest(q, firstPage, { trashId: 't', junkId: 'j' });
      expect(r.filter).toEqual({
        operator: 'NOT',
        conditions: [{ inMailbox: 't' }, { inMailbox: 'j' }],
      });
    });
  });

  describe('sort mapping (RFC 8621)', () => {
    it.each([
      ['receivedAt', true],
      ['receivedAt', false],
      ['from', true],
      ['subject', false],
      ['size', true],
    ] as const)('maps %s ascending=%s', (by, ascending) => {
      const q: EmailQuery = { scope: { kind: 'folder', mailboxId: 'mb1' }, sort: { by, ascending } };
      const r = buildQueryRequest(q, firstPage, noRoles);
      expect(r.sort).toEqual([{ property: by, isAscending: ascending }]);
    });
  });

  describe('paging', () => {
    it('first page: position 0, no anchor, calculateTotal true', () => {
      const q: EmailQuery = { scope: { kind: 'folder', mailboxId: 'mb1' }, sort: baseSort };
      const r = buildQueryRequest(q, { limit: 50 }, noRoles);
      expect(r.position).toBe(0);
      expect(r.anchor).toBeUndefined();
      expect(r.anchorOffset).toBeUndefined();
      expect(r.calculateTotal).toBe(true);
      expect(r.limit).toBe(50);
    });

    it('anchored page: anchor set, anchorOffset defaults to 1, no position, calculateTotal false', () => {
      const q: EmailQuery = { scope: { kind: 'folder', mailboxId: 'mb1' }, sort: baseSort };
      const r = buildQueryRequest(q, { limit: 25, anchor: 'e99' }, noRoles);
      expect(r.anchor).toBe('e99');
      expect(r.anchorOffset).toBe(1);
      expect(r.position).toBeUndefined();
      expect(r.calculateTotal).toBe(false);
      expect(r.limit).toBe(25);
    });

    it('anchored page respects an explicit anchorOffset', () => {
      const q: EmailQuery = { scope: { kind: 'folder', mailboxId: 'mb1' }, sort: baseSort };
      const r = buildQueryRequest(q, { limit: 25, anchor: 'e99', anchorOffset: 0 }, noRoles);
      expect(r.anchorOffset).toBe(0);
    });
  });
});

describe('UNIFIED_INBOX_ID', () => {
  it('is the unified:inbox sentinel', () => {
    expect(UNIFIED_INBOX_ID).toBe('unified:inbox');
  });
});

function mkMailbox(o: Partial<Mailbox>): Mailbox {
  return { id: '', name: '', sortOrder: 1 as const, ...o } as Mailbox;
}

const multiAccountMailboxes: Mailbox[] = [
  mkMailbox({ id: 'inbox-a', role: 'inbox', accountId: 'acc-a' }),
  mkMailbox({ id: 'archive-a', role: 'archive', accountId: 'acc-a' }),
  mkMailbox({ id: 'acc-b:inbox-b', originalId: 'inbox-b', role: 'inbox', isShared: true, accountId: 'acc-b' }),
  mkMailbox({ id: 'acc-c:inbox-c', originalId: 'inbox-c', role: 'inbox', isShared: true, accountId: 'acc-c' }),
];

describe('resolveScopeTargets', () => {
  it('returns null for folder scope (keeps the single-account path)', () => {
    const targets = resolveScopeTargets(
      { kind: 'folder', mailboxId: 'inbox-a' },
      multiAccountMailboxes,
      []
    );
    expect(targets).toBeNull();
  });

  it("unified: targets each included account's inbox with un-namespaced mailbox ids", () => {
    const targets = resolveScopeTargets({ kind: 'unified' }, multiAccountMailboxes, []);
    expect(targets).toEqual([
      { accountId: 'acc-a', mailboxId: 'inbox-a' },
      { accountId: 'acc-b', mailboxId: 'inbox-b' },
      { accountId: 'acc-c', mailboxId: 'inbox-c' },
    ]);
  });

  it('unified: omits excluded accounts', () => {
    const targets = resolveScopeTargets({ kind: 'unified' }, multiAccountMailboxes, ['acc-b']);
    expect(targets).toEqual([
      { accountId: 'acc-a', mailboxId: 'inbox-a' },
      { accountId: 'acc-c', mailboxId: 'inbox-c' },
    ]);
  });

  it('unified: a stale exclude entry for a removed account changes nothing', () => {
    const targets = resolveScopeTargets({ kind: 'unified' }, multiAccountMailboxes, ['acc-gone']);
    expect(targets).toEqual([
      { accountId: 'acc-a', mailboxId: 'inbox-a' },
      { accountId: 'acc-b', mailboxId: 'inbox-b' },
      { accountId: 'acc-c', mailboxId: 'inbox-c' },
    ]);
  });

  it('unified: skips inbox mailboxes that carry no accountId', () => {
    const withLegacy = [mkMailbox({ id: 'inbox-x', role: 'inbox' }), ...multiAccountMailboxes];
    const targets = resolveScopeTargets({ kind: 'unified' }, withLegacy, []);
    expect(targets).toEqual([
      { accountId: 'acc-a', mailboxId: 'inbox-a' },
      { accountId: 'acc-b', mailboxId: 'inbox-b' },
      { accountId: 'acc-c', mailboxId: 'inbox-c' },
    ]);
  });

  it('all (Everywhere): one whole-account target per session account, ignoring the exclude list', () => {
    const targets = resolveScopeTargets(
      { kind: 'all', includeTrashJunk: false },
      multiAccountMailboxes,
      ['acc-b']
    );
    expect(targets).toEqual([
      { accountId: 'acc-a' },
      { accountId: 'acc-b' },
      { accountId: 'acc-c' },
    ]);
  });
});

describe('buildQueryRequest with unified scope', () => {
  it('yields an account-agnostic filter: no inMailbox, no trash/junk NOT clause', () => {
    const q: EmailQuery = { text: 'hi', scope: { kind: 'unified' }, sort: baseSort };
    const r = buildQueryRequest(q, firstPage, { trashId: 't', junkId: 'j' });
    expect(r.filter).toEqual({ text: 'hi' });
  });

  it('yields an empty filter with no text or filters', () => {
    const q: EmailQuery = { scope: { kind: 'unified' }, sort: baseSort };
    const r = buildQueryRequest(q, firstPage, { trashId: 't', junkId: 'j' });
    expect(r.filter).toEqual({});
  });
});
