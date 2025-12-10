"use client";

import { useState, useEffect } from "react";
import { useUIStore } from "@/stores/ui-store";

// Tailwind v4 breakpoints
const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

/**
 * SSR-safe media query hook
 * Returns false during SSR to prevent hydration mismatch
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/**
 * Hook to detect device type and sync with UI store
 * Uses Tailwind breakpoints: mobile < 768px, tablet 768-1024px, desktop > 1024px
 */
export function useDeviceDetection() {
  const { setDeviceType, isMobile, isTablet, isDesktop } = useUIStore();

  const isMobileQuery = useMediaQuery(`(max-width: ${BREAKPOINTS.md - 1}px)`);
  const isTabletQuery = useMediaQuery(
    `(min-width: ${BREAKPOINTS.md}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`
  );
  const isDesktopQuery = useMediaQuery(`(min-width: ${BREAKPOINTS.lg}px)`);

  useEffect(() => {
    setDeviceType(isMobileQuery, isTabletQuery, isDesktopQuery);
  }, [isMobileQuery, isTabletQuery, isDesktopQuery, setDeviceType]);

  return { isMobile, isTablet, isDesktop };
}

/**
 * Convenience hooks for specific breakpoints
 */
export function useIsMobile() {
  return useMediaQuery(`(max-width: ${BREAKPOINTS.md - 1}px)`);
}

export function useIsTablet() {
  return useMediaQuery(
    `(min-width: ${BREAKPOINTS.md}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`
  );
}

export function useIsDesktop() {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.lg}px)`);
}

export function useBreakpoint(breakpoint: keyof typeof BREAKPOINTS) {
  return useMediaQuery(`(min-width: ${BREAKPOINTS[breakpoint]}px)`);
}
