import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailComposer } from '@/components/email/email-composer';

const primaryIdentity = { id: 'id-me', email: 'me@example.com', name: 'Me', mayDelete: false };
const teamIdentity = { id: 'id-team', email: 'support@example.com', name: 'Support', mayDelete: false };

const h = vi.hoisted(() => ({
  uploadBlob: vi.fn(),
  createDraft: vi.fn(),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    client: { uploadBlob: h.uploadBlob, createDraft: h.createDraft },
    identities: [primaryIdentity],
    primaryIdentity,
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
    identitiesByAccount: {
      'acc-1': [primaryIdentity],
      'acc-team': [teamIdentity],
    },
    primaryAccountId: 'acc-1',
  }),
}));

describe('EmailComposer account-grouped identities', () => {
  beforeEach(() => {
    h.uploadBlob.mockReset();
    h.createDraft.mockReset();
  });

  it('groups the From picker by account when non-primary identities exist', () => {
    render(<EmailComposer onSend={vi.fn()} />);

    const select = screen.getByRole('combobox', { name: 'from' });
    const groups = select.querySelectorAll('optgroup');
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('identity_group_own');
    expect(groups[1].label).toBe('support@example.com');
  });

  it('preselects the owning account identity when replying to a non-primary email', () => {
    render(
      <EmailComposer
        onSend={vi.fn()}
        mode="reply"
        replyTo={{
          from: [{ email: 'customer@example.com', name: 'Customer' }],
          subject: 'Help',
          body: 'Hi',
          receivedAt: '2026-07-01T10:00:00Z',
          accountId: 'acc-team',
        }}
      />
    );

    const select = screen.getByRole('combobox', { name: 'from' }) as HTMLSelectElement;
    expect(select.value).toBe('id-team');
  });

  it('keeps the primary identity in compose mode even when a non-primary email is selected', () => {
    render(
      <EmailComposer
        onSend={vi.fn()}
        mode="compose"
        replyTo={{
          from: [{ email: 'customer@example.com', name: 'Customer' }],
          subject: 'Help',
          body: 'Hi',
          receivedAt: '2026-07-01T10:00:00Z',
          accountId: 'acc-team',
        }}
      />
    );

    const select = screen.getByRole('combobox', { name: 'from' }) as HTMLSelectElement;
    expect(select.value).toBe('id-me');
  });

  it('routes the send through the owning account when a group identity is chosen in compose mode', async () => {
    h.createDraft.mockResolvedValue('draft-1');
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<EmailComposer onSend={onSend} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'from' }), {
      target: { value: 'id-team' },
    });
    fireEvent.change(screen.getByPlaceholderText('to_placeholder'), {
      target: { value: 'friend@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('subject_placeholder'), {
      target: { value: 'Hello' },
    });
    fireEvent.change(screen.getByPlaceholderText('body_placeholder'), {
      target: { value: 'Hi there' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0][0]).toMatchObject({
      accountId: 'acc-team',
      identityId: 'id-team',
      fromEmail: 'support@example.com',
    });
  });

  it('re-saves the draft under the primary identity before the explicit fallback resend', async () => {
    h.createDraft
      .mockResolvedValueOnce('draft-1')
      .mockResolvedValueOnce('draft-2');
    const onSend = vi.fn()
      .mockRejectedValueOnce(new Error('Not allowed'))
      .mockResolvedValueOnce(undefined);

    render(
      <EmailComposer
        onSend={onSend}
        mode="reply"
        replyTo={{
          from: [{ email: 'customer@example.com', name: 'Customer' }],
          subject: 'Help',
          body: 'Hi',
          receivedAt: '2026-07-01T10:00:00Z',
          accountId: 'acc-team',
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    const fallbackButton = await screen.findByRole('button', {
      name: 'send_as_fallback_confirm',
    });
    fireEvent.click(fallbackButton);

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));

    // The autosaved draft carries the group identity's From header, which
    // cannot be edited in place: the fallback must replace the draft under
    // the primary identity and resubmit the replacement.
    expect(h.createDraft).toHaveBeenCalledTimes(2);
    const resave = h.createDraft.mock.calls[1];
    expect(resave[5]).toBe('id-me');
    expect(resave[6]).toBe('me@example.com');
    expect(resave[7]).toBe('draft-1');

    const retry = onSend.mock.calls[1][0];
    expect(retry).toMatchObject({
      draftId: 'draft-2',
      identityId: 'id-me',
      fromEmail: 'me@example.com',
    });
    expect(retry.accountId).toBeUndefined();
  });
});
