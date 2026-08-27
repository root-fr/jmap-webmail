import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useIdentityStore } from '../identity-store';
import type { Identity } from '@/lib/jmap/types';
import type { JMAPClient } from '@/lib/jmap/client';

const makeIdentity = (overrides: Partial<Identity> = {}): Identity => ({
  id: 'id-1',
  name: 'Test User',
  email: 'test@example.com',
  mayDelete: true,
  ...overrides,
});

describe('identity-store', () => {
  beforeEach(() => {
    useIdentityStore.setState({
      identities: [],
      selectedIdentityId: null,
      isLoading: false,
      error: null,
      subAddress: { recentTags: [], tagSuggestions: {} },
    });
  });

  describe('setIdentities', () => {
    it('should set identities list', () => {
      const identities = [makeIdentity(), makeIdentity({ id: 'id-2', email: 'other@test.com' })];
      useIdentityStore.getState().setIdentities(identities);
      expect(useIdentityStore.getState().identities).toHaveLength(2);
    });

    it('should replace existing identities', () => {
      useIdentityStore.getState().setIdentities([makeIdentity()]);
      useIdentityStore.getState().setIdentities([makeIdentity({ id: 'id-new' })]);
      expect(useIdentityStore.getState().identities).toHaveLength(1);
      expect(useIdentityStore.getState().identities[0].id).toBe('id-new');
    });
  });

  describe('addIdentity', () => {
    it('should append identity to list', () => {
      useIdentityStore.getState().addIdentity(makeIdentity());
      expect(useIdentityStore.getState().identities).toHaveLength(1);
    });

    it('should not remove existing identities', () => {
      useIdentityStore.getState().addIdentity(makeIdentity({ id: 'id-1' }));
      useIdentityStore.getState().addIdentity(makeIdentity({ id: 'id-2' }));
      expect(useIdentityStore.getState().identities).toHaveLength(2);
    });
  });

  describe('updateIdentityLocal', () => {
    it('should update matching identity', () => {
      useIdentityStore.getState().setIdentities([makeIdentity({ id: 'id-1', name: 'Old' })]);
      useIdentityStore.getState().updateIdentityLocal('id-1', { name: 'New' });
      expect(useIdentityStore.getState().identities[0].name).toBe('New');
    });

    it('should not modify other identities', () => {
      useIdentityStore.getState().setIdentities([
        makeIdentity({ id: 'id-1', name: 'First' }),
        makeIdentity({ id: 'id-2', name: 'Second' }),
      ]);
      useIdentityStore.getState().updateIdentityLocal('id-1', { name: 'Updated' });
      expect(useIdentityStore.getState().identities[1].name).toBe('Second');
    });

    it('should no-op for non-existent identity', () => {
      useIdentityStore.getState().setIdentities([makeIdentity()]);
      useIdentityStore.getState().updateIdentityLocal('nonexistent', { name: 'X' });
      expect(useIdentityStore.getState().identities[0].name).toBe('Test User');
    });
  });

  describe('removeIdentity', () => {
    it('should remove identity by id', () => {
      useIdentityStore.getState().setIdentities([makeIdentity({ id: 'id-1' }), makeIdentity({ id: 'id-2' })]);
      useIdentityStore.getState().removeIdentity('id-1');
      expect(useIdentityStore.getState().identities).toHaveLength(1);
      expect(useIdentityStore.getState().identities[0].id).toBe('id-2');
    });

    it('should clear selectedIdentityId when removing selected identity', () => {
      useIdentityStore.getState().setIdentities([makeIdentity({ id: 'id-1' })]);
      useIdentityStore.getState().selectIdentity('id-1');
      useIdentityStore.getState().removeIdentity('id-1');
      expect(useIdentityStore.getState().selectedIdentityId).toBeNull();
    });

    it('should preserve selectedIdentityId when removing different identity', () => {
      useIdentityStore.getState().setIdentities([makeIdentity({ id: 'id-1' }), makeIdentity({ id: 'id-2' })]);
      useIdentityStore.getState().selectIdentity('id-1');
      useIdentityStore.getState().removeIdentity('id-2');
      expect(useIdentityStore.getState().selectedIdentityId).toBe('id-1');
    });
  });

  describe('selectIdentity', () => {
    it('should set selectedIdentityId', () => {
      useIdentityStore.getState().selectIdentity('id-1');
      expect(useIdentityStore.getState().selectedIdentityId).toBe('id-1');
    });

    it('should allow null to deselect', () => {
      useIdentityStore.getState().selectIdentity('id-1');
      useIdentityStore.getState().selectIdentity(null);
      expect(useIdentityStore.getState().selectedIdentityId).toBeNull();
    });
  });

  describe('setLoading', () => {
    it('should set loading state', () => {
      useIdentityStore.getState().setLoading(true);
      expect(useIdentityStore.getState().isLoading).toBe(true);
    });

    it('should clear loading state', () => {
      useIdentityStore.getState().setLoading(true);
      useIdentityStore.getState().setLoading(false);
      expect(useIdentityStore.getState().isLoading).toBe(false);
    });
  });

  describe('setError', () => {
    it('should set error message', () => {
      useIdentityStore.getState().setError('Something went wrong');
      expect(useIdentityStore.getState().error).toBe('Something went wrong');
    });

    it('should clear error with null', () => {
      useIdentityStore.getState().setError('error');
      useIdentityStore.getState().setError(null);
      expect(useIdentityStore.getState().error).toBeNull();
    });
  });

  describe('clearIdentities', () => {
    it('should clear identities and selection', () => {
      useIdentityStore.getState().setIdentities([makeIdentity()]);
      useIdentityStore.getState().selectIdentity('id-1');
      useIdentityStore.getState().setError('old error');
      useIdentityStore.getState().clearIdentities();

      const state = useIdentityStore.getState();
      expect(state.identities).toEqual([]);
      expect(state.selectedIdentityId).toBeNull();
      expect(state.error).toBeNull();
    });

    it('should not clear sub-address state', () => {
      useIdentityStore.getState().addRecentTag('shopping');
      useIdentityStore.getState().clearIdentities();
      expect(useIdentityStore.getState().subAddress.recentTags).toContain('shopping');
    });
  });

  describe('addRecentTag', () => {
    it('should add tag to recent tags', () => {
      useIdentityStore.getState().addRecentTag('shopping');
      expect(useIdentityStore.getState().subAddress.recentTags).toEqual(['shopping']);
    });

    it('should prepend new tags', () => {
      useIdentityStore.getState().addRecentTag('first');
      useIdentityStore.getState().addRecentTag('second');
      expect(useIdentityStore.getState().subAddress.recentTags[0]).toBe('second');
    });

    it('should deduplicate tags by moving to front', () => {
      useIdentityStore.getState().addRecentTag('a');
      useIdentityStore.getState().addRecentTag('b');
      useIdentityStore.getState().addRecentTag('a');
      const tags = useIdentityStore.getState().subAddress.recentTags;
      expect(tags).toEqual(['a', 'b']);
    });

    it('should cap at 10 recent tags', () => {
      for (let i = 0; i < 15; i++) {
        useIdentityStore.getState().addRecentTag(`tag-${i}`);
      }
      expect(useIdentityStore.getState().subAddress.recentTags).toHaveLength(10);
      expect(useIdentityStore.getState().subAddress.recentTags[0]).toBe('tag-14');
    });
  });

  describe('addTagSuggestion', () => {
    it('should add suggestion for domain', () => {
      useIdentityStore.getState().addTagSuggestion('example.com', 'promo');
      expect(useIdentityStore.getState().subAddress.tagSuggestions['example.com']).toEqual(['promo']);
    });

    it('should not duplicate existing suggestion', () => {
      useIdentityStore.getState().addTagSuggestion('example.com', 'promo');
      useIdentityStore.getState().addTagSuggestion('example.com', 'promo');
      expect(useIdentityStore.getState().subAddress.tagSuggestions['example.com']).toEqual(['promo']);
    });

    it('should cap at 5 suggestions per domain', () => {
      for (let i = 0; i < 8; i++) {
        useIdentityStore.getState().addTagSuggestion('example.com', `tag-${i}`);
      }
      expect(useIdentityStore.getState().subAddress.tagSuggestions['example.com']).toHaveLength(5);
    });

    it('should keep suggestions separate per domain', () => {
      useIdentityStore.getState().addTagSuggestion('a.com', 'tag-a');
      useIdentityStore.getState().addTagSuggestion('b.com', 'tag-b');
      expect(useIdentityStore.getState().subAddress.tagSuggestions['a.com']).toEqual(['tag-a']);
      expect(useIdentityStore.getState().subAddress.tagSuggestions['b.com']).toEqual(['tag-b']);
    });
  });

  describe('getTagSuggestionsForDomain', () => {
    it('should return suggestions for known domain', () => {
      useIdentityStore.getState().addTagSuggestion('example.com', 'promo');
      expect(useIdentityStore.getState().getTagSuggestionsForDomain('example.com')).toEqual(['promo']);
    });

    it('should return empty array for unknown domain', () => {
      expect(useIdentityStore.getState().getTagSuggestionsForDomain('unknown.com')).toEqual([]);
    });
  });

  describe('clearRecentTags', () => {
    it('should clear recent tags', () => {
      useIdentityStore.getState().addRecentTag('a');
      useIdentityStore.getState().addRecentTag('b');
      useIdentityStore.getState().clearRecentTags();
      expect(useIdentityStore.getState().subAddress.recentTags).toEqual([]);
    });

    it('should not clear tag suggestions', () => {
      useIdentityStore.getState().addTagSuggestion('example.com', 'promo');
      useIdentityStore.getState().clearRecentTags();
      expect(useIdentityStore.getState().subAddress.tagSuggestions['example.com']).toEqual(['promo']);
    });
  });

  describe('account-keyed identities', () => {
    beforeEach(() => {
      useIdentityStore.setState({ identitiesByAccount: {}, primaryAccountId: null });
    });

    it('loadAccountIdentities buckets non-primary identities and mirrors primary from the existing list', async () => {
      const primary = makeIdentity({ id: 'id-me', email: 'me@example.com' });
      const team = makeIdentity({ id: 'id-team', email: 'support@example.com' });
      useIdentityStore.getState().setIdentities([primary]);

      const getIdentities = vi.fn(async (accountId?: string) =>
        accountId === 'acc-team' ? [team] : []
      );
      const client = {
        getPrimaryAccountId: () => 'acc-1',
        getAccountIds: () => ['acc-1', 'acc-team', 'acc-empty'],
        getIdentities,
      } as unknown as JMAPClient;

      await useIdentityStore.getState().loadAccountIdentities(client);

      const state = useIdentityStore.getState();
      expect(state.primaryAccountId).toBe('acc-1');
      expect(state.identitiesByAccount['acc-1']).toEqual([primary]);
      expect(state.identitiesByAccount['acc-team']).toEqual([team]);
      expect(state.identitiesByAccount).not.toHaveProperty('acc-empty');
      expect(getIdentities).not.toHaveBeenCalledWith('acc-1');
    });

    it('clearIdentities resets account buckets and primary account id', () => {
      useIdentityStore.setState({
        identitiesByAccount: { 'acc-1': [makeIdentity()] },
        primaryAccountId: 'acc-1',
      });

      useIdentityStore.getState().clearIdentities();

      expect(useIdentityStore.getState().identitiesByAccount).toEqual({});
      expect(useIdentityStore.getState().primaryAccountId).toBeNull();
    });
  });

  describe('persistence', () => {
    it('should only persist subAddress state', () => {
      const { partialize } = (useIdentityStore as unknown as { persist: { getOptions: () => { partialize: (state: Record<string, unknown>) => Record<string, unknown> } } }).persist.getOptions();
      const fullState = {
        identities: [makeIdentity()],
        selectedIdentityId: 'id-1',
        isLoading: true,
        error: 'err',
        subAddress: { recentTags: ['a'], tagSuggestions: {} },
      };
      const persisted = partialize(fullState);
      expect(persisted).toHaveProperty('subAddress');
      expect(persisted).not.toHaveProperty('identities');
      expect(persisted).not.toHaveProperty('selectedIdentityId');
      expect(persisted).not.toHaveProperty('isLoading');
      expect(persisted).not.toHaveProperty('error');
    });
  });
});
