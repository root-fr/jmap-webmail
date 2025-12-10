import { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

// This is the root layout that wraps all pages
// The actual layout with providers and styles is in [locale]/layout.tsx
export default function RootLayout({ children }: Props) {
  return children;
}