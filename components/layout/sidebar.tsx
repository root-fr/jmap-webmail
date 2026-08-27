"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Inbox,
  Send,
  File,
  Star,
  Trash2,
  Archive,
  PenSquare,
  Search,
  Menu,
  LogOut,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Users,
  User,
  Palmtree,
  SlidersHorizontal,
  Settings,
  X,
  Tag,
  Plus,
  FolderPlus,
  Edit3,
  FolderInput,
  Mails,
} from "lucide-react";
import { cn, buildMailboxTree, flattenMailboxTree, MailboxNode, formatFileSize } from "@/lib/utils";
import { Mailbox } from "@/lib/jmap/types";
import { useDragDropContext } from "@/contexts/drag-drop-context";
import { useMailboxDrop } from "@/hooks/use-mailbox-drop";
import { useEmailStore } from "@/stores/email-store";
import { useAuthStore } from "@/stores/auth-store";
import { activeFilterCount, UNIFIED_INBOX_ID } from "@/lib/jmap/search-utils";
import { useSettingsStore } from "@/stores/settings-store";
import { useVacationStore } from "@/stores/vacation-store";
import { useResizeHandle } from "@/hooks/use-resize-handle";
import { toast } from "@/stores/toast-store";
import { debug } from "@/lib/debug";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface SidebarProps {
  mailboxes: Mailbox[];
  selectedMailbox?: string;
  onMailboxSelect?: (mailboxId: string) => void;
  onCompose?: () => void;
  onLogout?: () => void;
  onSidebarClose?: () => void;
  onSearch?: (query: string) => void;
  onClearSearch?: () => void;
  activeSearchQuery?: string;
  quota?: { used: number; total: number } | null;
  isPushConnected?: boolean;
  className?: string;
}

const getIconForMailbox = (role?: string, name?: string, hasChildren?: boolean, isExpanded?: boolean, isShared?: boolean, id?: string) => {
  const lowerName = name?.toLowerCase() || "";

  if (id === UNIFIED_INBOX_ID) {
    return Mails;
  }

  if (id === 'shared-folders-root') {
    return isExpanded ? FolderOpen : Users;
  }

  if (id?.startsWith('shared-account-')) {
    return isExpanded ? FolderOpen : User;
  }

  if (isShared && hasChildren && !id?.startsWith('shared-')) {
    return isExpanded ? FolderOpen : Folder;
  }

  if (hasChildren) {
    return isExpanded ? FolderOpen : Folder;
  }

  if (role === "inbox" || lowerName.includes("inbox")) return Inbox;
  if (role === "sent" || lowerName.includes("sent")) return Send;
  if (role === "drafts" || lowerName.includes("draft")) return File;
  if (role === "trash" || lowerName.includes("trash")) return Trash2;
  if (role === "archive" || lowerName.includes("archive")) return Archive;
  if (lowerName.includes("star") || lowerName.includes("flag")) return Star;
  return Inbox;
};

function InlineInput({
  defaultValue = "",
  placeholder,
  hintText,
  borderColor = "border-green-500",
  onSubmit,
  onCancel,
  depth = 0,
}: {
  defaultValue?: string;
  placeholder?: string;
  hintText: string;
  borderColor?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  depth?: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelledRef.current = true;
      onCancel();
    }
  };

  return (
    <div style={{ paddingLeft: `${depth * 16 + 24}px` }} className="px-2 py-1">
      <div className="flex items-center gap-1">
        <Folder className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (!cancelledRef.current) onCancel(); }}
          placeholder={placeholder}
          maxLength={200}
          className={cn(
            "flex-1 bg-background text-foreground text-sm px-1.5 py-0.5 rounded border-2 outline-none",
            borderColor
          )}
        />
        <button
          onMouseDown={(e) => { e.preventDefault(); onSubmit(value); }}
          className="text-green-500 hover:text-green-400 p-0.5"
          aria-label="Confirm"
        >
          <span className="text-sm">&#10003;</span>
        </button>
        <button
          onMouseDown={(e) => { e.preventDefault(); onCancel(); }}
          className="text-red-500 hover:text-red-400 p-0.5"
          aria-label="Cancel"
        >
          <span className="text-sm">&#10005;</span>
        </button>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5 ml-6">{hintText}</div>
    </div>
  );
}

function RenameInput({ defaultValue, onSubmit, onCancel }: {
  defaultValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const cancelledRef = useRef(false);
  return (
    <input
      autoFocus
      type="text"
      defaultValue={defaultValue}
      maxLength={200}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSubmit((e.target as HTMLInputElement).value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelledRef.current = true;
          onCancel();
        }
      }}
      onBlur={(e) => {
        if (!cancelledRef.current) onSubmit(e.target.value);
      }}
      onClick={(e) => e.stopPropagation()}
      className="flex-1 bg-background text-foreground text-sm px-1.5 py-0.5 rounded border-2 border-primary outline-none min-w-0"
    />
  );
}

