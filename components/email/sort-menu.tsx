"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowDownUp, ArrowUp, ArrowDown, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useEmailStore } from "@/stores/email-store";
import type { EmailSort } from "@/lib/jmap/search-utils";

const SORT_FIELDS: { by: EmailSort["by"]; labelKey: string }[] = [
  { by: "receivedAt", labelKey: "by_date" },
  { by: "from", labelKey: "by_sender" },
  { by: "subject", labelKey: "by_subject" },
  { by: "size", labelKey: "by_size" },
];

export function SortMenu() {
  const t = useTranslations("sort");
  const { client } = useAuthStore();
  const sort = useEmailStore((s) => s.currentQuery.sort);
  const setSort = useEmailStore((s) => s.setSort);

  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeField = SORT_FIELDS.find((f) => f.by === sort.by) ?? SORT_FIELDS[0];
  const itemCount = SORT_FIELDS.length + 2;

  const apply = useCallback(
    (next: EmailSort) => {
      if (client) setSort(client, next);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [client, setSort],
  );

  const chooseField = (by: EmailSort["by"]) =>
    apply({ by, ascending: by === sort.by ? !sort.ascending : false });

  const chooseDirection = (ascending: boolean) =>
    apply({ by: sort.by, ascending });

  useEffect(() => {
    if (!isOpen) return;
    setFocusedIndex(0);
    const timer = setTimeout(() => itemRefs.current[0]?.focus(), 20);
    const onClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) itemRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, isOpen]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => (i + 1) % itemCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => (i - 1 + itemCount) % itemCount);
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusedIndex(itemCount - 1);
    }
  };

  const DirectionIcon = sort.ascending ? ArrowUp : ArrowDown;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md",
          "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <ArrowDownUp className="w-4 h-4" />
        <span>{t(activeField.labelKey)}</span>
        <DirectionIcon className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute right-0 mt-1 z-50 w-48 rounded-lg border border-border bg-background shadow-lg",
            "animate-in fade-in-0 zoom-in-95 duration-100 py-1",
          )}
        >
          {SORT_FIELDS.map((field, index) => {
            const checked = field.by === sort.by;
            return (
              <button
                key={field.by}
                ref={(el) => { itemRefs.current[index] = el; }}
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={-1}
                onClick={() => chooseField(field.by)}
                className={cn(
                  "w-full px-3 py-2 text-sm text-left flex items-center gap-2",
                  "hover:bg-muted focus:bg-muted focus:outline-none",
                  checked ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                <Check className={cn("w-4 h-4 flex-shrink-0", checked ? "opacity-100" : "opacity-0")} />
                <span>{t(field.labelKey)}</span>
              </button>
            );
          })}

          <div className="my-1 h-px bg-border" role="separator" />

          {[true, false].map((asc, i) => {
            const index = SORT_FIELDS.length + i;
            const checked = sort.ascending === asc;
            const Icon = asc ? ArrowUp : ArrowDown;
            return (
              <button
                key={asc ? "asc" : "desc"}
                ref={(el) => { itemRefs.current[index] = el; }}
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={-1}
                onClick={() => chooseDirection(asc)}
                className={cn(
                  "w-full px-3 py-2 text-sm text-left flex items-center gap-2",
                  "hover:bg-muted focus:bg-muted focus:outline-none",
                  checked ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{t(asc ? "ascending" : "descending")}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
