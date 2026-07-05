import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SelectionDropdown } from '@/components/email/selection-dropdown';
import { ContextMenu, ContextMenuItem } from '@/components/ui/context-menu';

vi.mock('@/stores/settings-store', () => {
  const store = {
    trustedSenders: [] as string[],
    addTrustedSender: vi.fn(),
    removeTrustedSender: vi.fn(),
  };
  const useSettingsStore = () => store;
  return { useSettingsStore };
});

import { TrustedSendersModal } from '@/components/trusted-senders-modal';

function openSelectionDropdown() {
  render(
    <SelectionDropdown
      hasSelection={false}
      allSelected={false}
      onSelectByFilter={vi.fn()}
      threadGroups={[]}
    />
  );
  const trigger = screen.getByLabelText('select_criteria.label');
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe('SelectionDropdown keyboard a11y', () => {
  it('focuses the first item on open, roves with ArrowDown/End, Escape closes and restores focus', () => {
    const trigger = openSelectionDropdown();

    expect((document.activeElement as HTMLElement).textContent).toBe('select_criteria.all');

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect((document.activeElement as HTMLElement).textContent).toBe('select_criteria.none');

    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect((document.activeElement as HTMLElement).textContent).toBe('select_criteria.unstarred');

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('ContextMenu keyboard a11y', () => {
  it('focuses the first item on open, roves with ArrowDown, Escape calls onClose', async () => {
    const onClose = vi.fn();
    render(
      <ContextMenu isOpen position={{ x: 10, y: 10 }} onClose={onClose}>
        <ContextMenuItem label="First" onClick={vi.fn()} />
        <ContextMenuItem label="Second" onClick={vi.fn()} />
      </ContextMenu>
    );

    const first = await screen.findByText('First');
    await waitFor(() =>
      expect(document.activeElement).toBe(first.closest('button'))
    );

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByText('Second').closest('button'));

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('TrustedSendersModal focus trap', () => {
  it('moves focus into the dialog on open and closes on Escape', () => {
    const onClose = vi.fn();
    render(<TrustedSendersModal isOpen onClose={onClose} />);

    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
