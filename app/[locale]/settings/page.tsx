"use client";

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { EmailSettings } from '@/components/settings/email-settings';
import { AccountSettings } from '@/components/settings/account-settings';
import { AdvancedSettings } from '@/components/settings/advanced-settings';
import { cn } from '@/lib/utils';

type Tab = 'appearance' | 'email' | 'account' | 'advanced';

export default function SettingsPage() {
  const router = useRouter();
  const params = useParams();
  const t = useTranslations('settings');
  const [activeTab, setActiveTab] = useState<Tab>('appearance');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'appearance', label: t('tabs.appearance') },
    { id: 'email', label: t('tabs.email') },
    { id: 'account', label: t('tabs.account') },
    { id: 'advanced', label: t('tabs.advanced') },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Settings Sidebar */}
      <div className="w-64 border-r border-border bg-secondary flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/${params.locale}`)}
            className="w-full justify-start"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('back_to_mail')}
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-2 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded text-sm transition-colors',
                  activeTab === tab.id
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-8">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <SettingsIcon className="w-8 h-8 text-foreground" />
              <h1 className="text-3xl font-semibold text-foreground">{t('title')}</h1>
            </div>
          </div>

          {/* Active Tab Content */}
          <div className="bg-card border border-border rounded-lg p-6">
            {activeTab === 'appearance' && <AppearanceSettings />}
            {activeTab === 'email' && <EmailSettings />}
            {activeTab === 'account' && <AccountSettings />}
            {activeTab === 'advanced' && <AdvancedSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}
