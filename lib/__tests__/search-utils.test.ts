import { describe, it, expect } from 'vitest';
import {
  buildQueryRequest,
  type EmailQuery,
  type EmailPage,
} from '../jmap/search-utils';

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
