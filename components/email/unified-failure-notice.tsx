"use client";

import { useTranslations } from "next-intl";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEmailStore } from "@/stores/email-store";
import { useAuthStore } from "@/stores/auth-store";
import { getAccountDisplayName } from "@/lib/utils";

// Inline partial-failure notice for merged views: names the accounts whose
// fetch failed while the successful pages stay rendered underneath.
export function UnifiedFailureNotice() {
  const t = useTranslations("email_list");
  const { client } = useAuthStore();
  const { failedAccounts, mailboxes, dismissFailedAccounts, retryQuery } = useEmailStore();

  if (failedAccounts.length === 0) return null;

  const accounts = failedAccounts
    .map((id) => getAccountDisplayName(mailboxes, id) ?? id)
    .join(", ");

  return (
    <div
      role="alert"
      className="mx-4 mt-3 mb-1 rounded-lg border border-border bg-background shadow-sm"
    >
      <div className="p-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5 p-1.5 rounded-md bg-destructive/10">
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm text-foreground">
              {t("unified_failure.message", { accounts })}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                if (client) retryQuery(client);
              }}
            >
              {t("unified_failure.retry")}
            </Button>
          </div>
        </div>
        <button
          onClick={dismissFailedAccounts}
          className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors"
          aria-label={t("unified_failure.dismiss")}
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
