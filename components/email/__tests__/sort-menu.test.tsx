import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SortMenu } from '@/components/email/sort-menu';

const setSort = vi.fn();
let mockSort = { by: 'receivedAt', ascending: false };

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ client: {} }),
}));

vi.mock('@/stores/email-store', () => ({
  useEmailStore: (selector: (s: unknown) => unknown) =>
    selector({ currentQuery: { sort: mockSort }, setSort }),
}));

// Robust to T3's setSort signature: find the EmailSort-shaped arg, not a fixed position.
const sortArgOf = (callIndex: number) =>
  setSort.mock.calls[callIndex].find(
    (a: unknown) => a !== null && typeof a === 'object' && 'by' in (a as object),
  );

describe('SortMenu', () => {
  beforeEach(() => {
    setSort.mockClear();
    mockSort = { by: 'receivedAt', ascending: false };
  });

  it('selects a new field with descending as the default direction', () => {
    render(<SortMenu />);
    // Only the trigger is a button while the menu is closed.
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'by_sender' }));

    expect(setSort).toHaveBeenCalledTimes(1);
    expect(sortArgOf(0)).toEqual({ by: 'from', ascending: false });
  });

  it('toggles direction when the already-active field is chosen again', () => {
    render(<SortMenu />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'by_date' }));

    expect(sortArgOf(0)).toEqual({ by: 'receivedAt', ascending: true });
  });

  it('sets an explicit direction from the ascending/descending options', () => {
    render(<SortMenu />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'ascending' }));

    expect(sortArgOf(0)).toEqual({ by: 'receivedAt', ascending: true });
  });
});
