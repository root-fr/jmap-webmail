import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../settings-store';

function getStore() {
  return useSettingsStore.getState();
}

describe('settings-store unified inbox', () => {
  beforeEach(() => {
    localStorage.clear();
    getStore().resetToDefaults();
  });

  it('defaults showUnifiedInbox to true', () => {
    expect(getStore().showUnifiedInbox).toBe(true);
  });

  it('defaults unifiedInboxExcludedAccounts to an empty array', () => {
    expect(getStore().unifiedInboxExcludedAccounts).toEqual([]);
  });

  it('updateSetting toggles showUnifiedInbox', () => {
    getStore().updateSetting('showUnifiedInbox', false);
    expect(getStore().showUnifiedInbox).toBe(false);
  });

  it('updateSetting stores excluded account ids', () => {
    getStore().updateSetting('unifiedInboxExcludedAccounts', ['acct-2', 'acct-3']);
    expect(getStore().unifiedInboxExcludedAccounts).toEqual(['acct-2', 'acct-3']);
  });

  it('resetToDefaults restores unified inbox settings', () => {
    getStore().updateSetting('showUnifiedInbox', false);
    getStore().updateSetting('unifiedInboxExcludedAccounts', ['acct-2']);
    getStore().resetToDefaults();
    expect(getStore().showUnifiedInbox).toBe(true);
    expect(getStore().unifiedInboxExcludedAccounts).toEqual([]);
  });

  it('exportSettings includes unified inbox settings', () => {
    getStore().updateSetting('unifiedInboxExcludedAccounts', ['acct-2']);
    const exported = JSON.parse(getStore().exportSettings());
    expect(exported.showUnifiedInbox).toBe(true);
    expect(exported.unifiedInboxExcludedAccounts).toEqual(['acct-2']);
  });

  it('importSettings applies unified inbox settings', () => {
    const ok = getStore().importSettings(
      JSON.stringify({ showUnifiedInbox: false, unifiedInboxExcludedAccounts: ['acct-9'] })
    );
    expect(ok).toBe(true);
    expect(getStore().showUnifiedInbox).toBe(false);
    expect(getStore().unifiedInboxExcludedAccounts).toEqual(['acct-9']);
  });

  it('persists unified inbox settings to localStorage like the other settings', () => {
    // Any set() triggers persist of the whole state (no partialize in this store)
    getStore().updateSetting('fontSize', 'large');
    const raw = localStorage.getItem('settings-storage');
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string);
    expect(persisted.state.showUnifiedInbox).toBe(true);
    expect(persisted.state.unifiedInboxExcludedAccounts).toEqual([]);
  });
});
