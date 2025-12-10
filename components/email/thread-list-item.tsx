"use client";

import { formatDate } from "@/lib/utils";
import { Email, ThreadGroup } from "@/lib/jmap/types";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Paperclip, Star, Circle, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { useUIStore } from "@/stores/ui-store";
import { getThreadColorTag } from "@/lib/thread-utils";
import { ThreadEmailItem } from "./thread-email-item";

interface ThreadListItemProps {
  thread: ThreadGroup;
  isExpanded: boolean;
  selectedEmailId?: string;
  isLoading?: boolean;
  expandedEmails?: Email[]; // Full thread emails when expanded
  onToggleExpand: () => void;
  onEmailSelect: (email: Email) => void;
  onContextMenu?: (e: React.MouseEvent, email: Email) => void;
  onOpenConversation?: (thread: ThreadGroup) => void; // Mobile: open full conversation view
}

// Color tag mapping
const colorTags = {
  red: "bg-red-50 dark:bg-red-950/30",
  orange: "bg-orange-50 dark:bg-orange-950/30",
  yellow: "bg-yellow-50 dark:bg-yellow-950/30",
  green: "bg-green-50 dark:bg-green-950/30",
  blue: "bg-blue-50 dark:bg-blue-950/30",
  purple: "bg-purple-50 dark:bg-purple-950/30",
  pink: "bg-pink-50 dark:bg-pink-950/30",
} as const;

