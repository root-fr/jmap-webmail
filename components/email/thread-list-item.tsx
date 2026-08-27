"use client";

import React from "react";
import { formatDate, getAccountDisplayName } from "@/lib/utils";
import { Email, ThreadGroup } from "@/lib/jmap/types";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Paperclip, Star, Circle, ChevronRight, ChevronDown, Loader2, MessageSquare, CheckSquare, Square } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { useUIStore } from "@/stores/ui-store";
import { useEmailStore } from "@/stores/email-store";
import { getThreadColorTag } from "@/lib/thread-utils";
import { ThreadEmailItem } from "./thread-email-item";
import { useTranslations } from "next-intl";

interface ThreadListItemProps {
  thread: ThreadGroup;
  isExpanded: boolean;
  selectedEmailId?: string;
  selectedEmailAccountId?: string;
  isLoading?: boolean;
  expandedEmails?: Email[];
  onToggleExpand: () => void;
  onEmailSelect: (email: Email) => void;
  onContextMenu?: (e: React.MouseEvent, email: Email) => void;
  onOpenConversation?: (thread: ThreadGroup) => void;
  isChecked: boolean;
  onCheckboxClick: (e: React.MouseEvent) => void;
}

const colorTags = {
  red: "bg-red-50 dark:bg-red-950/30",
  orange: "bg-orange-50 dark:bg-orange-950/30",
  yellow: "bg-yellow-50 dark:bg-yellow-950/30",
  green: "bg-green-50 dark:bg-green-950/30",
  blue: "bg-blue-50 dark:bg-blue-950/30",
  purple: "bg-purple-50 dark:bg-purple-950/30",
  pink: "bg-pink-50 dark:bg-pink-950/30",
} as const;

function RowBadge({ name, testId }: { name: string; testId: string }) {
  return (
    <span
      data-testid={testId}
      className="px-1.5 py-0.5 text-xs bg-muted text-foreground rounded font-medium truncate max-w-[8rem]"
    >
      {name}
    </span>
  );
}

interface SingleEmailItemProps {
  email: Email;
  selected: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent, email: Email) => void;
  showPreview: boolean;
  colorTag: string | null;
  isChecked: boolean;
  onCheckboxClick: (e: React.MouseEvent) => void;
  folderBadgeName: string | null;
  accountChipName: string | null;
}

const SingleEmailItem = React.forwardRef<HTMLDivElement, SingleEmailItemProps>(
  function SingleEmailItem({ email, selected, onClick, onContextMenu, showPreview, colorTag, isChecked, onCheckboxClick, folderBadgeName, accountChipName }, ref) {
    const isUnread = !email.keywords?.$seen;
    const isStarred = email.keywords?.$flagged;
    const sender = email.from?.[0];

    const handleContextMenu = (e: React.MouseEvent) => {
      onContextMenu?.(e, email);
    };

    return (
      <div
        ref={ref}
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
          isUnread && !colorTag && "bg-accent/30",
          isChecked && "ring-2 ring-primary/20 bg-accent/40"
        )}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        style={{ minHeight: 'var(--list-item-height)' }}
      >
        <div className="flex items-start gap-3 px-4" style={{
          paddingTop: 'calc((var(--list-item-height) - 40px) / 2)',
          paddingBottom: 'calc((var(--list-item-height) - 40px) / 2)'
        }}>
          <button
            onClick={onCheckboxClick}
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

          {isUnread && (
            <div className="absolute left-1 top-1/2 -translate-y-1/2">
              <Circle className="w-2 h-2 fill-blue-600 text-blue-600 dark:fill-blue-400 dark:text-blue-400" />
            </div>
          )}

          <Avatar
            name={sender?.name}
            email={sender?.email}
            size="md"
            className="mt-1 flex-shrink-0 shadow-sm"
          />

          <div className="flex-1 min-w-0">
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
                  {accountChipName && <RowBadge name={accountChipName} testId="account-chip" />}
                  {folderBadgeName && <RowBadge name={folderBadgeName} testId="folder-badge" />}
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

            <div className={cn(
              "mb-1 line-clamp-1 text-sm",
              isUnread
                ? "font-semibold text-foreground"
                : "font-normal text-foreground/90"
            )}>
              {email.subject || "(no subject)"}
            </div>

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
);

