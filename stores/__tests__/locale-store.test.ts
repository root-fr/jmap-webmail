import { describe, it, expect } from 'vitest';
import { useLocaleStore } from '../locale-store';

describe('locale-store', () => {
  it('defaults locale to null so the middleware Accept-Language result wins on first visit', () => {
    expect(useLocaleStore.getState().locale).toBeNull();
  });

  it('setLocale overrides the null default with an explicit choice', () => {
    useLocaleStore.getState().setLocale('fr');
    expect(useLocaleStore.getState().locale).toBe('fr');
  });
});
