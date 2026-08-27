"use client";

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useSettingsStore } from '@/stores/settings-store';
import { useEmailStore } from '@/stores/email-store';
import { SettingsSection, SettingItem, ToggleSwitch } from './settings-section';

export function UnifiedInboxSettings() {
  const t = useTranslations('settings.unified_inbox');
  const { showUnifiedInbox, unifiedInboxExcludedAccounts, updateSetting } = useSettingsStore();
  const { mailboxes } = useEmailStore();

  const accounts = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; isPrimary: boolean }>();
    for (const mailbox of mailboxes) {
      if (!mailbox.accountId || seen.has(mailbox.accountId)) continue;
      seen.set(mailbox.accountId, {
        id: mailbox.accountId,
        name: mailbox.accountName || mailbox.accountId,
        isPrimary: !mailbox.isShared,
      });
    }
    return [...seen.values()].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  }, [mailboxes]);

  const toggleAccount = (accountId: string, included: boolean) => {
    const next = included
      ? unifiedInboxExcludedAccounts.filter((id) => id !== accountId)
      : [...unifiedInboxExcludedAccounts, accountId];
    updateSetting('unifiedInboxExcludedAccounts', next);
  };

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <SettingItem label={t('show.label')} description={t('show.description')}>
        <ToggleSwitch
          checked={showUnifiedInbox}
          onChange={(checked) => updateSetting('showUnifiedInbox', checked)}
        />
      </SettingItem>

      <SettingItem label={t('accounts.label')} description={t('accounts.description')}>
        <div className="flex flex-col items-end gap-2">
          {accounts.length === 0 && (
            <span className="text-sm text-muted-foreground">{t('accounts.empty')}</span>
          )}
          {accounts.map((account) => (
            <label
              key={account.id}
              className="flex items-center gap-2 text-sm text-foreground cursor-pointer"
            >
              <input
                type="checkbox"
                className="rounded border-input"
                disabled={!showUnifiedInbox}
                checked={!unifiedInboxExcludedAccounts.includes(account.id)}
                onChange={(e) => toggleAccount(account.id, e.target.checked)}
              />
              {account.name}
            </label>
          ))}
        </div>
      </SettingItem>
    </SettingsSection>
  );
}
