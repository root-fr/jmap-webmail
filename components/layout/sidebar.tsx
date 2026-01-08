"use client";

import { useState, useEffect } from "react";
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
  Settings,
  ChevronUp,
  Users,
  User,
  X,
} from "lucide-react";
import { cn, buildMailboxTree, MailboxNode, formatFileSize } from "@/lib/utils";
import { Mailbox } from "@/lib/jmap/types";
import { useDragDropContext } from "@/contexts/drag-drop-context";
import { useMailboxDrop } from "@/hooks/use-mailbox-drop";

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

// Map role to icon
const getIconForMailbox = (role?: string, name?: string, hasChildren?: boolean, isExpanded?: boolean, isShared?: boolean, id?: string) => {
  const lowerName = name?.toLowerCase() || "";

  // Shared folders root node
  if (id === 'shared-folders-root') {
    return isExpanded ? FolderOpen : Users;
  }

  // Shared account nodes
  if (id?.startsWith('shared-account-')) {
    return isExpanded ? FolderOpen : User;
  }

  // Shared mailboxes (but not virtual nodes)
  if (isShared && hasChildren && !id?.startsWith('shared-')) {
    return isExpanded ? FolderOpen : Folder;
  }

  if (hasChildren) {
    // For folders with children, return open/closed folder icon
    return isExpanded ? FolderOpen : Folder;
  }

  if (role === "inbox" || lowerName.includes("inbox")) return Inbox;
  if (role === "sent" || lowerName.includes("sent")) return Send;
  if (role === "drafts" || lowerName.includes("draft")) return File;
  if (role === "trash" || lowerName.includes("trash")) return Trash2;
  if (role === "archive" || lowerName.includes("archive")) return Archive;
  if (lowerName.includes("star") || lowerName.includes("flag")) return Star;
  return Inbox; // Default icon
};

