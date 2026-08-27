import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { SonnerToaster } from '@/components/ui/sonner-toaster';
import { useThemeStore } from '@/stores/theme-store';

// sonner's toast.* calls render nothing unless a <Toaster> is mounted; the
// spam-undo and batch-move toasts shipped without one.
describe('SonnerToaster', () => {
  it('renders fired toasts once mounted', async () => {
    render(<SonnerToaster />);
    toast('spam moved, undo available');
    expect(await screen.findByText('spam moved, undo available')).toBeTruthy();
  });

  it('follows the app resolved theme, not the OS one', async () => {
    useThemeStore.setState({ resolvedTheme: 'dark' });
    render(<SonnerToaster />);
    toast('themed toast');
    await screen.findByText('themed toast');
    expect(document.querySelector('[data-sonner-toaster]')?.getAttribute('data-sonner-theme')).toBe('dark');
  });
});
