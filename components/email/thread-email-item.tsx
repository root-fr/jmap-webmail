"use client";

import { formatDate } from "@/lib/utils";
import { Email } from "@/lib/jmap/types";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Paperclip, Star, Circle } from "lucide-react";

interface ThreadEmailItemProps {
  email: Email;
  selected?: boolean;
  isLast?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent, email: Email) => void;
}

export function ThreadEmailItem({
  email,
  selected,
  isLast = false,
  onClick,
  onContextMenu,
}: ThreadEmailItemProps) {
  const isUnread = !email.keywords?.$seen;
  const isStarred = email.keywords?.$flagged;
  const sender = email.from?.[0];

  const handleContextMenu = (e: React.MouseEvent) => {
    onContextMenu?.(e, email);
  };

  return (
    <div
      className={cn(
        "relative cursor-pointer transition-all duration-150",
        "pl-12 pr-4 py-2.5", // Indented for thread hierarchy
        "border-l-2 border-l-transparent",
        selected
          ? "bg-accent border-l-primary"
          : "hover:bg-muted/50",
        isUnread && !selected && "bg-accent/20",
        !isLast && "border-b border-border/30"
      )}
      onClick={onClick}
      onContextMenu={handleContextMenu}
    >
      <div className="flex items-start gap-3">
        {/* Unread indicator */}
        {isUnread && (
          <div className="absolute left-7 top-1/2 -translate-y-1/2">
            <Circle className="w-1.5 h-1.5 fill-blue-600 text-blue-600 dark:fill-blue-400 dark:text-blue-400" />
          </div>
        )}

        {/* Small Avatar */}
        <Avatar
          name={sender?.name}
          email={sender?.email}
          size="sm"
          className="flex-shrink-0"
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Single line: Sender, indicators, preview, date */}
          <div className="flex items-center gap-2">
            <span className={cn(
              "truncate text-sm flex-shrink-0 max-w-[150px]",
              isUnread
                ? "font-semibold text-foreground"
                : "font-medium text-muted-foreground"
            )}>
              {sender?.name || sender?.email?.split('@')[0] || "Unknown"}
            </span>

            {/* Indicators */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {isStarred && (
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              )}
              {email.hasAttachment && (
                <Paperclip className="w-3 h-3 text-muted-foreground" />
              )}
            </div>

            {/* Preview snippet */}
            <span className={cn(
              "text-sm truncate flex-1 min-w-0",
              isUnread
                ? "text-muted-foreground"
                : "text-muted-foreground/70"
            )}>
              {email.preview || "No preview"}
            </span>

            {/* Date */}
            <span className={cn(
              "text-xs flex-shrink-0 tabular-nums",
              isUnread
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            )}>
              {formatDate(email.receivedAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
