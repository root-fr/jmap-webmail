"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useMenuKeyboard } from "@/hooks/use-menu-keyboard";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { ThreadGroup } from "@/lib/jmap/types";

type SelectionFilter = 'all' | 'none' | 'read' | 'unread' | 'starred' | 'unstarred';

interface SelectionDropdownProps {
  hasSelection: boolean;
  allSelected: boolean;
  onSelectByFilter: (filter: SelectionFilter, threadGroups: ThreadGroup[]) => void;
  threadGroups: ThreadGroup[];
}

export function SelectionDropdown({ hasSelection, allSelected, onSelectByFilter, threadGroups }: SelectionDropdownProps) {
  const t = useTranslations('email_list');
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  useMenuKeyboard({ isOpen, containerRef: menuRef, onClose: close });

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (filter: SelectionFilter) => {
    onSelectByFilter(filter, threadGroups);
    setIsOpen(false);
  };

  const filters: { key: SelectionFilter; label: string }[] = [
    { key: 'all', label: t('select_criteria.all') },
    { key: 'none', label: t('select_criteria.none') },
    { key: 'read', label: t('select_criteria.read') },
    { key: 'unread', label: t('select_criteria.unread') },
    { key: 'starred', label: t('select_criteria.starred') },
    { key: 'unstarred', label: t('select_criteria.unstarred') },
  ];

  const getMenuPosition = () => {
    if (!buttonRef.current) return { top: 0, left: 0 };
    const rect = buttonRef.current.getBoundingClientRect();
    return { top: rect.bottom + 4, left: rect.left };
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1 p-1 rounded transition-all duration-200",
          "hover:bg-muted hover:scale-105",
          "active:scale-95",
          (hasSelection || allSelected) && "text-primary"
        )}
        aria-label={t('select_criteria.label')}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <div className={cn(
          "w-4 h-4 rounded-sm border-2 transition-colors",
          allSelected
            ? "bg-primary border-primary"
            : hasSelection
              ? "bg-primary/50 border-primary"
              : "border-muted-foreground"
        )} />
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className={cn(
            "fixed z-50 min-w-[160px] bg-background rounded-md shadow-lg border border-border",
            "animate-in fade-in-0 zoom-in-95 duration-100"
          )}
          style={getMenuPosition()}
          role="menu"
        >
          <div className="py-1">
            {filters.map(({ key, label }) => (
              <button
                key={key}
                role="menuitem"
                className={cn(
                  "w-full px-3 py-2 text-sm text-left",
                  "transition-colors duration-100",
                  "hover:bg-muted cursor-pointer",
                  "focus:outline-none focus:bg-muted"
                )}
                onClick={() => handleSelect(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
