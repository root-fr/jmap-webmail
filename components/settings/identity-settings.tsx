'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { SettingsSection, SettingItem } from './settings-section';
import { IdentityManagerModal } from '@/components/identity/identity-manager-modal';
import { useIdentityStore } from '@/stores/identity-store';

export function IdentitySettings() {
  const t = useTranslations('settings.identities');
  const { identities } = useIdentityStore();
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <SettingsSection title={t('title')} description={t('description')}>
        {/* Identity Count */}
        <SettingItem
          label={t('identities_count.label')}
          description={t('identities_count.description')}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground">
              {identities.length === 0
                ? t('identities_count.count_zero')
                : identities.length === 1
                ? t('identities_count.count_one')
                : t('identities_count.count_other', { count: identities.length })}
            </span>
            <Button onClick={() => setShowModal(true)} size="sm">
              {t('manage')}
            </Button>
          </div>
        </SettingItem>

        {/* Sub-Addressing Info */}
        <SettingItem
          label={t('sub_addressing.label')}
          description={t('sub_addressing.description')}
        />
      </SettingsSection>

      {/* Identity Manager Modal */}
      <IdentityManagerModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
