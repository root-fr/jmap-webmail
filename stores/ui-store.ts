"use client";

import { create } from "zustand";

export type ActiveView = "sidebar" | "list" | "viewer";

interface UIState {
  // Mobile view state
  activeView: ActiveView;
  sidebarOpen: boolean;

  // Tablet list visibility (auto-hide when email selected)
  tabletListVisible: boolean;

  // Device detection (hydrated client-side)
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;

  // Actions
  setActiveView: (view: ActiveView) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setTabletListVisible: (visible: boolean) => void;
  setDeviceType: (isMobile: boolean, isTablet: boolean, isDesktop: boolean) => void;

  // Navigation helpers
  showEmailList: () => void;
  showEmailViewer: () => void;
  goBack: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  // Initial state (SSR-safe defaults)
  activeView: "list",
  sidebarOpen: false,
  tabletListVisible: true,
  isMobile: false,
  isTablet: false,
  isDesktop: true,

  // Actions
  setActiveView: (view) => set({ activeView: view }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setTabletListVisible: (visible) => set({ tabletListVisible: visible }),

  setDeviceType: (isMobile, isTablet, isDesktop) =>
    set({ isMobile, isTablet, isDesktop }),

  // Navigation helpers for mobile
  showEmailList: () => {
    const { isMobile } = get();
    if (isMobile) {
      set({ activeView: "list", sidebarOpen: false });
    }
  },

  showEmailViewer: () => {
    const { isMobile } = get();
    if (isMobile) {
      set({ activeView: "viewer" });
    }
  },

  goBack: () => {
    const { activeView, isMobile } = get();
    if (!isMobile) return;

    if (activeView === "viewer") {
      set({ activeView: "list" });
    } else if (activeView === "list") {
      set({ sidebarOpen: true });
    }
  },
}));