export const ThreadListItem = React.forwardRef<HTMLDivElement, ThreadListItemProps>(
  function ThreadListItem({
    thread,
    isExpanded,
    selectedEmailId,
    selectedEmailAccountId,
    isLoading = false,
    expandedEmails,
    onToggleExpand,
    onEmailSelect,
    onContextMenu,
    onOpenConversation,
    isChecked,
    onCheckboxClick,
  }, ref) {
    const t = useTranslations('threads');
    const showPreview = useSettingsStore((state) => state.showPreview);
    const isMobile = useUIStore((state) => state.isMobile);
    const { currentQuery, mailboxes } = useEmailStore();
    const { latestEmail, participantNames, hasUnread, hasStarred, hasAttachment, emailCount } = thread;
    // Only surface the folder badge when browsing across all folders, where a
    // row's mailbox isn't implied by the current view.
    const folderBadgeName: string | null =
      currentQuery.scope.kind === "all"
        ? mailboxes.find((mb) => latestEmail.mailboxIds?.[mb.id])?.name ?? null
        : null;
    // Non-primary rows carry an account chip; unmarked rows = own mail.
    const accountChipName = getAccountDisplayName(mailboxes, latestEmail.accountId);

    const threadColor = getThreadColorTag(thread.emails);
    const colorTag = threadColor ? colorTags[threadColor as keyof typeof colorTags] : null;

    // Ids are account-local: the open email only highlights rows of its own
    // account, or a colliding id from another account lights up too.
    const selectedAccountMatches = selectedEmailAccountId === latestEmail.accountId;
    const isSelected = selectedAccountMatches && (selectedEmailId === latestEmail.id ||
      thread.emails.some(e => e.id === selectedEmailId));

    if (emailCount === 1) {
      return (
        <SingleEmailItem
          ref={ref}
          email={latestEmail}
          selected={selectedAccountMatches && selectedEmailId === latestEmail.id}
          onClick={() => onEmailSelect(latestEmail)}
          onContextMenu={onContextMenu}
          showPreview={showPreview}
          colorTag={colorTag}
          isChecked={isChecked}
          onCheckboxClick={onCheckboxClick}
          folderBadgeName={folderBadgeName}
          accountChipName={accountChipName}
        />
      );
    }

    const emailsToShow = expandedEmails || thread.emails;

    const handleHeaderClick = (e: React.MouseEvent) => {
      if (isMobile && onOpenConversation) {
        onOpenConversation(thread);
        return;
      }

      const target = e.target as HTMLElement;
      if (target.closest('[data-expand-toggle]')) {
        onToggleExpand();
      } else {
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
      <div ref={ref} className="border-b border-border">
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
            isExpanded && "border-b border-border/50",
            isChecked && "ring-2 ring-primary/20 bg-accent/40"
          )}
          onClick={handleHeaderClick}
          onContextMenu={handleContextMenu}
          style={{ minHeight: 'var(--list-item-height)' }}
        >
          <div className="flex items-start gap-3 px-4" style={{
            paddingTop: 'calc((var(--list-item-height) - 40px) / 2)',
            paddingBottom: 'calc((var(--list-item-height) - 40px) / 2)'
          }}>
            {!isMobile && (
              <button
                onClick={onCheckboxClick}
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
            )}

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
                aria-expanded={isExpanded}
                aria-label={t('toggle_thread')}
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

            {hasUnread && (
              <div className="absolute left-1 top-1/2 -translate-y-1/2">
                <Circle className="w-2 h-2 fill-blue-600 text-blue-600 dark:fill-blue-400 dark:text-blue-400" />
              </div>
            )}

            <Avatar
              name={latestEmail.from?.[0]?.name}
              email={latestEmail.from?.[0]?.email}
              size="md"
              className="mt-1 flex-shrink-0 shadow-sm"
            />

            <div className="flex-1 min-w-0">
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
                  <span
                    className={cn(
                      "flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded-full font-medium",
                      hasUnread
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                    title={t('messages_tooltip', { count: emailCount })}
                  >
                    <MessageSquare className="w-3 h-3" />
                    {emailCount}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {hasStarred && (
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    )}
                    {accountChipName && <RowBadge name={accountChipName} testId="account-chip" />}
                    {folderBadgeName && <RowBadge name={folderBadgeName} testId="folder-badge" />}
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

              <div className={cn(
                "mb-1 line-clamp-1 text-sm",
                hasUnread
                  ? "font-semibold text-foreground"
                  : "font-normal text-foreground/90"
              )}>
                {latestEmail.subject || "(no subject)"}
              </div>

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

        {isExpanded && !isMobile && (
          <div className="bg-muted/20 animate-in slide-in-from-top-2 duration-200">
            {isLoading ? (
              <div className="py-4 flex items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {t('loading')}
              </div>
            ) : (
              emailsToShow.map((email, index) => (
                <ThreadEmailItem
                  key={email.id}
                  email={email}
                  selected={selectedAccountMatches && email.id === selectedEmailId}
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
);
