"use client";

import { useCallback, useState, DragEvent } from "react";
import { Mailbox } from "@/lib/jmap/types";
import { useEmailStore } from "@/stores/email-store";
import { useAuthStore } from "@/stores/auth-store";
import { useDragDropContext } from "@/contexts/drag-drop-context";
import { toast } from "@/stores/toast-store";
import { accountScopedKey } from "@/lib/thread-utils";
import type { DraggedEmailRef } from "@/contexts/drag-drop-context";

interface UseMailboxDropOptions {
  mailbox: Mailbox;
  onDropComplete?: () => void;
  // Translation callbacks for toast messages
  onSuccess?: (count: number, mailboxName: string) => void;
  onError?: (error: string) => void;
}

interface UseMailboxDropReturn {
  dropHandlers: {
    onDragOver: (e: DragEvent<HTMLDivElement>) => void;
    onDragEnter: (e: DragEvent<HTMLDivElement>) => void;
    onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
    onDrop: (e: DragEvent<HTMLDivElement>) => void;
  };
  isDropTarget: boolean;
  isValidDropTarget: boolean;
  isInvalidDropTarget: boolean;
}

export function useMailboxDrop({ mailbox, onDropComplete, onSuccess, onError }: UseMailboxDropOptions): UseMailboxDropReturn {
  const [isOver, setIsOver] = useState(false);
  const { client } = useAuthStore();
  const { moveToMailbox, selectedEmailIds, clearSelection, fetchEmails, selectedMailbox } = useEmailStore();
  const { isDragging, sourceMailboxId, draggedEmails, draggedMailboxId, dragType, endDrag } = useDragDropContext();

  const isValidTarget = useCallback(() => {
    if (!isDragging) return false;

    if (dragType === 'mailbox') {
      if (mailbox.id === draggedMailboxId) return false;
      if (mailbox.id.startsWith("shared-") || mailbox.isShared) return false;
      if (!mailbox.myRights?.mayCreateChild) return false;
      return true;
    }

    // Email drag validation (existing logic)
    if (mailbox.id === sourceMailboxId) return false;
    if (!mailbox.myRights?.mayAddItems) return false;
    if (mailbox.id.startsWith("shared-")) return false;
    if (mailbox.isShared && draggedEmails[0]) {
      const mailboxes = useEmailStore.getState().mailboxes;
      const sourceMb = mailboxes.find(mb => mb.id === sourceMailboxId);
      if (sourceMb?.accountId !== mailbox.accountId) return false;
    }
    return true;
  }, [isDragging, mailbox, sourceMailboxId, draggedEmails, draggedMailboxId, dragType]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isValidTarget()) {
      e.dataTransfer.dropEffect = "move";
    } else {
      e.dataTransfer.dropEffect = "none";
    }
  }, [isValidTarget]);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Only leave if actually leaving the element (not entering a child)
    const relatedTarget = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(relatedTarget)) {
      setIsOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);

    if (!client || !isValidTarget()) {
      endDrag();
      return;
    }

    // Handle mailbox drop (reparenting)
    const mailboxIdData = e.dataTransfer.getData("application/x-mailbox-id");
    if (mailboxIdData && dragType === 'mailbox') {
      try {
        const { moveMailbox } = useEmailStore.getState();

        const allMailboxes = useEmailStore.getState().mailboxes;
        const isDescendant = (parentId: string, checkId: string): boolean => {
          const children = allMailboxes.filter(mb => mb.parentId === parentId);
          return children.some(c => c.id === checkId || isDescendant(c.id, checkId));
        };

        if (isDescendant(mailboxIdData, mailbox.id)) {
          endDrag();
          return;
        }

        await moveMailbox(client, mailboxIdData, mailbox.id);

        if (onSuccess) {
          onSuccess(1, mailbox.name);
        }
      } catch (error) {
        if (onError) {
          onError(error instanceof Error ? error.message : 'Unknown error');
        }
      } finally {
        endDrag();
      }
      return;
    }

    try {
      const emailIdsJson = e.dataTransfer.getData("application/x-email-ids");
      if (!emailIdsJson) {
        endDrag();
        return;
      }

      const draggedRows: DraggedEmailRef[] = JSON.parse(emailIdsJson);

      // Move emails one by one, each through its owning account; the store
      // resolves originalId and per-account destination remapping. A row whose
      // account has no equivalent folder is skipped and reported, matching
      // batchMoveToMailbox semantics instead of aborting mid-drop.
      let failedCount = 0;
      for (const row of draggedRows) {
        try {
          await moveToMailbox(client, row.id, mailbox.id, row.accountId);
        } catch {
          failedCount++;
        }
      }
      if (failedCount > 0) {
        throw new Error(failedCount === draggedRows.length
          ? 'No message could be moved to this folder'
          : `${failedCount} message(s) stayed put: no equivalent folder in their account`);
      }

      // Clear selection if any selected emails were moved
      if (draggedRows.some(row => selectedEmailIds.has(accountScopedKey(row.accountId, row.id)))) {
        clearSelection();
      }

      // Refresh the current mailbox view
      await fetchEmails(client, selectedMailbox);

      // Call success callback if provided, otherwise use fallback
      if (onSuccess) {
        onSuccess(draggedRows.length, mailbox.name);
      } else {
        // Fallback for backward compatibility
        if (draggedRows.length === 1) {
          toast.success("Email moved", `Moved to ${mailbox.name}`);
        } else {
          toast.success("Emails moved", `${draggedRows.length} emails moved to ${mailbox.name}`);
        }
      }

      onDropComplete?.();
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : 'Unknown error');
      } else {
        // Fallback for backward compatibility
        toast.error("Move failed", "Could not move emails to the selected folder");
      }
    } finally {
      endDrag();
    }
  }, [client, mailbox, isValidTarget, dragType, moveToMailbox, selectedEmailIds, clearSelection, fetchEmails, selectedMailbox, endDrag, onDropComplete, onSuccess, onError]);

  const valid = isValidTarget();

  return {
    dropHandlers: {
      onDragOver: handleDragOver,
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
    isDropTarget: isOver && isDragging,
    isValidDropTarget: isOver && valid,
    isInvalidDropTarget: isOver && isDragging && !valid,
  };
}
