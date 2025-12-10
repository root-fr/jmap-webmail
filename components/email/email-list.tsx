"use client";

import { Email, ThreadGroup } from "@/lib/jmap/types";
import { ThreadListItem } from "./thread-list-item";
import { EmailContextMenu } from "./email-context-menu";
import { cn } from "@/lib/utils";
import { Inbox, CheckSquare, Square, Trash2, Mail, MailOpen, Loader2 } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useEmailStore } from "@/stores/email-store";
import { useAuthStore } from "@/stores/auth-store";
import { groupEmailsByThread, sortThreadGroups } from "@/lib/thread-utils";
import { useContextMenu } from "@/hooks/use-context-menu";

interface EmailListProps {
  emails: Email[];
  selectedEmailId?: string;
  onEmailSelect?: (email: Email) => void;
  className?: string;
  isLoading?: boolean;
  // Mobile conversation view handler
  onOpenConversation?: (thread: ThreadGroup) => void;
  // Context menu actions
  onReply?: (email: Email) => void;
  onReplyAll?: (email: Email) => void;
  onForward?: (email: Email) => void;
  onMarkAsRead?: (email: Email, read: boolean) => void;
  onToggleStar?: (email: Email) => void;
  onDelete?: (email: Email) => void;
  onArchive?: (email: Email) => void;
  onSetColorTag?: (emailId: string, color: string | null) => void;
  onMoveToMailbox?: (emailId: string, mailboxId: string) => void;
}

