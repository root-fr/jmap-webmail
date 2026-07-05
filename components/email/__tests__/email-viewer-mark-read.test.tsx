import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EmailViewer } from '@/components/email/email-viewer';
import type { Email } from '@/lib/jmap/types';

// jsdom has no window.matchMedia; useMediaQuery calls it unguarded in an effect.
// Mock the whole module so the viewer's device hook is inert and force desktop.
vi.mock('@/hooks/use-media-query', () => ({
  useDeviceDetection: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
  useMediaQuery: () => false,
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useBreakpoint: () => false,
}));

const unreadEmail: Email = {
  id: 'e1',
  threadId: 't1',
  mailboxIds: { inbox: true },
  keywords: {}, // no $seen -> unread
  size: 100,
  receivedAt: '2026-07-05T10:00:00Z',
  from: [{ name: 'Alice', email: 'alice@example.com' }],
  to: [{ name: 'Me', email: 'me@example.com' }],
  subject: 'Hello',
  preview: 'Hi there',
  textBody: [{ partId: '1', blobId: 'b1', size: 8, type: 'text/plain' }],
  bodyValues: { '1': { value: 'Hi there', isEncodingProblem: false, isTruncated: false } },
  hasAttachment: false,
};

describe('EmailViewer mark-as-read', () => {
  it('does NOT mark an unread email as read on mount (delay logic lives in the page)', async () => {
    const onMarkAsRead = vi.fn();
    render(<EmailViewer email={unreadEmail} onMarkAsRead={onMarkAsRead} />);
    // Let all mount effects flush.
    await waitFor(() => {}, { timeout: 100 });
    expect(onMarkAsRead).not.toHaveBeenCalled();
  });
});
