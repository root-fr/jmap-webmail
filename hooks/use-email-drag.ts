"use client";

import { useCallback, DragEvent } from "react";
import { Email } from "@/lib/jmap/types";
import { useEmailStore } from "@/stores/email-store";
import { useDragDropContext } from "@/contexts/drag-drop-context";
import type { DraggedEmailRef } from "@/contexts/drag-drop-context";
import { emailRowKey, isSameRow } from "@/lib/thread-utils";

interface UseEmailDragOptions {
  email: Email;
  sourceMailboxId: string;
}

interface UseEmailDragReturn {
  dragHandlers: {
    draggable: boolean;
    onDragStart: (e: DragEvent<HTMLDivElement>) => void;
    onDragEnd: (e: DragEvent<HTMLDivElement>) => void;
  };
  isDragging: boolean;
}

function createDragPreview(count: number): HTMLElement {
  const preview = document.createElement("div");
  preview.className = "drag-preview";
  preview.style.cssText = `
    position: fixed;
    top: -9999px;
    left: 0;
    padding: 8px 16px;
    background-color: var(--color-primary, #3b82f6);
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-size: 14px;
    font-weight: 500;
    z-index: 9999;
    white-space: nowrap;
    pointer-events: none;
  `;
  preview.textContent = count === 1 ? "1 email" : `${count} emails`;
  document.body.appendChild(preview);
  return preview;
}

export function useEmailDrag({ email, sourceMailboxId }: UseEmailDragOptions): UseEmailDragReturn {
  const { selectedEmailIds, emails } = useEmailStore();
  const { startDrag, endDrag, isDragging, draggedEmails } = useDragDropContext();

  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>) => {
    // Determine which emails to drag:
    // - If current email is selected, drag all selected
    // - Otherwise, drag only this email
    const isSelected = selectedEmailIds.has(emailRowKey(email));
    const emailsToDrag = isSelected
      ? emails.filter(em => selectedEmailIds.has(emailRowKey(em)))
      : [email];

    // Set data transfer: id + owning account, so merged-view drops route
    // each row through its own account.
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "application/x-email-ids",
      JSON.stringify(emailsToDrag.map((em): DraggedEmailRef => ({ id: em.id, accountId: em.accountId })))
    );
    e.dataTransfer.setData(
      "text/plain",
      emailsToDrag.map(em => em.subject || "(no subject)").join(", ")
    );

    // Create custom drag image
    const dragPreview = createDragPreview(emailsToDrag.length);
    e.dataTransfer.setDragImage(dragPreview, 0, 0);

    // Clean up preview after drag starts (browser keeps a snapshot)
    requestAnimationFrame(() => {
      dragPreview.remove();
    });

    startDrag(emailsToDrag, sourceMailboxId);
  }, [email, selectedEmailIds, emails, sourceMailboxId, startDrag]);

  const handleDragEnd = useCallback(() => {
    endDrag();
  }, [endDrag]);

  // Check if this specific email is being dragged
  const isThisEmailDragging = isDragging
    && draggedEmails.some(em => isSameRow(em, email));

  return {
    dragHandlers: {
      draggable: true,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
    },
    isDragging: isThisEmailDragging,
  };
}
