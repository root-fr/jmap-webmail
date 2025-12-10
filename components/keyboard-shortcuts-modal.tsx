"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { X, Keyboard } from "lucide-react";
import { KEYBOARD_SHORTCUTS } from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/utils";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const t = useTranslations();
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on any key press
  useEffect(() => {
    const handleKeyDown = () => {
      onClose();
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div
        ref={modalRef}
        className={cn(
          "bg-background border border-border rounded-lg shadow-xl",
          "w-full max-w-2xl max-h-[80vh] overflow-hidden",
          "animate-in zoom-in-95 duration-200"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Keyboard className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">
              {t("shortcuts.title")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Navigation Section */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
                {t("shortcuts.sections.navigation")}
              </h3>
              <div className="space-y-2">
                {KEYBOARD_SHORTCUTS.navigation.map((shortcut) => (
                  <ShortcutRow
                    key={shortcut.key}
                    shortcutKey={shortcut.key}
                    description={t(shortcut.description)}
                  />
                ))}
              </div>
            </section>

            {/* Actions Section */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
                {t("shortcuts.sections.actions")}
              </h3>
              <div className="space-y-2">
                {KEYBOARD_SHORTCUTS.actions.map((shortcut) => (
                  <ShortcutRow
                    key={shortcut.key}
                    shortcutKey={shortcut.key}
                    description={t(shortcut.description)}
                  />
                ))}
              </div>
            </section>

            {/* Global Section */}
            <section className="md:col-span-2">
              <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
                {t("shortcuts.sections.global")}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {KEYBOARD_SHORTCUTS.global.map((shortcut) => (
                  <ShortcutRow
                    key={shortcut.key}
                    shortcutKey={shortcut.key}
                    description={t(shortcut.description)}
                  />
                ))}
              </div>
            </section>

            {/* Threads Section */}
            <section className="md:col-span-2">
              <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
                {t("shortcuts.sections.threads")}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {KEYBOARD_SHORTCUTS.threads.map((shortcut) => (
                  <ShortcutRow
                    key={shortcut.key}
                    shortcutKey={shortcut.key}
                    description={t(shortcut.description)}
                  />
                ))}
              </div>
            </section>
          </div>

          {/* Footer tip */}
          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground text-center">
              {t("shortcuts.tip")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({
  shortcutKey,
  description,
}: {
  shortcutKey: string;
  description: string;
}) {
  // Split keys by " / " to render multiple key badges
  const keys = shortcutKey.split(" / ");

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{description}</span>
      <div className="flex items-center gap-1.5 ml-4">
        {keys.map((key, index) => (
          <span key={index}>
            {index > 0 && <span className="text-muted-foreground/50 mx-1 text-xs">or</span>}
            <kbd
              className={cn(
                "inline-flex items-center justify-center",
                "px-2 py-0.5 text-xs font-mono font-medium",
                "bg-muted border border-border rounded",
                "text-foreground shadow-sm",
                "min-w-[24px]"
              )}
            >
              {key}
            </kbd>
          </span>
        ))}
      </div>
    </div>
  );
}
