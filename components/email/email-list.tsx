"use client";

import { Email, ThreadGroup } from "@/lib/jmap/types";
import { ThreadListItem } from "./thread-list-item";
import { EmailContextMenu } from "./email-context-menu";
import { cn } from "@/lib/utils";
import { Inbox, Trash2, Mail, MailOpen, Loader2 } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useEmailStore } from "@/stores/email-store";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import { groupEmailsByThread, sortThreadGroups, accountScopedKey, emailRowKey } from "@/lib/thread-utils";
import type { RowKey } from "@/lib/thread-utils";
import { useContextMenu } from "@/hooks/use-context-menu";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SearchChips } from "@/components/search/search-chips";
import { SearchScopeChips } from "@/components/search/search-scope-chips";
import { isFilterEmpty, DEFAULT_SEARCH_FILTERS } from "@/lib/jmap/search-utils";
import { SelectionDropdown } from "./selection-dropdown";
import { MoveToPopover } from "./move-to-popover";
import { SortMenu } from "./sort-menu";
import { UnifiedFailureNotice } from "./unified-failure-notice";

interface EmailListProps {
  emails: Email[];
  selectedEmailId?: string;
  selectedEmailAccountId?: string;
  onEmailSelect?: (email: Email) => void;
  className?: string;
  isLoading?: boolean;
  onOpenConversation?: (thread: ThreadGroup) => void;
  onReply?: (email: Email) => void;
  onReplyAll?: (email: Email) => void;
  onForward?: (email: Email) => void;
  onMarkAsRead?: (email: Email, read: boolean) => void;
  onToggleStar?: (email: Email) => void;
  onDelete?: (email: Email) => void;
  onArchive?: (email: Email) => void;
  onSetColorTag?: (emailId: string, color: string | null, accountId?: string) => void;
  onMoveToMailbox?: (emailId: string, mailboxId: string, accountId?: string) => void;
  onMarkAsSpam?: (email: Email) => void;
  onUndoSpam?: (email: Email) => void;
}

