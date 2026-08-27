"use client";

import { Toaster } from "sonner";
import { useThemeStore } from "@/stores/theme-store";

// App-wide mount for sonner toasts (spam undo, batch move feedback, ...).
// Follows the app theme rather than the OS one, which sonner's "system"
// setting would track.
export function SonnerToaster() {
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  return <Toaster theme={resolvedTheme} position="bottom-right" />;
}
