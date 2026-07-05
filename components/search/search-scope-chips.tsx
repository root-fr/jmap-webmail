"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { EmailScope } from "@/lib/jmap/search-utils";

interface SearchScopeChipsProps {
  scope: EmailScope;
  folderMailboxId: string;
  onScopeChange: (scope: EmailScope) => void;
  className?: string;
}

export function SearchScopeChips({
  scope,
  folderMailboxId,
  onScopeChange,
  className,
}: SearchScopeChipsProps) {
  const t = useTranslations("search");

  const isEverywhere = scope.kind === "all";
  const includeTrashJunk = scope.kind === "all" && scope.includeTrashJunk;

  return (
    <div
      className={cn(
        "px-4 py-2 border-b border-border bg-muted/20 flex items-center gap-2 flex-wrap",
        className
      )}
    >
      <div className="inline-flex items-center rounded-full border border-border overflow-hidden text-xs">
        <button
          type="button"
          aria-pressed={isEverywhere}
          onClick={() => onScopeChange({ kind: "all", includeTrashJunk })}
          className={cn(
            "px-3 py-0.5 font-medium transition-colors",
            isEverywhere
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t("scope_everywhere")}
        </button>
        <button
          type="button"
          aria-pressed={!isEverywhere}
          onClick={() => onScopeChange({ kind: "folder", mailboxId: folderMailboxId })}
          className={cn(
            "px-3 py-0.5 font-medium transition-colors border-l border-border",
            !isEverywhere
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t("scope_this_folder")}
        </button>
      </div>

      {isEverywhere && (
        <button
          type="button"
          aria-pressed={includeTrashJunk}
          onClick={() =>
            onScopeChange({ kind: "all", includeTrashJunk: !includeTrashJunk })
          }
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border transition-colors",
            includeTrashJunk
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
          )}
        >
          {t("include_trash_junk")}
        </button>
      )}
    </div>
  );
}