export function EmailList({
  emails,
  selectedEmailId,
  onEmailSelect,
  className,
  isLoading = false,
  onOpenConversation,
  onReply,
  onReplyAll,
  onForward,
  onMarkAsRead,
  onToggleStar,
  onDelete,
  onArchive,
  onSetColorTag,
  onMoveToMailbox,
}: EmailListProps) {
  const { client } = useAuthStore();
  const {
    selectedEmailIds,
    selectAllEmails,
    clearSelection,
    batchMarkAsRead,
    batchDelete,
    batchMoveToMailbox,
    loadMoreEmails,
    hasMoreEmails,
    isLoadingMore,
    mailboxes,
    selectedMailbox,
    expandedThreadIds,
    threadEmailsCache,
    isLoadingThread,
    toggleThreadExpansion,
    fetchThreadEmails,
  } = useEmailStore();

  // Group emails by thread
  const threadGroups = useMemo(() => {
    const groups = groupEmailsByThread(emails);
    return sortThreadGroups(groups);
  }, [emails]);

  // Context menu state
  const { contextMenu, openContextMenu, closeContextMenu, menuRef } = useContextMenu<Email>();

  const [isProcessing, setIsProcessing] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  // Loading skeleton component - gentler, no pulsing
  const LoadingSkeleton = () => (
    <div className="animate-in fade-in duration-200">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="border-b border-border px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-muted/50 rounded-full" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <div className="h-4 bg-muted/50 rounded w-32" />
                <div className="h-3 bg-muted/50 rounded w-16" />
              </div>
              <div className="h-4 bg-muted/50 rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted/50 rounded w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const hasSelection = selectedEmailIds.size > 0;
  const allSelected = emails.length > 0 && emails.every(e => selectedEmailIds.has(e.id));

  const handleBatchMarkAsRead = async (read: boolean) => {
    if (!client || isProcessing) return;
    setIsProcessing(true);
    try {
      await batchMarkAsRead(client, read);
    } finally {
      setTimeout(() => setIsProcessing(false), 500); // Small delay for visual feedback
    }
  };

  const handleBatchDelete = async () => {
    if (!client || isProcessing || !confirm(`Delete ${selectedEmailIds.size} emails?`)) return;
    setIsProcessing(true);
    try {
      await batchDelete(client);
    } finally {
      setTimeout(() => setIsProcessing(false), 500);
    }
  };

  // Intersection observer for infinite scroll
  const handleLoadMore = useCallback(() => {
    if (client && hasMoreEmails && !isLoadingMore && !isLoading) {
      loadMoreEmails(client);
    }
  }, [client, hasMoreEmails, isLoadingMore, isLoading, loadMoreEmails]);

  // Handle thread expansion and fetch complete thread
  const handleToggleThreadExpansion = useCallback(async (threadId: string) => {
    const isExpanded = expandedThreadIds.has(threadId);

    if (!isExpanded && client) {
      // Expanding - fetch complete thread emails
      toggleThreadExpansion(threadId);
      await fetchThreadEmails(client, threadId);
    } else {
      // Collapsing - just toggle
      toggleThreadExpansion(threadId);
    }
  }, [client, expandedThreadIds, toggleThreadExpansion, fetchThreadEmails]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [handleLoadMore]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Batch Actions Toolbar with smooth transition */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out overflow-hidden",
          hasSelection ? "max-h-16 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-4 py-2 border-b bg-accent/30 border-border flex items-center justify-between">
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-3 duration-300">
            <span className="text-sm font-medium text-foreground">
              {selectedEmailIds.size} {selectedEmailIds.size === 1 ? 'email' : 'emails'} selected
            </span>
          </div>
          <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-3 duration-300">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleBatchMarkAsRead(true)}
              title="Mark as read"
              disabled={isProcessing}
              className="hover:bg-accent transition-colors disabled:opacity-50"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MailOpen className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleBatchMarkAsRead(false)}
              title="Mark as unread"
              disabled={isProcessing}
              className="hover:bg-accent transition-colors disabled:opacity-50"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBatchDelete}
              title="Delete"
              disabled={isProcessing}
              className="text-red-600 dark:text-red-400 hover:bg-red-100/50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              title="Clear selection"
              disabled={isProcessing}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>

      {/* List Header */}
      <div className="px-4 py-3 border-b bg-muted/50 border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => allSelected ? clearSelection() : selectAllEmails()}
            className={cn(
              "p-1 rounded transition-all duration-200",
              "hover:bg-muted hover:scale-110",
              "active:scale-95",
              allSelected && "text-primary"
            )}
            title={allSelected ? "Deselect all" : "Select all"}
          >
            {allSelected ? (
              <CheckSquare className="w-4 h-4 animate-in zoom-in-50 duration-200" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </button>
          <h2 className="text-sm font-medium text-foreground">
            {isLoading ? 'Loading...' : threadGroups.length > 0 ? `${threadGroups.length} conversations` : 'No conversations'}
          </h2>
        </div>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-y-auto bg-background relative">
        {/* Loading overlay - shows on top of existing emails */}
        {isLoading && emails.length > 0 && (
          <div className="absolute inset-0 bg-background/50 z-10 flex items-center justify-center animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/90 px-4 py-2 rounded-full shadow-sm border border-border">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading...</span>
            </div>
          </div>
        )}

        {/* Show skeleton only on initial load (no emails yet) */}
        {isLoading && emails.length === 0 ? (
          <LoadingSkeleton />
        ) : emails.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full py-12">
            <Inbox className="w-16 h-16 mb-4 text-muted-foreground/50" />
            <p className="text-base font-medium text-foreground">No emails in this mailbox</p>
            <p className="text-sm mt-1 text-muted-foreground">New messages will appear here</p>
          </div>
        ) : (
          <div className={cn("transition-opacity duration-200", isLoading && "opacity-50")}>
            {threadGroups.map((thread) => (
              <ThreadListItem
                key={thread.threadId}
                thread={thread}
                isExpanded={expandedThreadIds.has(thread.threadId)}
                selectedEmailId={selectedEmailId}
                isLoading={isLoadingThread === thread.threadId}
                expandedEmails={threadEmailsCache.get(thread.threadId)}
                onToggleExpand={() => handleToggleThreadExpansion(thread.threadId)}
                onEmailSelect={(email) => onEmailSelect?.(email)}
                onContextMenu={openContextMenu}
                onOpenConversation={onOpenConversation}
              />
            ))}

            {/* Intersection observer target for infinite scroll - always present */}
            <div ref={observerTarget} className="py-4 flex justify-center">
              {isLoadingMore && hasMoreEmails && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading more emails...</span>
                </div>
              )}
              {!hasMoreEmails && emails.length > 0 && (
                <div className="text-sm text-muted-foreground border-t border-border pt-6">
                  No more emails to load
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.data && (
        <EmailContextMenu
          email={contextMenu.data}
          position={contextMenu.position}
          isOpen={contextMenu.isOpen}
          onClose={closeContextMenu}
          menuRef={menuRef}
          mailboxes={mailboxes}
          selectedMailbox={selectedMailbox}
          isMultiSelect={selectedEmailIds.has(contextMenu.data.id)}
          selectedCount={selectedEmailIds.size}
          // Single email actions
          onReply={() => onReply?.(contextMenu.data!)}
          onReplyAll={() => onReplyAll?.(contextMenu.data!)}
          onForward={() => onForward?.(contextMenu.data!)}
          onMarkAsRead={(read) => onMarkAsRead?.(contextMenu.data!, read)}
          onToggleStar={() => onToggleStar?.(contextMenu.data!)}
          onDelete={() => onDelete?.(contextMenu.data!)}
          onArchive={() => onArchive?.(contextMenu.data!)}
          onSetColorTag={(color) => onSetColorTag?.(contextMenu.data!.id, color)}
          onMoveToMailbox={(mailboxId) => onMoveToMailbox?.(contextMenu.data!.id, mailboxId)}
          // Batch actions
          onBatchMarkAsRead={(read) => client && batchMarkAsRead(client, read)}
          onBatchDelete={() => client && batchDelete(client)}
          onBatchMoveToMailbox={(mailboxId) => client && batchMoveToMailbox(client, mailboxId)}
        />
      )}
    </div>
  );
}