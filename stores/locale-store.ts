import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LocaleStore {
  locale: string | null;
  setLocale: (locale: string) => void;
}

export const useLocaleStore = create<LocaleStore>()(
  persist(
    (set) => ({
      locale: null,
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'locale-storage',
    }
  )
);