import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Mailbox } from "./jmap/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// `t` should be a translator scoped to the `date` namespace (e.g.
// useTranslations('date')) and `locale` the app's active locale (useLocale())
// — both are required so relative timestamps ("2h ago") and the older-date
// fallback actually respect the user's chosen language instead of always
// rendering in English.
export function formatDate(date: Date | string, t: (key: string, values?: Record<string, string | number | Date>) => string, locale: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t('just_now');
  if (minutes < 60) return t(minutes === 1 ? 'minutes_ago' : 'minutes_ago_plural', { count: minutes });
  if (hours < 24) return t(hours === 1 ? 'hours_ago' : 'hours_ago_plural', { count: hours });
  if (days < 7) return t(days === 1 ? 'days_ago' : 'days_ago_plural', { count: days });

  return d.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "...";
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Types for mailbox tree
export interface MailboxNode extends Mailbox {
  children: MailboxNode[];
  depth: number;
}

// JMAP standard mailbox roles (RFC 8621) to their translated-label keys under
// the `sidebar.mailboxes` namespace. System mailboxes come back from the
// server with their own (English) `name`, which was being rendered verbatim
// everywhere instead of the already-translated labels sitting unused in the
// locale files. Custom/shared folders have no `role` and keep their literal name.
const MAILBOX_ROLE_LABEL_KEYS: Record<string, string> = {
  inbox: 'mailboxes.inbox',
  drafts: 'mailboxes.drafts',
  sent: 'mailboxes.sent',
  trash: 'mailboxes.trash',
  archive: 'mailboxes.archive',
  junk: 'mailboxes.spam',
  flagged: 'mailboxes.starred',
  important: 'mailboxes.important',
  all: 'mailboxes.all_mail',
};

export function getMailboxDisplayName(role: string | undefined, name: string, t: (key: string) => string): string {
  const labelKey = role ? MAILBOX_ROLE_LABEL_KEYS[role] : undefined;
  return labelKey ? t(labelKey) : name;
}

// Role priority for mailbox ordering (lower number = higher priority)
const ROLE_PRIORITY: Record<string, number> = {
  inbox: 0,
  drafts: 1,
  sent: 2,
  archive: 3,
  junk: 4,
  spam: 4, // Treat spam same as junk
  trash: 5,
};

// Deduplicate mailboxes (e.g., "Sent" vs "Sent Mail")
function deduplicateMailboxes(mailboxes: Mailbox[]): Mailbox[] {
  const roleMap = new Map<string, Mailbox>();
  const result: Mailbox[] = [];

  // First pass: collect mailboxes with roles
  mailboxes.forEach(mb => {
    if (mb.role) {
      roleMap.set(mb.role, mb);
    }
  });

  // Second pass: filter out duplicates
  mailboxes.forEach(mb => {
    // If this mailbox has a role, always keep it
    if (mb.role) {
      result.push(mb);
      return;
    }

    // Check if this is a duplicate of a role-based mailbox
    const lowerName = mb.name.toLowerCase();
    const isDuplicate = Array.from(roleMap.values()).some(roleMb => {
      const roleLowerName = roleMb.name.toLowerCase();
      // Check for common duplicates: "Sent Mail" vs "Sent", etc.
      return lowerName.includes(roleLowerName) || roleLowerName.includes(lowerName);
    });

    // Only keep if not a duplicate
    if (!isDuplicate) {
      result.push(mb);
    }
  });

  return result;
}

// Build a hierarchical tree structure from flat mailbox array
export function buildMailboxTree(mailboxes: Mailbox[]): MailboxNode[] {
  // Deduplicate mailboxes first
  const deduplicated = deduplicateMailboxes(mailboxes);

  // Separate own and shared mailboxes
  const ownMailboxes = deduplicated.filter(mb => !mb.isShared);
  const sharedMailboxes = deduplicated.filter(mb => mb.isShared);

  const mailboxMap = new Map<string, MailboxNode>();
  const rootMailboxes: MailboxNode[] = [];

  // First pass: create nodes for own mailboxes
  ownMailboxes.forEach(mailbox => {
    mailboxMap.set(mailbox.id, {
      ...mailbox,
      children: [],
      depth: 0
    });
  });

  // Second pass: build tree structure for own mailboxes
  ownMailboxes.forEach(mailbox => {
    const node = mailboxMap.get(mailbox.id)!;

    if (mailbox.parentId && mailboxMap.has(mailbox.parentId)) {
      const parent = mailboxMap.get(mailbox.parentId)!;
      parent.children.push(node);
      node.depth = parent.depth + 1;
    } else {
      // Root level mailbox or orphaned mailbox
      rootMailboxes.push(node);
      node.depth = 0;
    }
  });

  // If we have shared mailboxes, create a virtual "Shared Folders" parent
  if (sharedMailboxes.length > 0) {
    // Group shared mailboxes by account
    const accountGroups = new Map<string, Mailbox[]>();
    sharedMailboxes.forEach(mb => {
      const accountId = mb.accountId || 'unknown';
      if (!accountGroups.has(accountId)) {
        accountGroups.set(accountId, []);
      }
      accountGroups.get(accountId)!.push(mb);
    });

    // Create virtual nodes for each shared account
    const sharedAccountNodes: MailboxNode[] = [];

    accountGroups.forEach((accountMailboxes, accountId) => {
      // Create account nodes
      const accountMailboxMap = new Map<string, MailboxNode>();
      const accountRootNodes: MailboxNode[] = [];

      // Create nodes for this account's mailboxes
      accountMailboxes.forEach(mailbox => {
        accountMailboxMap.set(mailbox.id, {
          ...mailbox,
          children: [],
          depth: 2 // Account level is depth 1, these are depth 2
        });
      });

      // Build tree for this account's mailboxes
      accountMailboxes.forEach(mailbox => {
        const node = accountMailboxMap.get(mailbox.id)!;

        if (mailbox.parentId && accountMailboxMap.has(mailbox.parentId)) {
          const parent = accountMailboxMap.get(mailbox.parentId)!;
          parent.children.push(node);
          node.depth = parent.depth + 1;
        } else {
          accountRootNodes.push(node);
        }
      });

      // Create virtual account folder node
      const accountName = accountMailboxes[0]?.accountName || accountId;
      const accountNode: MailboxNode = {
        id: `shared-account-${accountId}`,
        name: accountName,
        sortOrder: 1000, // After all own folders
        totalEmails: accountMailboxes.reduce((sum, mb) => sum + mb.totalEmails, 0),
        unreadEmails: accountMailboxes.reduce((sum, mb) => sum + mb.unreadEmails, 0),
        totalThreads: 0,
        unreadThreads: 0,
        myRights: {
          mayReadItems: true,
          mayAddItems: false,
          mayRemoveItems: false,
          maySetSeen: false,
          maySetKeywords: false,
          mayCreateChild: false,
          mayRename: false,
          mayDelete: false,
          maySubmit: false,
        },
        isSubscribed: true,
        accountId: accountId,
        accountName: accountName,
        isShared: true,
        children: accountRootNodes,
        depth: 1,
      };

      sharedAccountNodes.push(accountNode);
    });

    // Create virtual "Shared Folders" root node
    const sharedFoldersNode: MailboxNode = {
      id: 'shared-folders-root',
      name: 'Shared Folders',
      sortOrder: 999, // After all own folders
      totalEmails: sharedMailboxes.reduce((sum, mb) => sum + mb.totalEmails, 0),
      unreadEmails: sharedMailboxes.reduce((sum, mb) => sum + mb.unreadEmails, 0),
      totalThreads: 0,
      unreadThreads: 0,
      myRights: {
        mayReadItems: true,
        mayAddItems: false,
        mayRemoveItems: false,
        maySetSeen: false,
        maySetKeywords: false,
        mayCreateChild: false,
        mayRename: false,
        mayDelete: false,
        maySubmit: false,
      },
      isSubscribed: true,
      isShared: true,
      children: sharedAccountNodes,
      depth: 0,
    };

    rootMailboxes.push(sharedFoldersNode);
  }

  // Smart multi-level sorting
  const sortNodes = (nodes: MailboxNode[]) => {
    nodes.sort((a, b) => {
      // 1. Priority: Own folders before shared folders
      if (a.isShared !== b.isShared) {
        return a.isShared ? 1 : -1;
      }

      // 2. Priority: Role-based ordering (inbox first, trash last, etc.)
      const aPriority = a.role ? (ROLE_PRIORITY[a.role] ?? 999) : 999;
      const bPriority = b.role ? (ROLE_PRIORITY[b.role] ?? 999) : 999;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // 3. Priority: Year folders (e.g., "2025", "2024") sorted numerically descending
      const aIsYear = /^\d{4}$/.test(a.name);
      const bIsYear = /^\d{4}$/.test(b.name);
      if (aIsYear && bIsYear) {
        return parseInt(b.name) - parseInt(a.name); // Descending: 2025, 2024, 2023...
      }

      // 4. Fallback: Server sortOrder
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }

      // 5. Fallback: Alphabetical by name
      return a.name.localeCompare(b.name);
    });

    // Recursively sort children
    nodes.forEach(node => {
      if (node.children.length > 0) {
        sortNodes(node.children);
      }
    });
  };

  sortNodes(rootMailboxes);

  return rootMailboxes;
}

// Flatten a mailbox tree for rendering with proper depth info
export function flattenMailboxTree(nodes: MailboxNode[]): MailboxNode[] {
  const result: MailboxNode[] = [];

  const traverse = (nodes: MailboxNode[], depth: number = 0) => {
    nodes.forEach(node => {
      result.push({ ...node, depth });
      if (node.children.length > 0) {
        traverse(node.children, depth + 1);
      }
    });
  };

  traverse(nodes);
  return result;
}

/**
 * Resolve a mailbox's full hierarchical path ("Inbox/Projects/Foo") by
 * walking parentId. Sieve fileinto and IMAP expect the full path; JMAP
 * only stores the leaf name per mailbox, so UIs must join them up.
 */
export function getMailboxFullPath(
  mailboxes: Mailbox[],
  id: string,
  delimiter = '/',
): string {
  const byId = new Map(mailboxes.map(m => [m.id, m]));
  const segments: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    segments.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return segments.join(delimiter);
}