export function ThreadListItem({
  thread,
  isExpanded,
  selectedEmailId,
  isLoading = false,
  expandedEmails,
  onToggleExpand,
  onEmailSelect,
  onContextMenu,
  onOpenConversation,
}: ThreadListItemProps) {
  const showPreview = useSettingsStore((state) => state.showPreview);
  const isMobile = useUIStore((state) => state.isMobile);
  const { latestEmail, participantNames, hasUnread, hasStarred, hasAttachment, emailCount } = thread;

  // Get color tag from thread
  const threadColor = getThreadColorTag(thread.emails);
  const colorTag = threadColor ? colorTags[threadColor as keyof typeof colorTags] : null;

  // Check if latest email is selected
  const isSelected = selectedEmailId === latestEmail.id ||
    thread.emails.some(e => e.id === selectedEmailId);

  // Single email thread - render as regular email, no expand
  if (emailCount === 1) {
    return (
      <SingleEmailItem
        email={latestEmail}
        selected={selectedEmailId === latestEmail.id}
        onClick={() => onEmailSelect(latestEmail)}
        onContextMenu={onContextMenu}
        showPreview={showPreview}
        colorTag={colorTag}
      />
    );
  }

  // Get emails to display when expanded
  const emailsToShow = expandedEmails || thread.emails;

  const handleHeaderClick = (e: React.MouseEvent) => {
    // Mobile: open conversation view instead of inline expansion
    if (isMobile && onOpenConversation) {
      onOpenConversation(thread);
      return;
    }

    // Desktop: If clicking directly on the expand icon area, toggle expansion
    // Otherwise, select the latest email
    const target = e.target as HTMLElement;
    if (target.closest('[data-expand-toggle]')) {
      onToggleExpand();
    } else {
      // Clicking on the row selects the latest email but also expands
      if (!isExpanded) {
        onToggleExpand();
      }
      onEmailSelect(latestEmail);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    onContextMenu?.(e, latestEmail);
  };

  return (
    <div className="border-b border-border">
      {/* Thread Header (collapsed view) */}
      <div
        className={cn(
          "relative group cursor-pointer transition-all duration-200",
          colorTag ? colorTag : (
            isSelected
              ? "bg-accent"
              : "bg-background"
          ),
          isSelected && !colorTag && "shadow-sm",
          !colorTag && !isSelected && "hover:bg-muted hover:shadow-sm",
          colorTag && "hover:brightness-95 dark:hover:brightness-110",
          hasUnread && !colorTag && !isSelected && "bg-accent/30",
          isExpanded && "border-b border-border/50"
        )}
        onClick={handleHeaderClick}
        onContextMenu={handleContextMenu}
        style={{ minHeight: 'var(--list-item-height)' }}
      >
        <div className="flex items-start gap-3 px-4" style={{
          paddingTop: 'calc((var(--list-item-height) - 40px) / 2)',
          paddingBottom: 'calc((var(--list-item-height) - 40px) / 2)'
        }}>
          {/* Expand/Collapse Button - Hidden on mobile */}
          {!isMobile && (
            <button
              data-expand-toggle
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className={cn(
                "p-1 rounded mt-2 flex-shrink-0 transition-all duration-200",
                "hover:bg-muted/50 hover:scale-110",
                "active:scale-95",
                "text-muted-foreground hover:text-foreground"
              )}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Unread indicator */}
          {hasUnread && (
            <div className="absolute left-1 top-1/2 -translate-y-1/2">
              <Circle className="w-2 h-2 fill-blue-600 text-blue-600 dark:fill-blue-400 dark:text-blue-400" />
            </div>
          )}

          {/* Avatar */}
          <Avatar
            name={latestEmail.from?.[0]?.name}
            email={latestEmail.from?.[0]?.email}
            size="md"
            className="flex-shrink-0 shadow-sm"
          />

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* First Line: Participants and Date */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={cn(
                  "truncate text-sm",
                  hasUnread
                    ? "font-bold text-foreground"
                    : "font-medium text-muted-foreground"
                )}>
                  {participantNames.join(", ")}
                </span>
                {/* Email count badge */}
                <span className={cn(
                  "flex-shrink-0 px-1.5 py-0.5 text-xs rounded-full font-medium",
                  hasUnread
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}>
                  {emailCount}
                </span>
                <div className="flex items-center gap-1.5">
                  {hasStarred && (
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  )}
                  {hasAttachment && (
                    <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
              </div>
              <span className={cn(
                "text-xs flex-shrink-0 tabular-nums",
                hasUnread
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground"
              )}>
                {formatDate(latestEmail.receivedAt)}
              </span>
            </div>

            {/* Second Line: Subject */}
            <div className={cn(
              "mb-1 line-clamp-1 text-sm",
              hasUnread
                ? "font-semibold text-foreground"
                : "font-normal text-foreground/90"
            )}>
              {latestEmail.subject || "(no subject)"}
            </div>

            {/* Third Line: Preview */}
            {showPreview && (
              <p className={cn(
                "text-sm leading-relaxed line-clamp-2",
                hasUnread
                  ? "text-muted-foreground"
                  : "text-muted-foreground/80"
              )}>
                {latestEmail.preview || "No preview available"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Thread Emails - Desktop only */}
      {isExpanded && !isMobile && (
        <div className="bg-muted/20 animate-in slide-in-from-top-2 duration-200">
          {isLoading ? (
            <div className="py-4 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading conversation...
            </div>
          ) : (
            emailsToShow.map((email, index) => (
              <ThreadEmailItem
                key={email.id}
                email={email}
                selected={email.id === selectedEmailId}
                isLast={index === emailsToShow.length - 1}
                onClick={() => onEmailSelect(email)}
                onContextMenu={onContextMenu}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Single email item (for threads with only 1 email)
function SingleEmailItem({
  email,
  selected,
  onClick,
  onContextMenu,
  showPreview,
  colorTag,
}: {
  email: Email;
  selected: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent, email: Email) => void;
  showPreview: boolean;
  colorTag: string | null;
}) {
  const isUnread = !email.keywords?.$seen;
  const isStarred = email.keywords?.$flagged;
  const sender = email.from?.[0];

  const handleContextMenu = (e: React.MouseEvent) => {
    onContextMenu?.(e, email);
  };

  return (
    <div
      className={cn(
        "relative group cursor-pointer transition-all duration-200 border-b border-border",
        colorTag ? colorTag : (
          selected
            ? "bg-accent"
            : "bg-background"
        ),
        selected && !colorTag && "shadow-sm",
        !colorTag && !selected && "hover:bg-muted hover:shadow-sm",
        colorTag && "hover:brightness-95 dark:hover:brightness-110",
        isUnread && !colorTag && "bg-accent/30"
      )}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      style={{ minHeight: 'var(--list-item-height)' }}
    >
      <div className="flex items-start gap-3 px-4" style={{
        paddingTop: 'calc((var(--list-item-height) - 40px) / 2)',
        paddingBottom: 'calc((var(--list-item-height) - 40px) / 2)'
      }}>
        {/* Spacer for alignment with thread items */}
        <div className="w-6 flex-shrink-0" />

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

          {/* Third Line: Preview */}
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