export function EmailList({
  emails,
  selectedEmailId,
  selectedEmailAccountId,
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
  onMarkAsSpam,
  onUndoSpam,
  onMoveToMailbox,
}: EmailListProps) {
  const t = useTranslations('email_list');
  const { client } = useAuthStore();
  const {
    selectedEmailIds,
    toggleEmailSelection,
    selectAllEmails,
    clearSelection,
    selectRange,
    lastSelectedIndex,
    selectByFilter,
    batchMarkAsRead,
    batchDelete,
    batchMoveToMailbox,
    batchMarkAsSpam,
    batchUndoSpam,
    loadMoreEmails,
    hasMoreEmails,
    isLoadingMore,
    totalEmails,
    mailboxes,
    selectedMailbox,
    expandedThreadIds,
    threadEmailsCache,
    isLoadingThread,
    toggleThreadExpansion,
    fetchThreadEmails,
    searchQuery,
    searchFilters,
    setSearchFilters,
    clearSearchFilters,
    advancedSearch,
    currentQuery,
    setScope,
  } = useEmailStore();

  const [showRefreshOverlay, setShowRefreshOverlay] = useState(false);
  useEffect(() => {
    if (!isLoading || emails.length === 0) {
      setShowRefreshOverlay(false);
      return;
    }
    const timer = setTimeout(() => setShowRefreshOverlay(true), 300);
    return () => clearTimeout(timer);
  }, [isLoading, emails.length]);

  const threadGroups = useMemo(() => {
    const groups = groupEmailsByThread(emails);
    return sortThreadGroups(groups);
  }, [emails]);

  const { contextMenu, openContextMenu, closeContextMenu, menuRef } = useContextMenu<Email>();
  const { dialogProps: confirmDialogProps, confirm: confirmDialog } = useConfirmDialog();

  const [isProcessing, setIsProcessing] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);
  const listDensity = useSettingsStore((state) => state.listDensity);
  const showPreview = useSettingsStore((state) => state.showPreview);

  const estimateSize = useCallback(() => {
    const base = { 'extra-compact': 44, compact: 72, regular: 88, comfortable: 104 }[listDensity];
    return listDensity === 'extra-compact' ? base : (showPreview ? base + 40 : base);
  }, [listDensity, showPreview]);

  const virtualizer = useVirtualizer({
    count: threadGroups.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 5,
    getItemKey: (index) => {
      const group = threadGroups[index];
      if (!group) return String(index);
      // threadId alone can collide across accounts in the unified list
      return accountScopedKey(group.latestEmail.accountId, group.threadId);
    },
  });

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
  const allSelected = threadGroups.length > 0
    && threadGroups.every(g => selectedEmailIds.has(emailRowKey(g.latestEmail)));

  const handleBatchMarkAsRead = async (read: boolean) => {
    if (!client || isProcessing) return;
    setIsProcessing(true);
    try {
      await batchMarkAsRead(client, read);
    } finally {
      setTimeout(() => setIsProcessing(false), 500);
    }
  };

  const handleBatchDelete = async () => {
    if (!client || isProcessing) return;

    const confirmed = await confirmDialog({
      title: t('batch_actions.delete_confirm_title'),
      message: t('batch_actions.delete_confirm_message', { count: selectedEmailIds.size }),
      confirmText: t('batch_actions.delete'),
      variant: "destructive",
    });
    if (!confirmed) return;

    setIsProcessing(true);
    try {
      await batchDelete(client);
    } finally {
      setTimeout(() => setIsProcessing(false), 500);
    }
  };

  const handleBatchMove = async (mailboxId: string) => {
    if (!client || isProcessing) return;
    setIsProcessing(true);
    try {
      await batchMoveToMailbox(client, mailboxId);
      const { toast } = await import('sonner');
      const targetMailbox = mailboxes.find(m => m.id === mailboxId);
      toast.success(t('batch_actions.move_success', {
        count: selectedEmailIds.size,
        folder: targetMailbox?.name || mailboxId,
      }));
    } catch {
      const { toast } = await import('sonner');
      toast.error(t('batch_actions.move_error'));
    } finally {
      setTimeout(() => setIsProcessing(false), 500);
    }
  };

  const handleLoadMore = useCallback(() => {
    if (client && hasMoreEmails && !isLoadingMore && !isLoading) {
      loadMoreEmails(client);
    }
  }, [client, hasMoreEmails, isLoadingMore, isLoading, loadMoreEmails]);

  const handleToggleThreadExpansion = useCallback(async (thread: ThreadGroup) => {
    const threadKey = accountScopedKey(thread.latestEmail.accountId, thread.threadId);
    const isExpanded = expandedThreadIds.has(threadKey);

    if (!isExpanded && client) {
      toggleThreadExpansion(threadKey);
      await fetchThreadEmails(client, thread.threadId, thread.latestEmail.accountId);
    } else {
      toggleThreadExpansion(threadKey);
    }
  }, [client, expandedThreadIds, toggleThreadExpansion, fetchThreadEmails]);

  const handleCheckboxClick = useCallback((e: React.MouseEvent, selectionKey: RowKey, groupIndex: number) => {
    e.stopPropagation();
    if (e.shiftKey && lastSelectedIndex !== null) {
      selectRange(lastSelectedIndex, groupIndex, threadGroups);
    } else {
      toggleEmailSelection(selectionKey, groupIndex);
    }
  }, [lastSelectedIndex, selectRange, toggleEmailSelection, threadGroups]);

  // Range-based load more: trigger when last visible item is near the end
  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualItemIndex = virtualItems[virtualItems.length - 1]?.index;

  useEffect(() => {
    if (lastVirtualItemIndex === undefined) return;
    if (lastVirtualItemIndex >= threadGroups.length - 5) {
      handleLoadMore();
    }
  }, [lastVirtualItemIndex, threadGroups.length, handleLoadMore]);

  // Scroll to the thread group containing the selected email
  useEffect(() => {
    if (!selectedEmailId) return;
    const index = threadGroups.findIndex(thread =>
      thread.latestEmail.accountId === selectedEmailAccountId &&
      (thread.latestEmail.id === selectedEmailId ||
        thread.emails.some(e => e.id === selectedEmailId))
    );
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'auto' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll only on selection change, not on list re-renders
  }, [selectedEmailId]);

  // Re-measure all items when density or preview settings change
  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- virtualizer ref is stable, only re-measure on setting changes
  }, [listDensity, showPreview]);

  useEffect(() => {
    const container = parentRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const activeEl = document.activeElement;
        const isInInput = activeEl instanceof HTMLInputElement ||
          activeEl instanceof HTMLTextAreaElement ||
          (activeEl instanceof HTMLElement && activeEl.isContentEditable);
        if (isInInput) return;

        e.preventDefault();
        selectAllEmails(threadGroups);
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [selectAllEmails, threadGroups]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Batch Actions Toolbar */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out overflow-hidden",
          hasSelection ? "max-h-16 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-4 py-2 border-b bg-accent/30 border-border flex items-center justify-between">
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-3 duration-300">
            <span className="text-sm font-medium text-foreground" aria-live="polite">
              {t('batch_actions.selected_count', { count: selectedEmailIds.size })}
            </span>
          </div>
          <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-3 duration-300">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleBatchMarkAsRead(true)}
              title={t('batch_actions.mark_read')}
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
              title={t('batch_actions.mark_unread')}
              disabled={isProcessing}
              className="hover:bg-accent transition-colors disabled:opacity-50"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
            </Button>
            <MoveToPopover
              mailboxes={mailboxes}
              currentMailboxId={selectedMailbox}
              onMove={handleBatchMove}
              disabled={isProcessing}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBatchDelete}
              title={t('batch_actions.delete')}
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
              title={t('batch_actions.clear_selection')}
              disabled={isProcessing}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {t('batch_actions.clear_selection')}
            </Button>
          </div>
        </div>
      </div>

      {/* Search Scope Chips (only while a search or advanced search is active) */}
      {(searchQuery.trim().length > 0 || !isFilterEmpty(searchFilters)) && (
        <SearchScopeChips
          scope={currentQuery.scope}
          folderMailboxId={
            mailboxes.find((mb) => mb.id === selectedMailbox)?.originalId || selectedMailbox
          }
          onScopeChange={(scope) => {
            if (client) setScope(client, scope);
          }}
        />
      )}

      {/* Advanced Search Filter Chips */}
      {!isFilterEmpty(searchFilters) && (
        <SearchChips
          filters={searchFilters}
          onRemoveFilter={(key) => {
            const resetValue = DEFAULT_SEARCH_FILTERS[key];
            setSearchFilters({ [key]: resetValue });
            if (client) advancedSearch(client);
          }}
          onClearAll={() => {
            clearSearchFilters();
            if (client) advancedSearch(client);
          }}
        />
      )}

      <UnifiedFailureNotice />

      {/* List Header */}
      <div className="px-4 py-3 border-b bg-muted/50 border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SelectionDropdown
            hasSelection={hasSelection}
            allSelected={allSelected}
            onSelectByFilter={(filter, groups) => selectByFilter(filter, groups)}
            threadGroups={threadGroups}
          />
          <h2 className="text-sm font-medium text-foreground">
            {isLoading ? t('loading') : threadGroups.length > 0
              ? (totalEmails !== undefined && totalEmails > threadGroups.length
                  ? t('conversations_count', { count: threadGroups.length, total: totalEmails })
                  : hasMoreEmails
                    ? t('conversations_count_plus', { count: threadGroups.length })
                    : t('conversations_count_simple', { count: threadGroups.length }))
              : t('no_conversations')}
          </h2>
        </div>
        <SortMenu />
      </div>

      {/* Email List */}
      <div ref={parentRef} className="flex-1 overflow-y-auto bg-background relative" tabIndex={0}>
        {/* Loading overlay */}
        {showRefreshOverlay && (
          <div className="absolute inset-0 bg-background/50 z-10 flex items-center justify-center animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/90 px-4 py-2 rounded-full shadow-sm border border-border">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('loading')}</span>
            </div>
          </div>
        )}

        {isLoading && emails.length === 0 ? (
          <LoadingSkeleton />
        ) : emails.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full py-12">
            <Inbox className="w-16 h-16 mb-4 text-muted-foreground/50" />
            <p className="text-base font-medium text-foreground">{t('no_emails')}</p>
            <p className="text-sm mt-1 text-muted-foreground">{t('no_emails_description')}</p>
          </div>
        ) : (
          <>
            <div
              className="w-full"
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const thread = threadGroups[virtualItem.index];
                const threadKey = accountScopedKey(thread.latestEmail.accountId, thread.threadId);
                const rowKey = emailRowKey(thread.latestEmail);
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <ThreadListItem
                      thread={thread}
                      isExpanded={expandedThreadIds.has(threadKey)}
                      selectedEmailId={selectedEmailId}
                      selectedEmailAccountId={selectedEmailAccountId}
                      isLoading={isLoadingThread === threadKey}
                      expandedEmails={threadEmailsCache.get(threadKey)}
                      onToggleExpand={() => handleToggleThreadExpansion(thread)}
                      onEmailSelect={(email) => onEmailSelect?.(email)}
                      onContextMenu={openContextMenu}
                      onOpenConversation={onOpenConversation}
                      isChecked={selectedEmailIds.has(rowKey)}
                      onCheckboxClick={(e) => handleCheckboxClick(e, rowKey, virtualItem.index)}
                    />
                  </div>
                );
              })}
            </div>

            <div className="py-4 flex justify-center">
              {isLoadingMore && hasMoreEmails && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('loading_more')}</span>
                </div>
              )}
              {!hasMoreEmails && emails.length > 0 && (
                <div className="text-sm text-muted-foreground border-t border-border pt-6">
                  {t('no_more_emails')}
                </div>
              )}
            </div>
          </>
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
          currentMailboxRole={mailboxes.find(m => m.id === selectedMailbox)?.role}
          isMultiSelect={selectedEmailIds.has(emailRowKey(contextMenu.data))}
          selectedCount={selectedEmailIds.size}
          onReply={() => onReply?.(contextMenu.data!)}
          onReplyAll={() => onReplyAll?.(contextMenu.data!)}
          onForward={() => onForward?.(contextMenu.data!)}
          onMarkAsRead={(read) => onMarkAsRead?.(contextMenu.data!, read)}
          onToggleStar={() => onToggleStar?.(contextMenu.data!)}
          onDelete={() => onDelete?.(contextMenu.data!)}
          onArchive={() => onArchive?.(contextMenu.data!)}
          onSetColorTag={(color) => onSetColorTag?.(contextMenu.data!.id, color, contextMenu.data!.accountId)}
          onMoveToMailbox={(mailboxId) => onMoveToMailbox?.(contextMenu.data!.id, mailboxId, contextMenu.data!.accountId)}
          onMarkAsSpam={() => onMarkAsSpam?.(contextMenu.data!)}
          onUndoSpam={() => onUndoSpam?.(contextMenu.data!)}
          onBatchMarkAsRead={(read) => client && batchMarkAsRead(client, read)}
          onBatchDelete={() => client && batchDelete(client)}
          onBatchMoveToMailbox={(mailboxId) => client && handleBatchMove(mailboxId)}
          onBatchMarkAsSpam={async () => {
            if (client) {
              const count = selectedEmailIds.size;
              try {
                await batchMarkAsSpam(client);
                const { toast } = await import('sonner');
                toast.success(
                  t('../email_viewer.spam.toast_batch', { count })
                );
              } catch {
                const { toast } = await import('sonner');
                toast.error(t('../email_viewer.spam.error'));
              }
            }
          }}
          onBatchUndoSpam={async () => {
            if (client) {
              const count = selectedEmailIds.size;
              try {
                await batchUndoSpam(client);
                const { toast } = await import('sonner');
                toast.success(
                  t('../email_viewer.spam.toast_not_spam_batch', { count })
                );
              } catch {
                const { toast } = await import('sonner');
                toast.error(t('../email_viewer.spam.error_not_spam'));
              }
            }
          }}
        />
      )}

      <ConfirmDialog {...confirmDialogProps} />
    </div>
  );
}
