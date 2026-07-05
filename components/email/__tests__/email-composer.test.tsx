import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailComposer } from '@/components/email/email-composer';

// uploadBlob never resolves -> the attachment stays `uploading: true`
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    client: { uploadBlob: () => new Promise<never>(() => {}), createDraft: vi.fn() },
    identities: [],
    primaryIdentity: { id: 'id1', email: 'me@example.com', name: 'Me' },
  }),
}));

vi.mock('@/stores/contact-store', () => ({
  useContactStore: (selector: (s: unknown) => unknown) => selector({ getAutocomplete: () => [] }),
}));

vi.mock('@/stores/template-store', () => ({
  useTemplateStore: (selector: (s: unknown) => unknown) => selector({ addTemplate: vi.fn() }),
}));

vi.mock('@/stores/identity-store', () => ({
  useIdentityStore: () => ({
    subAddress: { recentTags: [], tagSuggestions: {} },
    addRecentTag: vi.fn(),
    addTagSuggestion: vi.fn(),
    getTagSuggestionsForDomain: () => [],
  }),
}));

describe('EmailComposer send gating', () => {
  it('disables Send while an attachment is still uploading', async () => {
    const { container } = render(<EmailComposer onSend={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('to_placeholder'), {
      target: { value: 'friend@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('subject_placeholder'), {
      target: { value: 'Report' },
    });
    fireEvent.change(screen.getByPlaceholderText('body_placeholder'), {
      target: { value: 'See attached' },
    });

    const sendButton = screen.getByRole('button', { name: 'send' });
    expect(sendButton).toBeEnabled();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'report.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Fails on current code: canSend stays true (body present), button stays enabled
    await waitFor(() => expect(sendButton).toBeDisabled());
  });
});
