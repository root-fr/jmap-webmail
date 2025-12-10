"use client";

import { useTranslations } from "next-intl";
import { Email, Mailbox } from "@/lib/jmap/types";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSubMenu,
  ContextMenuHeader,
} from "@/components/ui/context-menu";
import {
  Reply,
  ReplyAll,
  Forward,
  Mail,
  MailOpen,
  Star,
  Trash2,
  Archive,
  FolderInput,
  Palette,
  X,
  Inbox,
  Send,
  File,
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Position {
  x: number;
  y: number;
}

interface EmailContextMenuProps {
  email: Email;
  position: Position;
  isOpen: boolean;
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  mailboxes: Mailbox[];
  selectedMailbox: string;
  isMultiSelect?: boolean;
  selectedCount?: number;
  // Single email actions
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onMarkAsRead?: (read: boolean) => void;
  onToggleStar?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  onSetColorTag?: (color: string | null) => void;
  onMoveToMailbox?: (mailboxId: string) => void;
  // Batch actions
  onBatchMarkAsRead?: (read: boolean) => void;
  onBatchDelete?: () => void;
  onBatchMoveToMailbox?: (mailboxId: string) => void;
}

// Color options for email tags
const colorOptions = [
  { name: "Red", value: "red", color: "bg-red-500" },
  { name: "Orange", value: "orange", color: "bg-orange-500" },
  { name: "Yellow", value: "yellow", color: "bg-yellow-500" },
  { name: "Green", value: "green", color: "bg-green-500" },
  { name: "Blue", value: "blue", color: "bg-blue-500" },
  { name: "Purple", value: "purple", color: "bg-purple-500" },
  { name: "Pink", value: "pink", color: "bg-pink-500" },
];

// Get mailbox icon based on role
const getMailboxIcon = (role?: string) => {
  switch (role) {
    case "inbox":
      return Inbox;
    case "sent":
      return Send;
    case "drafts":
      return File;
    case "trash":
      return Trash2;
    case "archive":
      return Archive;
    default:
      return Folder;
  }
};

// Get current color from email keywords
const getCurrentColor = (keywords: Record<string, boolean> | undefined) => {
  if (!keywords) return null;
  for (const key of Object.keys(keywords)) {
    if (key.startsWith("$color:") && keywords[key] === true) {
      return key.replace("$color:", "");
    }
  }
  return null;
};

export function EmailContextMenu({
  email,
  position,
  isOpen,
  onClose,
  menuRef,
  mailboxes,
  selectedMailbox,
  isMultiSelect = false,
  selectedCount = 1,
  onReply,
  onReplyAll,
  onForward,
  onMarkAsRead,
  onToggleStar,
  onDelete,
  onArchive,
  onSetColorTag,
  onMoveToMailbox,
  onBatchMarkAsRead,
  onBatchDelete,
  onBatchMoveToMailbox,
}: EmailContextMenuProps) {
  const t = useTranslations("context_menu");
  const isUnread = !email.keywords?.$seen;
  const isStarred = email.keywords?.$flagged;
  const currentColor = getCurrentColor(email.keywords);
  const showBatchActions = isMultiSelect && selectedCount > 1;

  // Filter mailboxes for move-to submenu (exclude current, drafts, virtual nodes)
  const moveTargets = mailboxes.filter(
    (m) =>
      m.id !== selectedMailbox &&
      m.role !== "drafts" &&
      !m.id.startsWith("shared-") &&
      m.myRights?.mayAddItems
  );

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <ContextMenu
      ref={menuRef}
      isOpen={isOpen}
      position={position}
      onClose={onClose}
    >
      {/* Batch header */}
      {showBatchActions && (
        <ContextMenuHeader>
          {t("items_selected", { count: selectedCount })}
        </ContextMenuHeader>
      )}

      {/* Single email actions - Reply, Reply All, Forward */}
      {!showBatchActions && (
        <>
          <ContextMenuItem
            icon={Reply}
            label={t("reply")}
            onClick={() => handleAction(onReply!)}
            disabled={!onReply}
          />
          <ContextMenuItem
            icon={ReplyAll}
            label={t("reply_all")}
            onClick={() => handleAction(onReplyAll!)}
            disabled={!onReplyAll}
          />
          <ContextMenuItem
            icon={Forward}
            label={t("forward")}
            onClick={() => handleAction(onForward!)}
            disabled={!onForward}
          />
          <ContextMenuSeparator />
        </>
      )}

      {/* Mark as read/unread */}
      <ContextMenuItem
        icon={isUnread ? MailOpen : Mail}
        label={isUnread ? t("mark_read") : t("mark_unread")}
        onClick={() =>
          handleAction(() =>
            showBatchActions
              ? onBatchMarkAsRead?.(isUnread)
              : onMarkAsRead?.(isUnread)
          )
        }
      />

      {/* Star/Unstar - only for single email */}
      {!showBatchActions && (
        <ContextMenuItem
          icon={Star}
          label={isStarred ? t("unstar") : t("star")}
          onClick={() => handleAction(onToggleStar!)}
          disabled={!onToggleStar}
        />
      )}

      <ContextMenuSeparator />

      {/* Move to submenu */}
      {moveTargets.length > 0 && (
        <ContextMenuSubMenu icon={FolderInput} label={t("move_to")}>
          {moveTargets.map((mailbox) => {
            const Icon = getMailboxIcon(mailbox.role);
            return (
              <ContextMenuItem
                key={mailbox.id}
                icon={Icon}
                label={mailbox.name}
                onClick={() =>
                  handleAction(() =>
                    showBatchActions
                      ? onBatchMoveToMailbox?.(mailbox.id)
                      : onMoveToMailbox?.(mailbox.id)
                  )
                }
              />
            );
          })}
        </ContextMenuSubMenu>
      )}

      {/* Archive */}
      <ContextMenuItem
        icon={Archive}
        label={t("archive")}
        onClick={() => handleAction(onArchive!)}
        disabled={!onArchive}
      />

      <ContextMenuSeparator />

      {/* Set color submenu - only for single email */}
      {!showBatchActions && (
        <ContextMenuSubMenu icon={Palette} label={t("color_tag")}>
          <div className="px-3 py-2 flex flex-wrap gap-1.5">
            {colorOptions.map((option) => (
              <button
                key={option.value}
                onClick={() =>
                  handleAction(() => onSetColorTag?.(option.value))
                }
                className={cn(
                  "w-6 h-6 rounded-full hover:scale-110 transition-transform",
                  option.color,
                  currentColor === option.value &&
                    "ring-2 ring-offset-2 ring-offset-background ring-foreground"
                )}
                title={option.name}
              />
            ))}
          </div>
          {currentColor && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                icon={X}
                label={t("remove_color")}
                onClick={() => handleAction(() => onSetColorTag?.(null))}
              />
            </>
          )}
        </ContextMenuSubMenu>
      )}

      <ContextMenuSeparator />

      {/* Delete */}
      <ContextMenuItem
        icon={Trash2}
        label={t("delete")}
        onClick={() =>
          handleAction(showBatchActions ? onBatchDelete! : onDelete!)
        }
        disabled={showBatchActions ? !onBatchDelete : !onDelete}
        destructive
      />
    </ContextMenu>
  );
}
