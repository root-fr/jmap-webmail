import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES = ['en', 'fr', 'ja', 'es', 'it', 'de', 'nl', 'pt', 'ru', 'uk', 'pl'] as const;
const SCOPE_KEYS = ['scope_everywhere', 'scope_this_folder', 'include_trash_junk'] as const;

function loadSearch(locale: string): Record<string, unknown> {
  const raw = readFileSync(join(process.cwd(), 'locales', locale, 'common.json'), 'utf8');
  const parsed = JSON.parse(raw) as { search?: Record<string, unknown> };
  return parsed.search ?? {};
}

describe('search scope i18n parity', () => {
  it('tracks exactly 11 locales', () => {
    expect(LOCALES).toHaveLength(11);
  });

  it.each(LOCALES)('locale %s defines every scope key as a non-empty string', (locale) => {
    const search = loadSearch(locale);
    for (const key of SCOPE_KEYS) {
      expect(typeof search[key], `${locale}.search.${key} must be a string`).toBe('string');
      expect((search[key] as string).trim().length, `${locale}.search.${key} must be non-empty`).toBeGreaterThan(0);
    }
  });
});
