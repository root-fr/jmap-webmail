import { describe, it, expect } from 'vitest';
import {
  mergeAccountPages,
  type AccountPage,
  type UnifiedCursor,
} from '../jmap/unified-query';
import type { Email } from '../jmap/types';
import type { EmailSort } from '../jmap/search-utils';

const makeEmail = (id: string, o: Partial<Email> = {}): Email => ({
  id,
  threadId: `t-${id}`,
  mailboxIds: { inbox: true },
  keywords: {},
  size: 100,
  receivedAt: '2026-07-01T00:00:00Z',
  hasAttachment: false,
  ...o,
});

const page = (
  accountId: string,
  emails: Email[],
  extra: Partial<AccountPage> = {}
): AccountPage => ({
  accountId,
  emails,
  anchor: null,
  ...extra,
});

const ids = (emails: Email[]) => emails.map((e) => e.id);

const cursorOf = (cursors: UnifiedCursor[], accountId: string) =>
  cursors.find((c) => c.accountId === accountId);

const descDate: EmailSort = { by: 'receivedAt', ascending: false };

describe('mergeAccountPages', () => {
  describe('sort order', () => {
    const a = makeEmail('a', {
      receivedAt: '2026-07-01T00:00:00Z',
      from: [{ email: 'zoe@example.com' }],
      subject: 'Beta',
      size: 300,
    });
    const b = makeEmail('b', {
      receivedAt: '2026-07-03T00:00:00Z',
      from: [{ name: 'Alice', email: 'q@example.com' }],
      subject: 'alpha',
      size: 100,
    });
    const c = makeEmail('c', {
      receivedAt: '2026-07-02T00:00:00Z',
      from: [{ email: 'mike@example.com' }],
      subject: 'Gamma',
      size: 200,
    });

    it.each([
      ['receivedAt', true, ['a', 'c', 'b']],
      ['receivedAt', false, ['b', 'c', 'a']],
      ['from', true, ['b', 'c', 'a']],
      ['from', false, ['a', 'c', 'b']],
      ['subject', true, ['b', 'a', 'c']],
      ['subject', false, ['c', 'a', 'b']],
      ['size', true, ['b', 'c', 'a']],
      ['size', false, ['a', 'c', 'b']],
    ] as [EmailSort['by'], boolean, string[]][])(
      'merges by %s ascending=%s',
      (by, ascending, expected) => {
        const r = mergeAccountPages(
          [page('acctA', [a]), page('acctB', [b]), page('acctC', [c])],
          { by, ascending },
          10
        );
        expect(ids(r.emails)).toEqual(expected);
      }
    );

    it('falls back from sender name to email address to empty string', () => {
      const noFrom = makeEmail('n1');
      const emailOnly = makeEmail('n2', { from: [{ email: 'bob@example.com' }] });
      const named = makeEmail('n3', { from: [{ name: 'Zed', email: 'aaa@example.com' }] });
      const r = mergeAccountPages(
        [page('acctA', [noFrom]), page('acctB', [emailOnly]), page('acctC', [named])],
        { by: 'from', ascending: true },
        10
      );
      expect(ids(r.emails)).toEqual(['n1', 'n2', 'n3']);
    });

    it('treats a missing subject as empty and compares case-insensitively', () => {
      const noSubject = makeEmail('s1');
      const lower = makeEmail('s2', { subject: 'apple' });
      const upper = makeEmail('s3', { subject: 'Zebra' });
      const r = mergeAccountPages(
        [page('acctA', [upper]), page('acctB', [noSubject]), page('acctC', [lower])],
        { by: 'subject', ascending: true },
        10
      );
      expect(ids(r.emails)).toEqual(['s1', 's2', 's3']);
    });

    it('breaks ties by email id ascending regardless of direction', () => {
      const x = makeEmail('x', { receivedAt: '2026-07-02T00:00:00Z' });
      const y = makeEmail('y', { receivedAt: '2026-07-02T00:00:00Z' });
      const desc = mergeAccountPages([page('acctA', [y]), page('acctB', [x])], descDate, 10);
      expect(ids(desc.emails)).toEqual(['x', 'y']);
      const asc = mergeAccountPages(
        [page('acctA', [y]), page('acctB', [x])],
        { by: 'receivedAt', ascending: true },
        10
      );
      expect(ids(asc.emails)).toEqual(['x', 'y']);
    });
  });

  describe('window and cursors', () => {
    it('fills the window across accounts and tracks consumed and anchor per account', () => {
      const a1 = makeEmail('a1', { receivedAt: '2026-07-06T00:00:00Z' });
      const a2 = makeEmail('a2', { receivedAt: '2026-07-03T00:00:00Z' });
      const b1 = makeEmail('b1', { receivedAt: '2026-07-05T00:00:00Z' });
      const r = mergeAccountPages(
        [page('acctA', [a1, a2]), page('acctB', [b1])],
        descDate,
        2
      );
      expect(ids(r.emails)).toEqual(['a1', 'b1']);
      expect(cursorOf(r.cursors, 'acctA')).toEqual({
        accountId: 'acctA',
        anchorEmailId: 'a1',
        consumed: 1,
        exhausted: false,
      });
      expect(cursorOf(r.cursors, 'acctB')).toEqual({
        accountId: 'acctB',
        anchorEmailId: 'b1',
        consumed: 1,
        exhausted: true,
      });
      expect(r.drained).toEqual([]);
    });

    it('returns at most windowSize emails and leaves the rest unconsumed', () => {
      const e1 = makeEmail('e1', { receivedAt: '2026-07-06T00:00:00Z' });
      const e2 = makeEmail('e2', { receivedAt: '2026-07-05T00:00:00Z' });
      const e3 = makeEmail('e3', { receivedAt: '2026-07-04T00:00:00Z' });
      const r = mergeAccountPages([page('acctA', [e1, e2, e3])], descDate, 2);
      expect(ids(r.emails)).toEqual(['e1', 'e2']);
      expect(cursorOf(r.cursors, 'acctA')).toEqual({
        accountId: 'acctA',
        anchorEmailId: 'e2',
        consumed: 2,
        exhausted: false,
      });
      expect(r.drained).toEqual([]);
    });

    it('continues across calls: consumed accumulates and anchorEmailId advances', () => {
      const a1 = makeEmail('a1', { receivedAt: '2026-07-05T00:00:00Z' });
      const a2 = makeEmail('a2', { receivedAt: '2026-07-04T00:00:00Z' });
      const first = mergeAccountPages([page('acctA', [a1, a2])], descDate, 1);
      expect(ids(first.emails)).toEqual(['a1']);
      expect(cursorOf(first.cursors, 'acctA')).toEqual({
        accountId: 'acctA',
        anchorEmailId: 'a1',
        consumed: 1,
        exhausted: false,
      });
      const second = mergeAccountPages(
        [page('acctA', [a2])],
        descDate,
        1,
        first.cursors
      );
      expect(ids(second.emails)).toEqual(['a2']);
      expect(cursorOf(second.cursors, 'acctA')).toEqual({
        accountId: 'acctA',
        anchorEmailId: 'a2',
        consumed: 2,
        exhausted: true,
      });
    });

    it('realigns a buffer containing the prior anchor and resumes after it', () => {
      const b1 = makeEmail('b1', { receivedAt: '2026-07-04T00:00:00Z' });
      const b2 = makeEmail('b2', { receivedAt: '2026-07-03T00:00:00Z' });
      const prior: UnifiedCursor[] = [
        { accountId: 'acctB', anchorEmailId: 'b1', consumed: 1, exhausted: false },
      ];
      const r = mergeAccountPages([page('acctB', [b1, b2])], descDate, 10, prior);
      expect(ids(r.emails)).toEqual(['b2']);
      expect(cursorOf(r.cursors, 'acctB')).toEqual({
        accountId: 'acctB',
        anchorEmailId: 'b2',
        consumed: 2,
        exhausted: true,
      });
    });
  });

  describe('drained and exhausted', () => {
    it('stops merging and reports drained when a non-exhausted buffer empties mid-merge', () => {
      const a1 = makeEmail('a1', { receivedAt: '2026-07-06T00:00:00Z' });
      const b1 = makeEmail('b1', { receivedAt: '2026-07-05T00:00:00Z' });
      const b2 = makeEmail('b2', { receivedAt: '2026-07-04T00:00:00Z' });
      const r = mergeAccountPages(
        [page('acctA', [a1], { anchor: 'srv-a' }), page('acctB', [b1, b2])],
        descDate,
        10
      );
      expect(ids(r.emails)).toEqual(['a1']);
      expect(r.drained).toEqual(['acctA']);
      expect(cursorOf(r.cursors, 'acctA')).toEqual({
        accountId: 'acctA',
        anchorEmailId: 'a1',
        consumed: 1,
        exhausted: false,
      });
      expect(cursorOf(r.cursors, 'acctB')).toEqual({
        accountId: 'acctB',
        anchorEmailId: null,
        consumed: 0,
        exhausted: false,
      });
    });

    it('marks a buffer with a null anchor exhausted once fully consumed', () => {
      const e1 = makeEmail('e1', { receivedAt: '2026-07-06T00:00:00Z' });
      const e2 = makeEmail('e2', { receivedAt: '2026-07-05T00:00:00Z' });
      const r = mergeAccountPages([page('acctA', [e1, e2])], descDate, 10);
      expect(ids(r.emails)).toEqual(['e1', 'e2']);
      expect(cursorOf(r.cursors, 'acctA')?.exhausted).toBe(true);
      expect(r.drained).toEqual([]);
    });

    it('reports drained for a buffer fully consumed at the window boundary when the server has more', () => {
      const a1 = makeEmail('a1', { receivedAt: '2026-07-06T00:00:00Z' });
      const r = mergeAccountPages([page('acctA', [a1], { anchor: 'srv-a' })], descDate, 1);
      expect(ids(r.emails)).toEqual(['a1']);
      expect(r.drained).toEqual(['acctA']);
      expect(cursorOf(r.cursors, 'acctA')).toEqual({
        accountId: 'acctA',
        anchorEmailId: 'a1',
        consumed: 1,
        exhausted: false,
      });
    });

    it('clears a stale exhausted flag when a refreshed buffer proves the server has more', () => {
      const b1 = makeEmail('b1', { receivedAt: '2026-07-04T00:00:00Z' });
      const b2 = makeEmail('b2', { receivedAt: '2026-07-03T00:00:00Z' });
      const prior: UnifiedCursor[] = [
        { accountId: 'acctB', anchorEmailId: 'b1', consumed: 1, exhausted: true },
      ];
      const r = mergeAccountPages(
        [page('acctB', [b1, b2], { anchor: 'srv-b' })],
        descDate,
        10,
        prior
      );
      expect(ids(r.emails)).toEqual(['b2']);
      expect(r.drained).toEqual(['acctB']);
      expect(cursorOf(r.cursors, 'acctB')).toEqual({
        accountId: 'acctB',
        anchorEmailId: 'b2',
        consumed: 2,
        exhausted: false,
      });
    });

    it('marks an empty buffer with a null anchor exhausted and contributes nothing', () => {
      const r = mergeAccountPages([page('acctA', [])], descDate, 10);
      expect(r.emails).toEqual([]);
      expect(r.drained).toEqual([]);
      expect(cursorOf(r.cursors, 'acctA')).toEqual({
        accountId: 'acctA',
        anchorEmailId: null,
        consumed: 0,
        exhausted: true,
      });
    });
  });

  describe('failed and absent pages', () => {
    it('failed pages contribute no emails and pass their cursor through untouched', () => {
      const stale = makeEmail('stale', { receivedAt: '2026-07-06T00:00:00Z' });
      const b1 = makeEmail('b1', { receivedAt: '2026-07-05T00:00:00Z' });
      const prior: UnifiedCursor[] = [
        { accountId: 'acctA', anchorEmailId: 'old', consumed: 3, exhausted: false },
      ];
      const r = mergeAccountPages(
        [
          page('acctA', [stale], { failed: true }),
          page('acctB', [b1]),
          page('acctC', [], { failed: true }),
        ],
        descDate,
        10,
        prior
      );
      expect(ids(r.emails)).toEqual(['b1']);
      expect(r.drained).toEqual([]);
      expect(cursorOf(r.cursors, 'acctA')).toEqual({
        accountId: 'acctA',
        anchorEmailId: 'old',
        consumed: 3,
        exhausted: false,
      });
      expect(cursorOf(r.cursors, 'acctC')).toEqual({
        accountId: 'acctC',
        anchorEmailId: null,
        consumed: 0,
        exhausted: false,
      });
    });

    it('cursors without a matching page pass through untouched', () => {
      const a1 = makeEmail('a1', { receivedAt: '2026-07-06T00:00:00Z' });
      const prior: UnifiedCursor[] = [
        { accountId: 'acctZ', anchorEmailId: 'z9', consumed: 4, exhausted: true },
      ];
      const r = mergeAccountPages([page('acctA', [a1])], descDate, 10, prior);
      expect(ids(r.emails)).toEqual(['a1']);
      expect(cursorOf(r.cursors, 'acctZ')).toEqual({
        accountId: 'acctZ',
        anchorEmailId: 'z9',
        consumed: 4,
        exhausted: true,
      });
      expect(r.drained).toEqual([]);
    });
  });

  describe('empty input', () => {
    it('returns empty emails, cursors and drained for no pages', () => {
      expect(mergeAccountPages([], descDate, 10)).toEqual({
        emails: [],
        cursors: [],
        drained: [],
      });
    });
  });
});
