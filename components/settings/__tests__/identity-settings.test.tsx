import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/stores/identity-store', () => ({
  useIdentityStore: () => ({ identities: [] }),
}));

vi.mock('@/components/identity/identity-manager-modal', () => ({
  IdentityManagerModal: () => null,
}));

import { IdentitySettings } from '@/components/settings/identity-settings';

describe('IdentitySettings', () => {
  it('keeps the sub-addressing info row without a dead-end control', () => {
    render(<IdentitySettings />);

    expect(screen.getByText('sub_addressing.label')).toBeInTheDocument();
    expect(screen.getByText('sub_addressing.description')).toBeInTheDocument();
    // "Learn More" used to open the identity manager, which says nothing
    // about sub-addressing (github issue 76).
    expect(screen.queryByText('sub_addressing.learn_more')).not.toBeInTheDocument();
  });

  it('still offers the manage identities action', () => {
    render(<IdentitySettings />);

    expect(screen.getByText('manage')).toBeInTheDocument();
  });
});
