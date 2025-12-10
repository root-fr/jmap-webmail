import type { Email, ThreadGroup } from "./jmap/types";

/**
 * Groups emails by their threadId and creates ThreadGroup objects for UI display.
 * Single-email threads are still returned as ThreadGroups with emailCount=1.
 */
export function groupEmailsByThread(emails: Email[]): ThreadGroup[] {
  if (!emails || emails.length === 0) {
    return [];
  }

  // Group emails by threadId
  const threadMap = new Map<string, Email[]>();

  for (const email of emails) {
    const threadId = email.threadId;
    if (!threadMap.has(threadId)) {
      threadMap.set(threadId, []);
    }
    threadMap.get(threadId)!.push(email);
  }

  // Convert to ThreadGroup array
  const threadGroups: ThreadGroup[] = [];

  for (const [threadId, threadEmails] of threadMap) {
    // Sort emails by receivedAt descending (newest first)
    const sortedEmails = [...threadEmails].sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );

    const latestEmail = sortedEmails[0];

    // Collect unique participant names from all emails in thread
    const participantNames = getThreadParticipants(sortedEmails);

    // Check for unread, starred, and attachments
    const hasUnread = sortedEmails.some(e => !e.keywords?.$seen);
    const hasStarred = sortedEmails.some(e => e.keywords?.$flagged);
    const hasAttachment = sortedEmails.some(e => e.hasAttachment);

    threadGroups.push({
      threadId,
      emails: sortedEmails,
      latestEmail,
      participantNames,
      hasUnread,
      hasStarred,
      hasAttachment,
      emailCount: sortedEmails.length,
    });
  }

  return threadGroups;
}

/**
 * Sorts thread groups by their latest email's receivedAt date (newest first).
 */
export function sortThreadGroups(groups: ThreadGroup[]): ThreadGroup[] {
  return [...groups].sort(
    (a, b) => new Date(b.latestEmail.receivedAt).getTime() - new Date(a.latestEmail.receivedAt).getTime()
  );
}

/**
 * Extracts unique participant names from a list of emails.
 * Includes both senders and recipients, limited to avoid UI overflow.
 */
export function getThreadParticipants(emails: Email[], maxNames: number = 4): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const email of emails) {
    // Add sender
    if (email.from && email.from.length > 0) {
      const sender = email.from[0];
      const senderName = sender.name || sender.email.split('@')[0];
      const key = sender.email.toLowerCase();

      if (!seen.has(key)) {
        seen.add(key);
        names.push(senderName);
      }
    }

    // Stop if we have enough names
    if (names.length >= maxNames) break;
  }

  return names;
}

/**
 * Merges newly fetched thread emails into an existing thread group.
 * Used when expanding a thread to show all emails (some may not have been in the original list).
 */
export function mergeThreadEmails(
  existingGroup: ThreadGroup,
  fetchedEmails: Email[]
): ThreadGroup {
  // Create a map of existing emails by ID
  const emailMap = new Map<string, Email>();

  for (const email of existingGroup.emails) {
    emailMap.set(email.id, email);
  }

  // Add fetched emails that aren't already in the group
  for (const email of fetchedEmails) {
    if (!emailMap.has(email.id)) {
      emailMap.set(email.id, email);
    }
  }

  // Convert back to array and sort
  const mergedEmails = Array.from(emailMap.values()).sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );

  const latestEmail = mergedEmails[0];
  const participantNames = getThreadParticipants(mergedEmails);
  const hasUnread = mergedEmails.some(e => !e.keywords?.$seen);
  const hasStarred = mergedEmails.some(e => e.keywords?.$flagged);
  const hasAttachment = mergedEmails.some(e => e.hasAttachment);

  return {
    threadId: existingGroup.threadId,
    emails: mergedEmails,
    latestEmail,
    participantNames,
    hasUnread,
    hasStarred,
    hasAttachment,
    emailCount: mergedEmails.length,
  };
}

/**
 * Gets color tag from email keywords (if any).
 */
export function getEmailColorTag(keywords: Record<string, boolean> | undefined): string | null {
  if (!keywords) return null;

  for (const key of Object.keys(keywords)) {
    if (key.startsWith("$color:") && keywords[key] === true) {
      return key.replace("$color:", "");
    }
  }

  return null;
}

/**
 * Checks if a thread has any color tag (returns first found).
 */
export function getThreadColorTag(emails: Email[]): string | null {
  for (const email of emails) {
    const color = getEmailColorTag(email.keywords);
    if (color) return color;
  }
  return null;
}
