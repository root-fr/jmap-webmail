import { describe, it, expect } from 'vitest';
import { routing } from '@/i18n/routing';
import en from '@/locales/en/common.json';
import de from '@/locales/de/common.json';
import es from '@/locales/es/common.json';
import fr from '@/locales/fr/common.json';
import itLocale from '@/locales/it/common.json';
import ja from '@/locales/ja/common.json';
import nl from '@/locales/nl/common.json';
import pl from '@/locales/pl/common.json';
import pt from '@/locales/pt/common.json';
import ru from '@/locales/ru/common.json';
import uk from '@/locales/uk/common.json';

type Json = Record<string, unknown>;

function leafKeys(obj: Json, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? leafKeys(v as Json, path)
      : [path];
  });
}

const BUNDLES: Record<string, Json> = { en, de, es, fr, it: itLocale, ja, nl, pl, pt, ru, uk };

describe('locale parity', () => {
  it('routing declares 11 locales including pl', () => {
    expect(routing.locales).toContain('pl');
    expect(routing.locales).toHaveLength(11);
  });

  it('every declared locale has a message bundle', () => {
    for (const code of routing.locales) {
      expect(BUNDLES[code], `missing bundle for ${code}`).toBeDefined();
    }
  });

  const enKeys = new Set(leafKeys(en as Json));
  for (const [code, msgs] of Object.entries(BUNDLES)) {
    it(`${code} has identical key set to en`, () => {
      const keys = new Set(leafKeys(msgs));
      const missing = [...enKeys].filter((k) => !keys.has(k)).sort();
      const extra = [...keys].filter((k) => !enKeys.has(k)).sort();
      expect({ code, missing, extra }).toEqual({ code, missing: [], extra: [] });
    });
  }

  for (const [code, msgs] of Object.entries(BUNDLES)) {
    it(`${code} defines Polish language labels`, () => {
      const lang = msgs.language as Json;
      expect(lang.polish).toBeTruthy();
      expect(lang.switch_to_polish).toBeTruthy();
    });
  }
});
