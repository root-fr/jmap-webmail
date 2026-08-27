"use client";

import { Email } from "@/lib/jmap/types";
import { useEmailStore } from "@/stores/email-store";
import { cn, getAccountDisplayName } from "@/lib/utils";

interface AccountContextLineProps {
  email: Email;
  className?: string;
}

// "account · folder" provenance line for mail from non-primary accounts
// (unified inbox / shared mailboxes). Renders nothing for own mail.
export function AccountContextLine({ email, className }: AccountContextLineProps) {
  const { mailboxes } = useEmailStore();
  const accountName = getAccountDisplayName(mailboxes, email.accountId);
  if (!accountName) return null;
  const folderName = mailboxes.find((mb) => email.mailboxIds?.[mb.id])?.name;
  return (
    <div
      data-testid="account-context-line"
      className={cn("text-xs text-muted-foreground truncate", className)}
    >
      {folderName ? `${accountName} · ${folderName}` : accountName}
    </div>
  );
}