// Component for rendering a single mailbox node with its children
function MailboxTreeItem({
  node,
  selectedMailbox,
  expandedFolders,
  onMailboxSelect,
  onToggleExpand,
  isCollapsed,
}: {
  node: MailboxNode;
  selectedMailbox: string;
  expandedFolders: Set<string>;
  onMailboxSelect?: (id: string) => void;
  onToggleExpand: (id: string) => void;
  isCollapsed: boolean;
}) {
  const t = useTranslations('sidebar');
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedFolders.has(node.id);
  const Icon = getIconForMailbox(node.role, node.name, hasChildren, isExpanded, node.isShared, node.id);
  const indentPixels = node.depth * 16; // 16px per depth level
  const isVirtualNode = node.id.startsWith('shared-'); // Virtual nodes for shared folder organization

  // Drag and drop functionality
  const { isDragging: globalDragging } = useDragDropContext();
  const { dropHandlers, isValidDropTarget, isInvalidDropTarget } = useMailboxDrop({
    mailbox: node,
  });

  return (
    <>
      <div
        {...(globalDragging ? dropHandlers : {})}
        className={cn(
          "group w-full flex items-center px-2 py-1 lg:py-1 max-lg:py-3 max-lg:min-h-[44px] text-sm transition-all duration-200",
          selectedMailbox === node.id
            ? "bg-accent text-accent-foreground"
            : "hover:bg-muted text-foreground",
          node.depth === 0 && "font-medium",
          isValidDropTarget && "bg-primary/20 ring-2 ring-primary ring-inset",
          isInvalidDropTarget && "bg-destructive/10 ring-2 ring-destructive/30 ring-inset opacity-50"
        )}
      >
        {/* Expand/Collapse Chevron */}
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

        {/* Mailbox Button */}
        <button
          onClick={() => !isVirtualNode && onMailboxSelect?.(node.id)}
          disabled={isVirtualNode}
          className={cn(
            "flex-1 flex items-center text-left py-1 lg:py-1 max-lg:py-2 px-1 rounded",
            "transition-colors duration-150",
            isVirtualNode && "cursor-default"
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
            node.isShared && "text-blue-500" // Shared folders in blue
          )} />
          {!isCollapsed && (
            <>
              <span className="flex-1 truncate">{node.name}</span>
              {node.unreadEmails > 0 && (
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

      {/* Render children if expanded */}
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
              isCollapsed={isCollapsed}
            />
          ))}
        </div>
      )}
    </>
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
  const [showMenu, setShowMenu] = useState(false);
  const t = useTranslations('sidebar');

  // Sync local search query with store's active search query
  useEffect(() => {
    setSearchQuery(activeSearchQuery);
  }, [activeSearchQuery]);
  const router = useRouter();

  // Load expanded folders from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('expandedMailboxes');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setExpandedFolders(new Set(parsed));
      } catch (e) {
        console.error('Failed to parse expanded mailboxes:', e);
      }
    } else {
      // By default, expand root folders that have children
      const tree = buildMailboxTree(mailboxes);
      const defaultExpanded = tree
        .filter(node => node.children.length > 0)
        .map(node => node.id);
      setExpandedFolders(new Set(defaultExpanded));
    }
  }, [mailboxes]);

  // Save expanded folders to localStorage when changed
  const handleToggleExpand = (mailboxId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(mailboxId)) {
        next.delete(mailboxId);
      } else {
        next.add(mailboxId);
      }
      localStorage.setItem('expandedMailboxes', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() && onSearch) {
      onSearch(searchQuery);
    }
  };

  // Build hierarchical mailbox tree
  const mailboxTree = buildMailboxTree(mailboxes);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedMailbox || isCollapsed) return;

      // Find the selected node in the tree
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

      // Handle arrow keys for expand/collapse
      if (e.key === 'ArrowRight' && selectedNode.children.length > 0) {
        // Expand folder
        if (!expandedFolders.has(selectedMailbox)) {
          handleToggleExpand(selectedMailbox);
        }
      } else if (e.key === 'ArrowLeft' && selectedNode.children.length > 0) {
        // Collapse folder
        if (expandedFolders.has(selectedMailbox)) {
          handleToggleExpand(selectedMailbox);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMailbox, isCollapsed, expandedFolders, mailboxTree]);

  return (
    <div
      className={cn(
        "relative flex flex-col h-full border-r transition-all duration-300 overflow-hidden",
        "bg-secondary border-border",
        "max-lg:w-full",
        isCollapsed ? "lg:w-16" : "lg:w-64",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        {/* Mobile/Tablet: Close button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onSidebarClose}
          className="lg:hidden h-11 w-11 flex-shrink-0"
          aria-label={t("close")}
        >
          <X className="w-5 h-5" />
        </Button>

        {/* Desktop: Collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex"
        >
          <Menu className="w-5 h-5" />
        </Button>

        {!isCollapsed && (
          <Button onClick={onCompose} className="flex-1">
            <PenSquare className="w-4 h-4 mr-2" />
            {t("compose")}
          </Button>
        )}
      </div>

      {/* Search */}
      {!isCollapsed && (
        <div className="px-4 py-3">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("search_placeholder")}
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
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>
        </div>
      )}

      {/* Mailbox List */}
      <div className="flex-1 overflow-y-auto">
        <div className="py-1">
          {mailboxes.length === 0 ? (
            <div className="px-4 py-2 text-sm text-muted-foreground">
              {!isCollapsed && t("loading_mailboxes")}
            </div>
          ) : (
            <>
              {/* Render hierarchical mailbox tree */}
              {mailboxTree.map((node) => (
                <MailboxTreeItem
                  key={node.id}
                  node={node}
                  selectedMailbox={selectedMailbox}
                  expandedFolders={expandedFolders}
                  onMailboxSelect={onMailboxSelect}
                  onToggleExpand={handleToggleExpand}
                  isCollapsed={isCollapsed}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      {!isCollapsed && (
        <>
          {/* Sliding Menu Panel */}
          <div className={cn(
            "absolute bottom-0 left-0 right-0 bg-background border-t border-border z-10 shadow-lg",
            "transform transition-all duration-300 ease-out",
            showMenu ? "-translate-y-12" : "translate-y-full"
          )}>
            <div className="py-2">
                {/* Storage Info */}
                {quota && quota.total > 0 && (
                  <div className="px-4 py-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t("storage")}</span>
                      <span className="text-foreground">
                        {formatFileSize(quota.used)} / {formatFileSize(quota.total)}
                      </span>
                    </div>
                    <div className="mt-1 w-full bg-muted rounded-full h-1">
                      <div
                        className="bg-primary h-1 rounded-full"
                        style={{ width: `${Math.min((quota.used / quota.total) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="border-t border-border mt-2 pt-2">
                  {/* Settings */}
                  <button
                    onClick={() => router.push('/settings')}
                    className="w-full px-4 py-2 flex items-center justify-between hover:bg-muted transition-colors text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      {t("settings")}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>

                  {/* Sign Out */}
                  {onLogout && (
                    <button
                      onClick={onLogout}
                      className="w-full px-4 py-2 flex items-center gap-2 hover:bg-muted transition-colors text-sm"
                    >
                      <LogOut className="w-4 h-4" />
                      {t("sign_out")}
                    </button>
                  )}
                </div>
            </div>
          </div>

          {/* Menu Toggle Button */}
          <div className="border-t border-border relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className={cn(
                "w-full px-4 py-3 flex items-center justify-between",
                "hover:bg-muted transition-colors",
                "text-sm text-foreground"
              )}
            >
              <span className="flex items-center gap-2">
                <Menu className="w-4 h-4" />
                Menu
                {/* Push Connection Status Indicator */}
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
                  {/* Tooltip on hover */}
                  <span className={cn(
                    "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1",
                    "bg-popover text-popover-foreground text-xs rounded shadow-lg",
                    "whitespace-nowrap opacity-0 group-hover:opacity-100",
                    "pointer-events-none transition-opacity duration-200 z-50"
                  )}>
                    {isPushConnected ? t("push_connected") : t("push_disconnected")}
                  </span>
                </span>
              </span>
              <ChevronUp className={cn(
                "w-4 h-4 transition-transform duration-200",
                showMenu ? "" : "rotate-180"
              )} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}