function MailboxTreeItem({
  node,
  selectedMailbox,
  expandedFolders,
  onMailboxSelect,
  onToggleExpand,
  onMailboxContextMenu,
  isCollapsed,
  renamingMailboxId,
  onRenameSubmit,
  onRenameCancel,
  onStartRename,
  creatingSubfolder,
  onCreateSubmit,
  onCreateCancel,
}: {
  node: MailboxNode;
  selectedMailbox: string;
  expandedFolders: Set<string>;
  onMailboxSelect?: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onMailboxContextMenu?: (e: React.MouseEvent, mailbox: Mailbox) => void;
  isCollapsed: boolean;
  renamingMailboxId: string | null;
  onRenameSubmit: (value: string) => void;
  onRenameCancel: () => void;
  onStartRename: (id: string) => void;
  creatingSubfolder: { parentId: string } | null;
  onCreateSubmit: (value: string) => void;
  onCreateCancel: () => void;
}) {
  const t = useTranslations('sidebar');
  const tFolder = useTranslations('sidebar.folder_management');
  const tNotifications = useTranslations('notifications');
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedFolders.has(node.id);
  const Icon = getIconForMailbox(node.role, node.name, hasChildren, isExpanded, node.isShared, node.id);
  const indentPixels = node.depth * 16;
  const isVirtualNode = node.id.startsWith('shared-');
  const isRenaming = renamingMailboxId === node.id;
  const isCreatingChild = creatingSubfolder?.parentId === node.id;

  const { isDragging: globalDragging, startMailboxDrag, endDrag: globalEndDrag, dragType, draggedMailboxId } = useDragDropContext();
  const { dropHandlers, isValidDropTarget, isInvalidDropTarget } = useMailboxDrop({
    mailbox: node,
    onSuccess: (count, mailboxName) => {
      if (count === 1) {
        toast.success(
          tNotifications('email_moved'),
          tNotifications('moved_to_mailbox', { mailbox: mailboxName })
        );
      } else {
        toast.success(
          tNotifications('emails_moved', { count }),
          tNotifications('moved_to_mailbox', { mailbox: mailboxName })
        );
      }
    },
    onError: () => {
      toast.error(tNotifications('move_failed'), tNotifications('move_error'));
    },
  });

  const canDrag = !isVirtualNode && !node.isShared && !node.id.startsWith('shared-') &&
    !node.id.startsWith('temp-') && node.myRights?.mayRename;

  const handleFolderDragStart = useCallback((e: React.DragEvent) => {
    if (!canDrag) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-mailbox-id", node.id);
    e.dataTransfer.setData("text/plain", node.name);

    const preview = document.createElement("div");
    preview.style.cssText = `
      position: fixed; top: -9999px; left: 0; padding: 6px 12px;
      background-color: var(--color-primary, #3b82f6); color: white;
      border-radius: 6px; font-size: 13px; font-weight: 500; white-space: nowrap;
    `;
    preview.textContent = node.name;
    document.body.appendChild(preview);
    e.dataTransfer.setDragImage(preview, 0, 0);
    requestAnimationFrame(() => preview.remove());

    startMailboxDrag(node.id);
  }, [canDrag, node.id, node.name, startMailboxDrag]);

  const handleFolderDragEnd = useCallback(() => {
    globalEndDrag();
  }, [globalEndDrag]);

  return (
    <>
      <div
        {...(globalDragging ? dropHandlers : {})}
        onContextMenu={(e) => onMailboxContextMenu?.(e, node)}
        draggable={canDrag}
        onDragStart={handleFolderDragStart}
        onDragEnd={handleFolderDragEnd}
        className={cn(
          "group w-full flex items-center px-2 py-1 lg:py-1 max-lg:py-3 max-lg:min-h-[44px] text-sm transition-all duration-200",
          isVirtualNode
            ? "text-muted-foreground"
            : selectedMailbox === node.id
              ? "bg-accent text-accent-foreground"
              : "hover:bg-muted text-foreground",
          node.depth === 0 && !isVirtualNode && "font-medium",
          isValidDropTarget && "bg-primary/20 ring-2 ring-primary ring-inset",
          isInvalidDropTarget && "bg-destructive/10 ring-2 ring-destructive/30 ring-inset opacity-50",
          globalDragging && dragType === 'mailbox' && draggedMailboxId === node.id && "opacity-40"
        )}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
            className={cn(
              "p-0.5 rounded mr-1 transition-all duration-200",
              "hover:bg-muted active:bg-accent"
            )}
            style={{ marginLeft: indentPixels }}
            title={isExpanded ? t('collapse_tooltip') : t('expand_tooltip')}
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        )}

        <button
          onClick={() => !isVirtualNode && !node.id.startsWith('temp-') && onMailboxSelect?.(node.id)}
          disabled={isVirtualNode || node.id.startsWith('temp-')}
          className={cn(
            "flex-1 flex items-center text-left py-1 lg:py-1 max-lg:py-2 px-1 rounded",
            "transition-colors duration-150",
            isVirtualNode && "cursor-default select-none"
          )}
          style={{
            paddingLeft: hasChildren ? '4px' : `${indentPixels + 24}px`
          }}
          title={isCollapsed ? node.name : undefined}
        >
          <Icon className={cn(
            "w-4 h-4 mr-2 flex-shrink-0 transition-colors",
            hasChildren && isExpanded && "text-primary",
            selectedMailbox === node.id && "text-accent-foreground",
            !hasChildren && node.depth > 0 && "text-muted-foreground",
            node.isShared && "text-blue-500"
          )} />
          {!isCollapsed && (
            <>
              {isRenaming ? (
                <RenameInput
                  defaultValue={node.name}
                  onSubmit={onRenameSubmit}
                  onCancel={onRenameCancel}
                />
              ) : (
                <span
                  className="flex-1 truncate"
                  onDoubleClick={(e) => {
                    if (!node.role && !node.isShared && !isVirtualNode && node.id !== UNIFIED_INBOX_ID) {
                      e.stopPropagation();
                      onStartRename(node.id);
                    }
                  }}
                >
                  {node.name}
                </span>
              )}
              {!isRenaming && node.unreadEmails > 0 && (
                <span className={cn(
                  "text-xs rounded-full px-2 py-0.5 ml-2 font-medium",
                  selectedMailbox === node.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-foreground text-background"
                )}>
                  {node.unreadEmails}
                </span>
              )}
            </>
          )}
        </button>
      </div>

      {hasChildren && isExpanded && !isCollapsed && (
        <div className="relative">
          {node.children.map((child) => (
            <MailboxTreeItem
              key={child.id}
              node={child}
              selectedMailbox={selectedMailbox}
              expandedFolders={expandedFolders}
              onMailboxSelect={onMailboxSelect}
              onToggleExpand={onToggleExpand}
              onMailboxContextMenu={onMailboxContextMenu}
              isCollapsed={isCollapsed}
              renamingMailboxId={renamingMailboxId}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              onStartRename={onStartRename}
              creatingSubfolder={creatingSubfolder}
              onCreateSubmit={onCreateSubmit}
              onCreateCancel={onCreateCancel}
            />
          ))}
          {isCreatingChild && (
            <InlineInput
              placeholder={tFolder('folder_name_placeholder')}
              hintText={tFolder('enter_to_create')}
              onSubmit={onCreateSubmit}
              onCancel={onCreateCancel}
              depth={node.depth + 1}
            />
          )}
        </div>
      )}

      {!hasChildren && isCreatingChild && !isCollapsed && (
        <InlineInput
          placeholder={tFolder('folder_name_placeholder')}
          hintText={tFolder('enter_to_create')}
          onSubmit={onCreateSubmit}
          onCancel={onCreateCancel}
          depth={node.depth + 1}
        />
      )}
    </>
  );
}

