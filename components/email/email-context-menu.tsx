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
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { cn, buildMailboxTree, flattenMailboxTree, getMailboxDisplayName } from "@/lib/utils";

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
  currentMailboxRole?: string;
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
  onMarkAsSpam?: () => void;
  onUndoSpam?: () => void;
  // Batch actions
  onBatchMarkAsRead?: (read: boolean) => void;
  onBatchDelete?: () => void;
  onBatchMoveToMailbox?: (mailboxId: string) => void;
  onBatchMarkAsSpam?: () => void;
  onBatchUndoSpam?: () => void;
}

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
  currentMailboxRole,
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
  onMarkAsSpam,
  onUndoSpam,
  onBatchMarkAsRead,
  onBatchDelete,
  onBatchMoveToMailbox,
  onBatchMarkAsSpam,
  onBatchUndoSpam,
}: EmailContextMenuProps) {
  const t = useTranslations("context_menu");
  const tColor = useTranslations("email_viewer.color_tag");
  const tSidebar = useTranslations("sidebar");
  const isUnread = !email.keywords?.$seen;
  const isStarred = email.keywords?.$flagged;
  const currentColor = getCurrentColor(email.keywords);
  const showBatchActions = isMultiSelect && selectedCount > 1;
  const isInJunkFolder = currentMailboxRole === 'junk';

  // Color options for email tags (using translations)
  const colorOptions = [
    { name: tColor("red"), value: "red", color: "bg-red-500" },
    { name: tColor("orange"), value: "orange", color: "bg-orange-500" },
    { name: tColor("yellow"), value: "yellow", color: "bg-yellow-500" },
    { name: tColor("green"), value: "green", color: "bg-green-500" },
    { name: tColor("blue"), value: "blue", color: "bg-blue-500" },
    { name: tColor("purple"), value: "purple", color: "bg-purple-500" },
    { name: tColor("pink"), value: "pink", color: "bg-pink-500" },
  ];

  const moveTargets = flattenMailboxTree(buildMailboxTree(mailboxes)).filter(
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
                label={getMailboxDisplayName(mailbox.role, mailbox.name, tSidebar)}
                style={mailbox.depth > 0 ? { paddingLeft: `${12 + mailbox.depth * 12}px` } : undefined}
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

      {/* Spam - contextual based on folder */}
      <ContextMenuItem
        icon={isInJunkFolder ? ShieldCheck : ShieldAlert}
        label={isInJunkFolder ? t("not_spam") : t("mark_as_spam")}
        onClick={() =>
          handleAction(
            showBatchActions
              ? (isInJunkFolder ? onBatchUndoSpam! : onBatchMarkAsSpam!)
              : (isInJunkFolder ? onUndoSpam! : onMarkAsSpam!)
          )
        }
        disabled={showBatchActions ? (isInJunkFolder ? !onBatchUndoSpam : !onBatchMarkAsSpam) : (isInJunkFolder ? !onUndoSpam : !onMarkAsSpam)}
        destructive={!isInJunkFolder}
      />

      <ContextMenuSeparator />

      {/* Set color submenu - only for single email */}
      {!showBatchActions && (
        <ContextMenuSubMenu icon={Palette} label={t("color_tag")}>
          <div
            className="px-3 py-2 flex flex-wrap gap-2"
            role="group"
            aria-label={t("color_tag")}
            onKeyDown={(e) => {
              const buttons = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>("button")
              );
              const idx = buttons.indexOf(e.target as HTMLButtonElement);
              if (idx < 0) return;
              let next = -1;
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                next = (idx + 1) % buttons.length;
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                next = (idx - 1 + buttons.length) % buttons.length;
              }
              if (next >= 0) {
                e.preventDefault();
                buttons[next].focus();
              }
            }}
          >
            {colorOptions.map((option, i) => (
              <button
                key={option.value}
                tabIndex={i === 0 ? 0 : -1}
                onClick={() =>
                  handleAction(() => onSetColorTag?.(option.value))
                }
                className={cn(
                  "w-8 h-8 rounded-full hover:scale-110 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  option.color,
                  currentColor === option.value &&
                    "ring-2 ring-offset-2 ring-offset-background ring-foreground"
                )}
                title={option.name}
                aria-label={option.name}
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
