"use client";

import { useTranslations } from 'next-intl';
import { useSettingsStore } from '@/stores/settings-store';
import { SettingsSection, SettingItem, Select, ToggleSwitch } from './settings-section';

export function EmailSettings() {
  const t = useTranslations('settings.email_behavior');
  const {
    markAsReadDelay,
    deleteAction,
    showPreview,
    emailsPerPage,
    externalContentPolicy,
    updateSetting,
  } = useSettingsStore();

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      {/* Mark as Read */}
      <SettingItem label={t('mark_read.label')} description={t('mark_read.description')}>
        <Select
          value={markAsReadDelay.toString()}
          onChange={(value) => updateSetting('markAsReadDelay', parseInt(value))}
          options={[
            { value: '0', label: t('mark_read.instant') },
            { value: '3000', label: t('mark_read.delay_3s') },
            { value: '5000', label: t('mark_read.delay_5s') },
            { value: '-1', label: t('mark_read.never') },
          ]}
        />
      </SettingItem>

      {/* Delete Action */}
      <SettingItem label={t('delete_action.label')} description={t('delete_action.description')}>
        <Select
          value={deleteAction}
          onChange={(value) => updateSetting('deleteAction', value as 'trash' | 'permanent')}
          options={[
            { value: 'trash', label: t('delete_action.trash') },
            { value: 'permanent', label: t('delete_action.permanent') },
          ]}
        />
      </SettingItem>

      {/* Show Preview */}
      <SettingItem label={t('show_preview.label')} description={t('show_preview.description')}>
        <ToggleSwitch checked={showPreview} onChange={(checked) => updateSetting('showPreview', checked)} />
      </SettingItem>

      {/* Emails Per Page */}
      <SettingItem label={t('emails_per_page.label')} description={t('emails_per_page.description')}>
        <Select
          value={emailsPerPage.toString()}
          onChange={(value) => updateSetting('emailsPerPage', parseInt(value))}
          options={[
            { value: '25', label: t('emails_per_page.25') },
            { value: '50', label: t('emails_per_page.50') },
            { value: '100', label: t('emails_per_page.100') },
          ]}
        />
      </SettingItem>

      {/* External Content */}
      <SettingItem label={t('external_content.label')} description={t('external_content.description')}>
        <Select
          value={externalContentPolicy}
          onChange={(value) =>
            updateSetting('externalContentPolicy', value as 'ask' | 'block' | 'allow')
          }
          options={[
            { value: 'ask', label: t('external_content.ask') },
            { value: 'block', label: t('external_content.block') },
            { value: 'allow', label: t('external_content.allow') },
          ]}
        />
      </SettingItem>
    </SettingsSection>
  );
}