function VacationBanner() {
  const t = useTranslations('sidebar');
  const router = useRouter();
  const { isEnabled, isSupported } = useVacationStore();

  if (!isSupported || !isEnabled) return null;

  return (
    <button
      onClick={() => router.push('/settings')}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-2 text-xs",
        "bg-amber-500/10 dark:bg-amber-400/10 text-amber-700 dark:text-amber-400",
        "hover:bg-amber-500/15 dark:hover:bg-amber-400/15 transition-colors"
      )}
    >
      <Palmtree className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="truncate font-medium">{t("vacation_active")}</span>
      <Settings className="w-3 h-3 ml-auto flex-shrink-0 opacity-60" />
    </button>
  );
}

function AdvancedSearchToggle() {
  const tSearch = useTranslations("advanced_search");
  const { searchFilters, isAdvancedSearchOpen, toggleAdvancedSearch } = useEmailStore();
  const filterCount = activeFilterCount(searchFilters);

  return (
    <button
      type="button"
      onClick={toggleAdvancedSearch}
      className={cn(
        "relative flex-shrink-0 p-2 rounded-md transition-colors",
        isAdvancedSearchOpen || filterCount > 0
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
      title={tSearch("toggle_filters")}
    >
      <SlidersHorizontal className="w-4 h-4" />
      {filterCount > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-primary text-primary-foreground">
          {filterCount}
        </span>
      )}
    </button>
  );
}

const tagDotColors: Record<string, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
};

