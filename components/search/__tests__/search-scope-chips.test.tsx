import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SearchScopeChips } from '../search-scope-chips';

describe('SearchScopeChips', () => {
  const folderId = 'mb-inbox';

  it('renders both scope toggles and the trash/junk chip when scope is everywhere', () => {
    render(
      <SearchScopeChips
        scope={{ kind: 'all', includeTrashJunk: false }}
        folderMailboxId={folderId}
        onScopeChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'scope_everywhere' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'scope_this_folder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'include_trash_junk' })).toBeInTheDocument();
  });

  it('marks Everywhere pressed and This folder not pressed in all scope', () => {
    render(
      <SearchScopeChips
        scope={{ kind: 'all', includeTrashJunk: false }}
        folderMailboxId={folderId}
        onScopeChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'scope_everywhere' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'scope_this_folder' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches to folder scope carrying the current folder id', () => {
    const onScopeChange = vi.fn();
    render(
      <SearchScopeChips
        scope={{ kind: 'all', includeTrashJunk: false }}
        folderMailboxId={folderId}
        onScopeChange={onScopeChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'scope_this_folder' }));
    expect(onScopeChange).toHaveBeenCalledWith({ kind: 'folder', mailboxId: folderId });
  });

  it('switches back to Everywhere preserving the include flag', () => {
    const onScopeChange = vi.fn();
    render(
      <SearchScopeChips
        scope={{ kind: 'folder', mailboxId: folderId }}
        folderMailboxId={folderId}
        onScopeChange={onScopeChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'scope_everywhere' }));
    expect(onScopeChange).toHaveBeenCalledWith({ kind: 'all', includeTrashJunk: false });
  });

  it('toggles includeTrashJunk while keeping the all scope', () => {
    const onScopeChange = vi.fn();
    render(
      <SearchScopeChips
        scope={{ kind: 'all', includeTrashJunk: false }}
        folderMailboxId={folderId}
        onScopeChange={onScopeChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'include_trash_junk' }));
    expect(onScopeChange).toHaveBeenCalledWith({ kind: 'all', includeTrashJunk: true });
  });

  it('hides the trash/junk chip when scope is a folder', () => {
    render(
      <SearchScopeChips
        scope={{ kind: 'folder', mailboxId: folderId }}
        folderMailboxId={folderId}
        onScopeChange={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'include_trash_junk' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'scope_this_folder' })).toHaveAttribute('aria-pressed', 'true');
  });
});
