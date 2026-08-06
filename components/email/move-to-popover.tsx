"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { FolderInput, Search, Inbox, Send, FileText, Archive, Trash2, AlertTriangle, Folder } from "lucide-react";
import { cn, getMailboxDisplayName } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Mailbox } from "@/lib/jmap/types";

interface MoveToPopoverProps {
  mailboxes: Mailbox[];
  currentMailboxId: string;
  onMove: (mailboxId: string) => void;
  disabled?: boolean;
}

const roleIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  archive: Archive,
  trash: Trash2,
  junk: AlertTriangle,
};

function getMailboxIcon(mailbox: Mailbox) {
  if (mailbox.role && roleIcons[mailbox.role]) {
    return roleIcons[mailbox.role];
  }
  return Folder;
}

function getMailboxDepth(mailbox: Mailbox, allMailboxes: Mailbox[]): number {
  let depth = 0;
  let current = mailbox;
  while (current.parentId) {
    depth++;
    const parent = allMailboxes.find(m => m.id === current.parentId);
    if (!parent) break;
    current = parent;
  }
  return depth;
}

export function MoveToPopover({ mailboxes, currentMailboxId, onMove, disabled }: MoveToPopoverProps) {
  const t = useTranslations('email_list');
  const tSidebar = useTranslations('sidebar');
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const availableMailboxes = useMemo(() => {
    return mailboxes.filter(m => m.id !== currentMailboxId);
  }, [mailboxes, currentMailboxId]);

  const filteredMailboxes = useMemo(() => {
    const systemRoles = ['inbox', 'sent', 'drafts', 'archive', 'trash', 'junk'];
    const query = search.toLowerCase();
    const filtered = availableMailboxes.filter(m =>
      getMailboxDisplayName(m.role, m.name, tSidebar).toLowerCase().includes(query)
    );

    const system = filtered.filter(m => m.role && systemRoles.includes(m.role));
    const custom = filtered.filter(m => !m.role || !systemRoles.includes(m.role));

    return { system, custom };
  }, [availableMailboxes, search, tSidebar]);

  const allFiltered = [...filteredMailboxes.system, ...filteredMailboxes.custom];

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => searchInputRef.current?.focus(), 50);

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => Math.min(prev + 1, allFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && allFiltered[focusedIndex]) {
      e.preventDefault();
      handleMove(allFiltered[focusedIndex].id);
    }
  };

  const handleMove = (mailboxId: string) => {
    onMove(mailboxId);
    setIsOpen(false);
    setSearch("");
  };

  const getPopoverPosition = () => {
    if (!buttonRef.current) return { top: 0, left: 0 };
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const popoverHeight = 360;

    if (spaceBelow < popoverHeight && rect.top > popoverHeight) {
      return { bottom: window.innerHeight - rect.top + 4, left: rect.left };
    }
    return { top: rect.bottom + 4, left: rect.left };
  };

  const highlightMatch = (text: string) => {
    if (!search) return text;
    const idx = text.toLowerCase().indexOf(search.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <strong className="text-foreground">{text.slice(idx, idx + search.length)}</strong>
        {text.slice(idx + search.length)}
      </>
    );
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => { setIsOpen(!isOpen); setSearch(""); }}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md",
          "transition-colors duration-200",
          "hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed",
          "text-foreground"
        )}
        title={t('batch_actions.move_to')}
      >
        <FolderInput className="w-4 h-4" />
        <span className="hidden sm:inline">{t('batch_actions.move_to')}</span>
      </button>

      {isOpen && createPortal(
        <div
          ref={popoverRef}
          className={cn(
            "fixed z-50 w-[260px] bg-background rounded-lg shadow-lg border border-border",
            "animate-in fade-in-0 zoom-in-95 duration-100"
          )}
          style={getPopoverPosition()}
          onKeyDown={handleKeyDown}
        >
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('move_to.search_placeholder')}
                className={cn(
                  "w-full pl-8 pr-3 py-1.5 text-sm rounded-md",
                  "bg-muted/50 border border-border",
                  "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                  "placeholder:text-muted-foreground"
                )}
              />
            </div>
          </div>

          <div className="max-h-[280px] overflow-y-auto py-1">
            {allFiltered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {availableMailboxes.length === 0
                  ? t('move_to.no_other_folders')
                  : t('move_to.no_results')}
              </div>
            ) : (
              <>
                {filteredMailboxes.system.map((mailbox, index) => {
                  const Icon = getMailboxIcon(mailbox);
                  return (
                    <button
                      key={mailbox.id}
                      className={cn(
                        "w-full px-3 py-2 text-sm text-left flex items-center gap-2",
                        "transition-colors duration-100 cursor-pointer",
                        "hover:bg-muted focus:outline-none focus:bg-muted",
                        focusedIndex === index && "bg-muted",
                        mailbox.role === 'trash' && "text-red-600 dark:text-red-400",
                        mailbox.role === 'junk' && "text-amber-700 dark:text-amber-400"
                      )}
                      onClick={() => handleMove(mailbox.id)}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{highlightMatch(getMailboxDisplayName(mailbox.role, mailbox.name, tSidebar))}</span>
                    </button>
                  );
                })}

                {filteredMailboxes.custom.length > 0 && (
                  <>
                    {filteredMailboxes.system.length > 0 && (
                      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {t('move_to.custom_folders')}
                      </div>
                    )}
                    {filteredMailboxes.custom.map((mailbox, index) => {
                      const Icon = getMailboxIcon(mailbox);
                      const depth = getMailboxDepth(mailbox, mailboxes);
                      const flatIndex = filteredMailboxes.system.length + index;
                      return (
                        <button
                          key={mailbox.id}
                          className={cn(
                            "w-full py-2 text-sm text-left flex items-center gap-2",
                            "transition-colors duration-100 cursor-pointer",
                            "hover:bg-muted focus:outline-none focus:bg-muted",
                            focusedIndex === flatIndex && "bg-muted"
                          )}
                          style={{ paddingLeft: `${12 + depth * 12}px`, paddingRight: '12px' }}
                          onClick={() => handleMove(mailbox.id)}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span>{highlightMatch(mailbox.name)}</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
