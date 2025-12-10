"use client";

import { formatDate } from "@/lib/utils";
import { Email } from "@/lib/jmap/types";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Paperclip, Star, Circle, CheckSquare, Square } from "lucide-react";
import { useEmailStore } from "@/stores/email-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useEmailDrag } from "@/hooks/use-email-drag";

interface EmailListItemProps {
  email: Email;
  selected?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent, email: Email) => void;
}

// Color tag mapping - using lighter backgrounds for better readability
const colorTags = {
  red: "bg-red-50 dark:bg-red-950/30",
  orange: "bg-orange-50 dark:bg-orange-950/30",
  yellow: "bg-yellow-50 dark:bg-yellow-950/30",
  green: "bg-green-50 dark:bg-green-950/30",
  blue: "bg-blue-50 dark:bg-blue-950/30",
  purple: "bg-purple-50 dark:bg-purple-950/30",
  pink: "bg-pink-50 dark:bg-pink-950/30",
} as const;

const getEmailColor = (keywords: Record<string, boolean> | undefined) => {
  if (!keywords) return null;
  for (const key of Object.keys(keywords)) {
    if (key.startsWith("$color:") && keywords[key] === true) {
      const color = key.replace("$color:", "");
      return colorTags[color as keyof typeof colorTags] || null;
    }
  }
  return null;
};

export function EmailListItem({ email, selected, onClick, onContextMenu }: EmailListItemProps) {
  const { selectedEmailIds, toggleEmailSelection, selectedMailbox } = useEmailStore();
  const showPreview = useSettingsStore((state) => state.showPreview);
  const isChecked = selectedEmailIds.has(email.id);
  const isUnread = !email.keywords?.$seen;
  const isStarred = email.keywords?.$flagged;
  const isImportant = email.keywords?.["$important"];
  const sender = email.from?.[0];
  const colorTag = getEmailColor(email.keywords);

  // Drag and drop functionality
  const { dragHandlers, isDragging } = useEmailDrag({
    email,
    sourceMailboxId: selectedMailbox,
  });

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleEmailSelection(email.id);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    onContextMenu?.(e, email);
  };

  return (
    <div
      {...dragHandlers}
      className={cn(
        "relative group cursor-pointer transition-all duration-200 border-b border-border",
        // Apply color tag as background, with selected and unread states
        colorTag ? colorTag : (
          selected
            ? "bg-accent"
            : "bg-background"
        ),
        selected && !colorTag && "shadow-sm",
        !colorTag && !selected && "hover:bg-muted hover:shadow-sm",
        colorTag && "hover:brightness-95 dark:hover:brightness-110",
        isUnread && !colorTag && "bg-accent/30",
        // Add visual feedback for checked state
        isChecked && "ring-2 ring-primary/20 bg-accent/40",
        // Drag state visual feedback
        isDragging && "opacity-50 scale-[0.98] ring-2 ring-primary/30"
      )}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      style={{ minHeight: 'var(--list-item-height)' }}
    >
      <div className="flex items-start gap-3 px-4" style={{
        paddingTop: 'calc((var(--list-item-height) - 40px) / 2)',
        paddingBottom: 'calc((var(--list-item-height) - 40px) / 2)'
      }}>
        {/* Checkbox with smooth animation */}
        <button
          onClick={handleCheckboxClick}
          className={cn(
            "p-1 rounded mt-2 flex-shrink-0 transition-all duration-200",
            "hover:bg-muted/50 hover:scale-110",
            "active:scale-95",
            isChecked && "text-primary"
          )}
        >
          {isChecked ? (
            <CheckSquare className="w-4 h-4 animate-in zoom-in-50 duration-200" />
          ) : (
            <Square className="w-4 h-4 text-muted-foreground opacity-60 hover:opacity-100 transition-opacity" />
          )}
        </button>

        {/* Unread indicator */}
        {isUnread && (
          <div className="absolute left-1 top-1/2 -translate-y-1/2">
            <Circle className="w-2 h-2 fill-blue-600 text-blue-600 dark:fill-blue-400 dark:text-blue-400" />
          </div>
        )}

        {/* Avatar */}
        <Avatar
          name={sender?.name}
          email={sender?.email}
          size="md"
          className="flex-shrink-0 shadow-sm"
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* First Line: Sender and Date */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={cn(
                "truncate text-sm",
                isUnread
                  ? "font-bold text-foreground"
                  : "font-medium text-muted-foreground"
              )}>
                {sender?.name || sender?.email || "Unknown"}
              </span>
              <div className="flex items-center gap-1.5">
                {isStarred && (
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                )}
                {isImportant && (
                  <span className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-medium">
                    Important
                  </span>
                )}
                {email.hasAttachment && (
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
            </div>
            <span className={cn(
              "text-xs flex-shrink-0 tabular-nums",
              isUnread
                ? "text-foreground font-semibold"
                : "text-muted-foreground"
            )}>
              {formatDate(email.receivedAt)}
            </span>
          </div>

          {/* Second Line: Subject */}
          <div className={cn(
            "mb-1 line-clamp-1 text-sm",
            isUnread
              ? "font-semibold text-foreground"
              : "font-normal text-foreground/90"
          )}>
            {email.subject || "(no subject)"}
          </div>

          {/* Third Line: Preview (controlled by showPreview setting) */}
          {showPreview && (
            <p className={cn(
              "text-sm leading-relaxed line-clamp-2",
              isUnread
                ? "text-muted-foreground"
                : "text-muted-foreground/80"
            )}>
              {email.preview || "No preview available"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}