function TagsSection({
  isCollapsed,
  onSearch,
}: {
  isCollapsed: boolean;
  onSearch?: (query: string) => void;
}) {
  const t = useTranslations("sidebar");
  const { tagCounts } = useEmailStore();
  const [expanded, setExpanded] = useState(true);

  const tags = Object.entries(tagCounts);
  if (tags.length === 0 || isCollapsed) return null;

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center w-full px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted transition-colors"
      >
        <Tag className="w-3 h-3 mr-2" />
        <span className="flex-1 text-left">{t("tags.title")}</span>
        {expanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
      </button>
      {expanded && (
        <div className="py-1">
          {tags.map(([color, count]) => (
            <button
              key={color}
              onClick={() => onSearch?.(`keyword:$color:${color}`)}
              className="flex items-center w-full px-4 py-1.5 text-sm hover:bg-muted transition-colors text-foreground"
            >
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-full mr-2.5 flex-shrink-0",
                  tagDotColors[color] || "bg-gray-500"
                )}
              />
              <span className="flex-1 text-left capitalize">{color}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {count}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyFolderConfirmDialog({
  mailbox,
  onConfirm,
  onCancel,
}: {
  mailbox: { name: string; totalEmails: number };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("sidebar");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <div className="relative bg-background rounded-lg shadow-xl p-6 max-w-sm mx-4 border border-border">
        <h3 className="text-lg font-semibold mb-2">{t("empty_folder.title")}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t("empty_folder.confirm", {
            count: mailbox.totalEmails,
            folder: mailbox.name,
          })}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            {t("empty_folder.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            {t("empty_folder.title")}
          </button>
        </div>
      </div>
    </div>
  );
}

function StorageQuota({ quota, isCollapsed }: { quota: { used: number; total: number } | null; isCollapsed: boolean }) {
  const t = useTranslations('sidebar');

  if (!quota || quota.total <= 0) return null;

  const usagePercent = Math.min((quota.used / quota.total) * 100, 100);
  const barColor = usagePercent > 90
    ? "bg-red-500 dark:bg-red-400"
    : usagePercent > 70
      ? "bg-amber-500 dark:bg-amber-400"
      : "bg-green-500 dark:bg-green-400";

  if (isCollapsed) {
    return (
      <div className="px-2 py-2" title={`${formatFileSize(quota.used)} / ${formatFileSize(quota.total)}`}>
        <div className="w-full bg-muted rounded-full h-1">
          <div className={cn(barColor, "h-1 rounded-full transition-all")} style={{ width: `${usagePercent}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{t("storage")}</span>
        <span className="text-foreground tabular-nums">
          {formatFileSize(quota.used)} / {formatFileSize(quota.total)}
        </span>
      </div>
      <div className="mt-1 w-full bg-muted rounded-full h-1">
        <div className={cn(barColor, "h-1 rounded-full transition-all")} style={{ width: `${usagePercent}%` }} />
      </div>
    </div>
  );
}

function MoveToSubmenu({
  mailbox,
  allMailboxes,
  onMove,
}: {
  mailbox: Mailbox;
  allMailboxes: Mailbox[];
  onMove: (targetId: string | null) => void;
  onClose: () => void;
}) {
  const tFolder = useTranslations('sidebar.folder_management');
  const [showSubmenu, setShowSubmenu] = useState(false);

  const isDescendant = (parentId: string, checkId: string): boolean => {
    const children = allMailboxes.filter(mb => mb.parentId === parentId);
    return children.some(c => c.id === checkId || isDescendant(c.id, checkId));
  };

  const tree = buildMailboxTree(allMailboxes);
  const flatTree = flattenMailboxTree(tree);
  const validTargets = flatTree.filter(mb => {
    if (mb.id === mailbox.id) return false;
    if (mb.isShared || mb.id.startsWith('shared-')) return false;
    if (!mb.myRights?.mayCreateChild) return false;
    if (isDescendant(mailbox.id, mb.id)) return false;
    return true;
  });

  const canMoveToRoot = !!mailbox.parentId;

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowSubmenu(true)}
      onMouseLeave={() => setShowSubmenu(false)}
    >
      <div className="flex items-center w-full px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer">
        <FolderInput className="w-4 h-4 mr-2" />
        {tFolder("move_to")}
        <ChevronRight className="w-3 h-3 ml-auto" />
      </div>

      {showSubmenu && (
        <div className="absolute left-full top-0 bg-background border border-border rounded-md shadow-lg py-1 min-w-[180px] max-h-[300px] overflow-y-auto z-50">
          {canMoveToRoot && (
            <>
              <button
                onClick={() => onMove(null)}
                className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-muted transition-colors font-medium"
              >
                <Folder className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-muted-foreground" />
                {tFolder("move_to_top_level")}
              </button>
              <div className="h-px bg-border mx-2 my-1" />
            </>
          )}
          {validTargets.length === 0 && !canMoveToRoot ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {tFolder("no_available_targets")}
            </div>
          ) : (
            validTargets.map((target) => (
              <button
                key={target.id}
                onClick={() => onMove(target.id)}
                className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                style={{ paddingLeft: `${12 + target.depth * 12}px` }}
              >
                <Folder className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-muted-foreground" />
                <span className="truncate">{target.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  mailboxes = [],
  selectedMailbox = "",
  onMailboxSelect,
  onCompose,
  onLogout,
  onSidebarClose,
  onSearch,
  onClearSearch,
  activeSearchQuery = "",
  quota,
  isPushConnected = false,
  className,
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; mailbox: Mailbox } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [emptyFolderTarget, setEmptyFolderTarget] = useState<Mailbox | null>(null);
  const [renamingMailboxId, setRenamingMailboxId] = useState<string | null>(null);
  const [creatingSubfolder, setCreatingSubfolder] = useState<{ parentId: string } | null>(null);
  const [creatingTopLevel, setCreatingTopLevel] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<Mailbox | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const t = useTranslations('sidebar');
  const tFolder = useTranslations('sidebar.folder_management');
  const { dragType, endDrag: globalEndDrag } = useDragDropContext();
  const { client } = useAuthStore();
  const { emptyFolder, createMailbox, renameMailbox, moveMailbox, deleteMailbox } = useEmailStore();
  const { sidebarWidth, updateSetting, showUnifiedInbox, unifiedInboxExcludedAccounts } = useSettingsStore();

  const handleSidebarResize = useCallback((width: number) => {
    document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
  }, []);

  const handleSidebarResizeEnd = useCallback((width: number) => {
    updateSetting('sidebarWidth', width);
  }, [updateSetting]);

  const resizeHandle = useResizeHandle({
    min: 180,
    max: 400,
    initial: sidebarWidth,
    onResize: handleSidebarResize,
    onResizeEnd: handleSidebarResizeEnd,
  });

  useEffect(() => {
    setSearchQuery(activeSearchQuery);
  }, [activeSearchQuery]);

  useEffect(() => {
    const stored = localStorage.getItem('expandedMailboxes');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setExpandedFolders(new Set(parsed));
      } catch (e) {
        debug.error('Failed to parse expanded mailboxes:', e);
      }
    } else {
      const tree = buildMailboxTree(mailboxes);
      const defaultExpanded = tree
        .filter(node => node.children.length > 0)
        .map(node => node.id);
      setExpandedFolders(new Set(defaultExpanded));
    }
  }, [mailboxes]);

  const handleToggleExpand = (mailboxId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(mailboxId)) {
        next.delete(mailboxId);
      } else {
        next.add(mailboxId);
      }
      try {
        localStorage.setItem('expandedMailboxes', JSON.stringify(Array.from(next)));
      } catch { /* storage full or unavailable */ }
      return next;
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() && onSearch) {
      onSearch(searchQuery);
    }
  };

  const handleMailboxContextMenu = useCallback((e: React.MouseEvent, mailbox: Mailbox) => {
    if (mailbox.id === UNIFIED_INBOX_ID || mailbox.isShared || mailbox.id.startsWith('shared-')) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, mailbox });
  }, []);

  const handleCreateFolder = useCallback(async (name: string, parentId?: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(tFolder('folder_name_empty_error'));
      return;
    }
    if (trimmed.includes('/')) {
      toast.error(tFolder('folder_name_slash_error'));
      return;
    }
    if (!client) return;
    setCreatingSubfolder(null);
    setCreatingTopLevel(false);
    try {
      await createMailbox(client, trimmed, parentId);
      toast.success(tFolder('folder_created', { name: trimmed }));
      if (parentId) {
        setExpandedFolders(prev => {
          const next = new Set(prev);
          next.add(parentId);
          return next;
        });
      }
    } catch {
      toast.error(tFolder('create_error'));
    }
  }, [client, createMailbox, tFolder]);

  const handleRenameFolder = useCallback(async (newName: string) => {
    const trimmed = newName.trim();
    if (!renamingMailboxId || !client) {
      setRenamingMailboxId(null);
      return;
    }
    const mailbox = mailboxes.find(mb => mb.id === renamingMailboxId);
    if (!trimmed || trimmed === mailbox?.name) {
      setRenamingMailboxId(null);
      return;
    }
    if (trimmed.includes('/')) {
      toast.error(tFolder('folder_name_slash_error'));
      setRenamingMailboxId(null);
      return;
    }
    const targetId = renamingMailboxId;
    setRenamingMailboxId(null);
    try {
      await renameMailbox(client, targetId, trimmed);
      toast.success(tFolder('folder_renamed', { name: trimmed }));
    } catch {
      toast.error(tFolder('rename_error'));
    }
  }, [renamingMailboxId, client, mailboxes, renameMailbox, tFolder]);

  const handleDeleteFolder = useCallback(async () => {
    if (!deleteFolderTarget || !client) return;
    const folderName = deleteFolderTarget.name;
    const targetId = deleteFolderTarget.id;
    setDeleteFolderTarget(null);
    try {
      await deleteMailbox(client, targetId);
      toast.success(tFolder('folder_deleted', { name: folderName }));
    } catch {
      toast.error(tFolder('delete_error'));
    }
  }, [deleteFolderTarget, client, deleteMailbox, tFolder]);

  const handleEmptyFolder = useCallback(async () => {
    if (!emptyFolderTarget || !client) return;
    const folderName = emptyFolderTarget.name;
    const totalCount = emptyFolderTarget.totalEmails || 0;
    const targetId = emptyFolderTarget.id;
    setEmptyFolderTarget(null);

    toast.info(t("empty_folder.title"), t("empty_folder.progress", { deleted: 0, total: totalCount }));

    try {
      await emptyFolder(client, targetId);
      toast.success(t("empty_folder.title"), t("empty_folder.success"));
    } catch (error) {
      const match = error instanceof Error && error.message.match(/Deleted (\d+) of (\d+)/);
      const deleted = match ? parseInt(match[1], 10) : 0;
      toast.error(t("empty_folder.title"), t("empty_folder.error", { deleted, total: totalCount, folder: folderName }));
    }
  }, [emptyFolderTarget, client, emptyFolder, t]);

  const mailboxTree = buildMailboxTree(
    mailboxes,
    showUnifiedInbox
      ? { name: t("all_inboxes"), excludedAccountIds: unifiedInboxExcludedAccounts }
      : undefined
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedMailbox || isCollapsed) return;

      const findNode = (nodes: MailboxNode[]): MailboxNode | null => {
        for (const node of nodes) {
          if (node.id === selectedMailbox) return node;
          const found = findNode(node.children);
          if (found) return found;
        }
        return null;
      };

      const selectedNode = findNode(mailboxTree);
      if (!selectedNode) return;

      if (e.key === 'ArrowRight' && selectedNode.children.length > 0) {
        if (!expandedFolders.has(selectedMailbox)) {
          handleToggleExpand(selectedMailbox);
        }
      } else if (e.key === 'ArrowLeft' && selectedNode.children.length > 0) {
        if (expandedFolders.has(selectedMailbox)) {
          handleToggleExpand(selectedMailbox);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMailbox, isCollapsed, expandedFolders, mailboxTree]);

  useEffect(() => {
    const handleF2 = (e: KeyboardEvent) => {
      if (e.key !== 'F2' || !selectedMailbox) return;
      if (!sidebarRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      const mailbox = mailboxes.find(mb => mb.id === selectedMailbox);
      if (!mailbox || mailbox.role || mailbox.isShared || mailbox.id.startsWith('shared-')) return;
      e.preventDefault();
      setRenamingMailboxId(selectedMailbox);
    };

    window.addEventListener('keydown', handleF2);
    return () => window.removeEventListener('keydown', handleF2);
  }, [selectedMailbox, mailboxes]);

  return (
    <div
      ref={sidebarRef}
      className={cn(
        "relative flex flex-col h-full border-r transition-all duration-300 overflow-hidden",
        "bg-secondary border-border",
        "max-lg:w-full",
        isCollapsed && "lg:w-16",
        className
      )}
      style={!isCollapsed ? { width: `var(--sidebar-width, ${sidebarWidth}px)` } : undefined}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={onSidebarClose}
          className="lg:hidden h-11 w-11 flex-shrink-0"
          aria-label={t("close")}
        >
          <X className="w-5 h-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex"
        >
          <Menu className="w-5 h-5" />
        </Button>

        {!isCollapsed && (
          <>
            <Button onClick={onCompose} className="flex-1" title={t("compose_hint")}>
              <PenSquare className="w-4 h-4 mr-2" />
              {t("compose")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCreatingTopLevel(true)}
              title={tFolder("new_folder")}
              className="flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      {/* Vacation Banner */}
      {!isCollapsed && <VacationBanner />}

      {/* Search + Advanced Filter Toggle */}
      {!isCollapsed && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <form onSubmit={handleSearch} className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t("search_placeholder_hint")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn("pl-9", searchQuery && "pr-8")}
                data-search-input
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    onClearSearch?.();
                  }}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t('clear_search')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </form>
            <AdvancedSearchToggle />
          </div>
        </div>
      )}

      {/* Mailbox List */}
      <div
        className="flex-1 overflow-y-auto"
        onDragOver={(e) => {
          if (dragType === 'mailbox') {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={async (e) => {
          if (dragType !== 'mailbox') return;
          e.preventDefault();
          const mailboxId = e.dataTransfer.getData("application/x-mailbox-id");
          if (!mailboxId || !client) return;

          const mb = mailboxes.find(m => m.id === mailboxId);
          if (mb && mb.parentId) {
            try {
              await moveMailbox(client, mailboxId, null);
              toast.success(tFolder('folder_moved_to_root'));
            } catch {
              toast.error(tFolder('move_error'));
            }
          }
          globalEndDrag();
        }}
      >
        <div className="py-1">
          {mailboxes.length === 0 ? (
            <div className="px-4 py-2 text-sm text-muted-foreground">
              {!isCollapsed && t("loading_mailboxes")}
            </div>
          ) : (
            <>
              {mailboxTree.map((node) => (
                <MailboxTreeItem
                  key={node.id}
                  node={node}
                  selectedMailbox={selectedMailbox}
                  expandedFolders={expandedFolders}
                  onMailboxSelect={onMailboxSelect}
                  onToggleExpand={handleToggleExpand}
                  onMailboxContextMenu={handleMailboxContextMenu}
                  isCollapsed={isCollapsed}
                  renamingMailboxId={renamingMailboxId}
                  onRenameSubmit={handleRenameFolder}
                  onRenameCancel={() => setRenamingMailboxId(null)}
                  onStartRename={(id) => setRenamingMailboxId(id)}
                  creatingSubfolder={creatingSubfolder}
                  onCreateSubmit={(name) => handleCreateFolder(name, creatingSubfolder?.parentId)}
                  onCreateCancel={() => setCreatingSubfolder(null)}
                />
              ))}
              {creatingTopLevel && !isCollapsed && (
                <InlineInput
                  placeholder={tFolder('folder_name_placeholder')}
                  hintText={tFolder('enter_to_create')}
                  onSubmit={(name) => handleCreateFolder(name)}
                  onCancel={() => setCreatingTopLevel(false)}
                  depth={0}
                />
              )}
            </>
          )}
        </div>

        {/* Tags Section */}
        <TagsSection isCollapsed={isCollapsed} onSearch={onSearch} />
      </div>

      {/* Mailbox Context Menu (portal to escape sidebar overflow) */}
      {contextMenu && createPortal(
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          />
          <div
            ref={contextMenuRef}
            className="fixed z-50 bg-background border border-border rounded-md shadow-lg py-1 min-w-[160px]"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 220),
              top: Math.min(contextMenu.y, window.innerHeight - 300),
            }}
          >
            {/* New subfolder */}
            {contextMenu.mailbox.myRights?.mayCreateChild && (
              <button
                onClick={() => {
                  setCreatingSubfolder({ parentId: contextMenu.mailbox.id });
                  setExpandedFolders(prev => {
                    const next = new Set(prev);
                    next.add(contextMenu.mailbox.id);
                    return next;
                  });
                  setContextMenu(null);
                }}
                className="flex items-center w-full px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <FolderPlus className="w-4 h-4 mr-2" />
                {tFolder("new_subfolder")}
              </button>
            )}

            {/* Rename */}
            {!contextMenu.mailbox.role && (
              <button
                onClick={() => {
                  setRenamingMailboxId(contextMenu.mailbox.id);
                  setContextMenu(null);
                }}
                className="flex items-center w-full px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                {tFolder("rename")}
              </button>
            )}

            {/* Move to */}
            {!contextMenu.mailbox.role && (
              <MoveToSubmenu
                mailbox={contextMenu.mailbox}
                allMailboxes={mailboxes}
                onMove={async (targetId) => {
                  if (!client) return;
                  try {
                    if (targetId === null) {
                      await moveMailbox(client, contextMenu.mailbox.id, null);
                      toast.success(tFolder('folder_moved_to_root'));
                    } else {
                      const target = mailboxes.find(mb => mb.id === targetId);
                      await moveMailbox(client, contextMenu.mailbox.id, targetId);
                      toast.success(tFolder('folder_moved', { destination: target?.name || '' }));
                    }
                  } catch {
                    toast.error(tFolder('move_error'));
                  }
                  setContextMenu(null);
                }}
                onClose={() => setContextMenu(null)}
              />
            )}

            {/* Empty folder (trash/junk only) */}
            {(contextMenu.mailbox.role === "trash" || contextMenu.mailbox.role === "junk") &&
              contextMenu.mailbox.totalEmails && contextMenu.mailbox.totalEmails > 0 && (
              <button
                onClick={() => {
                  setEmptyFolderTarget(contextMenu.mailbox);
                  setContextMenu(null);
                }}
                className="flex items-center w-full px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t("empty_folder.title")}
              </button>
            )}

            {/* Delete folder */}
            {!contextMenu.mailbox.role && (
              <>
                <div className="h-px bg-border mx-2 my-1" />
                <button
                  onClick={() => {
                    setDeleteFolderTarget(contextMenu.mailbox);
                    setContextMenu(null);
                  }}
                  className="flex items-center w-full px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {tFolder("delete_folder")}
                </button>
              </>
            )}
          </div>
        </>,
        document.body
      )}

      {/* Empty Folder Confirmation Dialog */}
      {emptyFolderTarget && (
        <EmptyFolderConfirmDialog
          mailbox={{
            name: emptyFolderTarget.name,
            totalEmails: emptyFolderTarget.totalEmails || 0,
          }}
          onConfirm={handleEmptyFolder}
          onCancel={() => setEmptyFolderTarget(null)}
        />
      )}

      {/* Delete Folder Confirmation Dialog (portal to escape sidebar overflow) */}
      {deleteFolderTarget && createPortal((() => {
        const descendantCount = mailboxes.filter(mb => {
          const isDesc = (parentId: string, checkId: string): boolean => {
            if (parentId === checkId) return true;
            const children = mailboxes.filter(m => m.parentId === parentId);
            return children.some(c => isDesc(c.id, checkId));
          };
          return mb.id !== deleteFolderTarget.id && isDesc(deleteFolderTarget.id, mb.id);
        }).length;
        const emailCount = deleteFolderTarget.totalEmails || 0;
        const message = emailCount > 0 || descendantCount > 0
          ? tFolder('delete_confirm_with_contents', { emails: emailCount, subfolders: descendantCount })
          : tFolder('delete_confirm_empty');

        return (
          <ConfirmDialog
            isOpen={true}
            onClose={() => setDeleteFolderTarget(null)}
            onConfirm={handleDeleteFolder}
            title={tFolder('delete_confirm_title', { name: deleteFolderTarget.name })}
            message={message}
            confirmText={tFolder('delete_folder')}
            variant="destructive"
          />
        );
      })(), document.body)}

      {/* Footer: Storage Quota + Sign Out + Push Status */}
      <div className="border-t border-border">
        <StorageQuota quota={quota ?? null} isCollapsed={isCollapsed} />

        <div className={cn(
          "flex items-center border-t border-border",
          isCollapsed ? "justify-center py-2" : "justify-between px-3 py-2"
        )}>
          {onLogout && (
            <button
              onClick={onLogout}
              className={cn(
                "flex items-center gap-2 rounded-md transition-colors text-sm text-muted-foreground hover:text-foreground hover:bg-muted",
                isCollapsed ? "p-2" : "px-2 py-1.5"
              )}
              title={t("sign_out")}
            >
              <LogOut className="w-4 h-4" />
              {!isCollapsed && t("sign_out")}
            </button>
          )}

          {!isCollapsed && (
            <span
              className="relative group"
              title={isPushConnected ? t("push_connected") : t("push_disconnected")}
            >
              <span
                className={cn(
                  "inline-block w-1.5 h-1.5 rounded-full transition-all duration-300",
                  isPushConnected ? "bg-green-500" : "bg-muted-foreground/40"
                )}
              />
              <span className={cn(
                "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1",
                "bg-popover text-popover-foreground text-xs rounded shadow-lg",
                "whitespace-nowrap opacity-0 group-hover:opacity-100",
                "pointer-events-none transition-opacity duration-200 z-50"
              )}>
                {isPushConnected ? t("push_connected") : t("push_disconnected")}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Resize Handle */}
      {!isCollapsed && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hidden lg:block hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
          onMouseDown={resizeHandle.handleMouseDown}
          onTouchStart={resizeHandle.handleTouchStart}
          onKeyDown={resizeHandle.handleKeyDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={180}
          aria-valuemax={400}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
        />
      )}
    </div>
  );
}
