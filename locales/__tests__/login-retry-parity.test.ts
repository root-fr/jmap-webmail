import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES = ['en', 'fr', 'ja', 'es', 'it', 'de', 'nl', 'pt', 'ru', 'uk', 'pl'] as const;

// The OAuth discovery-failure banner renders login.retry; a missing key threw
// MISSING_MESSAGE on the login page.
describe('login retry i18n parity', () => {
  it.each(LOCALES)('locale %s defines login.retry as a non-empty string', (locale) => {
    const raw = readFileSync(join(process.cwd(), 'locales', locale, 'common.json'), 'utf8');
    const parsed = JSON.parse(raw) as { login?: Record<string, unknown> };
    const retry = parsed.login?.retry;
    expect(typeof retry, `${locale}.login.retry must be a string`).toBe('string');
    expect((retry as string).trim().length, `${locale}.login.retry must be non-empty`).toBeGreaterThan(0);
  });
});
