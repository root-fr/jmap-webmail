import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES = ['en', 'fr', 'ja', 'es', 'it', 'de', 'nl', 'pt', 'ru', 'uk', 'pl'] as const;

// The exact keys the unified-inbox components consume (T8/T10/T11/T12/T13).
const KEYS = [
  'sidebar.all_inboxes',
  'email_list.unified_failure.message',
  'email_list.unified_failure.retry',
  'email_list.unified_failure.dismiss',
  'email_composer.identity_group_own',
  'email_composer.send_as_failed_title',
  'email_composer.send_as_failed_message',
  'email_composer.send_as_fallback_confirm',
  'settings.tabs.unified_inbox',
  'settings.unified_inbox.title',
  'settings.unified_inbox.description',
  'settings.unified_inbox.show.label',
  'settings.unified_inbox.show.description',
  'settings.unified_inbox.accounts.label',
  'settings.unified_inbox.accounts.description',
  'settings.unified_inbox.accounts.empty',
] as const;

const REQUIRED_PLACEHOLDERS: Record<string, string[]> = {
  'email_list.unified_failure.message': ['{accounts}'],
  'email_composer.send_as_failed_message': ['{error}'],
};

function loadLocale(locale: string): Record<string, unknown> {
  const raw = readFileSync(join(process.cwd(), 'locales', locale, 'common.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function resolve(messages: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, messages);
}

describe('unified inbox i18n consolidation guard', () => {
  it('tracks exactly 11 locales', () => {
    expect(LOCALES).toHaveLength(11);
  });

  it.each(LOCALES)('locale %s defines every unified inbox key as a non-empty string', (locale) => {
    const messages = loadLocale(locale);
    for (const key of KEYS) {
      const value = resolve(messages, key);
      expect(typeof value, `${locale}: ${key} must be a string`).toBe('string');
      expect((value as string).trim().length, `${locale}: ${key} must be non-empty`).toBeGreaterThan(0);
    }
  });

  it.each(LOCALES)('locale %s keeps ICU placeholders intact', (locale) => {
    const messages = loadLocale(locale);
    for (const [key, placeholders] of Object.entries(REQUIRED_PLACEHOLDERS)) {
      const value = resolve(messages, key);
      expect(typeof value, `${locale}: ${key} must be a string`).toBe('string');
      for (const placeholder of placeholders) {
        expect(value as string, `${locale}: ${key} must contain ${placeholder}`).toContain(placeholder);
      }
    }
  });
});
