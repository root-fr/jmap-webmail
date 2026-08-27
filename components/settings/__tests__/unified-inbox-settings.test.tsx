import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Two mailboxes for acc-support on purpose: the section must list each account once.
const DEFAULT_MAILBOXES = [
  { id: 'mb-inbox', role: 'inbox', name: 'Inbox', accountId: 'acc-primary', accountName: 'matthieu@example.com', isShared: false },
  { id: 'acc-support:mb-1', role: 'inbox', name: 'Inbox', accountId: 'acc-support', accountName: 'support@example.com', isShared: true },
  { id: 'acc-support:mb-2', role: 'sent', name: 'Sent', accountId: 'acc-support', accountName: 'support@example.com', isShared: true },
];

const h = vi.hoisted(() => ({
  updateSetting: vi.fn(),
  settings: {
    showUnifiedInbox: true,
    unifiedInboxExcludedAccounts: ['acc-support'] as string[],
  },
  mailboxes: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: () => ({ ...h.settings, updateSetting: h.updateSetting }),
}));

vi.mock('@/stores/email-store', () => ({
  useEmailStore: () => ({ mailboxes: h.mailboxes }),
}));

import { UnifiedInboxSettings } from '@/components/settings/unified-inbox-settings';

describe('UnifiedInboxSettings', () => {
  beforeEach(() => {
    h.updateSetting.mockClear();
    h.settings.showUnifiedInbox = true;
    h.settings.unifiedInboxExcludedAccounts = ['acc-support'];
    h.mailboxes = [...DEFAULT_MAILBOXES];
  });

  it('shows an empty-state message when no mailboxes are loaded yet', () => {
    h.mailboxes = [];
    render(<UnifiedInboxSettings />);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText('accounts.empty')).toBeInTheDocument();
  });

  it('renders the show toggle and flips showUnifiedInbox on click', () => {
    render(<UnifiedInboxSettings />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(h.updateSetting).toHaveBeenCalledWith('showUnifiedInbox', false);
  });

  it('lists each session account exactly once, primary first', () => {
    render(<UnifiedInboxSettings />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toHaveAccessibleName('matthieu@example.com');
    expect(screen.getByRole('checkbox', { name: 'matthieu@example.com' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'support@example.com' })).not.toBeChecked();
  });

  it('re-including an excluded account removes it from the exclude list', () => {
    render(<UnifiedInboxSettings />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'support@example.com' }));
    expect(h.updateSetting).toHaveBeenCalledWith('unifiedInboxExcludedAccounts', []);
  });

  it('excluding an included account appends it to the exclude list', () => {
    render(<UnifiedInboxSettings />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'matthieu@example.com' }));
    expect(h.updateSetting).toHaveBeenCalledWith('unifiedInboxExcludedAccounts', ['acc-support', 'acc-primary']);
  });

  it('disables the account checkboxes while the unified inbox is hidden', () => {
    h.settings.showUnifiedInbox = false;
    render(<UnifiedInboxSettings />);
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toBeDisabled();
    }
  });
});
