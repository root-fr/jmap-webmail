import type { Email, Mailbox, StateChange, AccountStates, Thread } from "./types";

// JMAP protocol types - these are intentionally flexible due to server variations
interface JMAPSession {
  apiUrl: string;
  downloadUrl: string;
  uploadUrl?: string;
  eventSourceUrl?: string;
  primaryAccounts?: Record<string, string>;
  accounts?: Record<string, JMAPAccount>;
  capabilities?: Record<string, unknown>;
}

interface JMAPAccount {
  name?: string;
  isPersonal?: boolean;
  isReadOnly?: boolean;
  accountCapabilities?: Record<string, unknown>;
}

interface JMAPQuota {
  resourceType?: string;
  scope?: string;
  used?: number;
  hardLimit?: number;
  limit?: number;
}

interface JMAPMailbox {
  id: string;
  name: string;
  parentId?: string | null;
  role?: string | null;
  totalEmails?: number;
  unreadEmails?: number;
  totalThreads?: number;
  unreadThreads?: number;
  sortOrder?: number;
  isSubscribed?: boolean;
  myRights?: Record<string, boolean>;
}

interface JMAPEmailHeader {
  name: string;
  value: string;
}

// Generic JMAP method call type
type JMAPMethodCall = [string, Record<string, unknown>, string];

// JMAP response types - using flexible types due to protocol variations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JMAPResponseResult = Record<string, any>;

interface JMAPResponse {
  methodResponses: Array<[string, JMAPResponseResult, string]>;
}

export class JMAPClient {
  private serverUrl: string;
  private username: string;
  private password: string;
  private authHeader: string;
  private apiUrl: string = "";
  private accountId: string = "";
  private downloadUrl: string = "";
  private capabilities: Record<string, unknown> = {};
  private session: JMAPSession | null = null;
  private lastPingTime: number = 0;
  private pingInterval: NodeJS.Timeout | null = null;
  private accounts: Record<string, JMAPAccount> = {}; // All accounts (primary + shared)
  private eventSource: EventSource | null = null;
  private stateChangeCallback: ((change: StateChange) => void) | null = null;
  private lastStates: AccountStates = {};

  constructor(serverUrl: string, username: string, password: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.username = username;
    this.password = password;
    this.authHeader = `Basic ${btoa(`${username}:${password}`)}`;
  }

  async connect(): Promise<void> {
    // Get the session first
    const sessionUrl = `${this.serverUrl}/.well-known/jmap`;

    try {
      const sessionResponse = await fetch(sessionUrl, {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
        },
      });

      if (!sessionResponse.ok) {
        if (sessionResponse.status === 401) {
          throw new Error('Invalid username or password');
        }
        throw new Error(`Failed to get session: ${sessionResponse.status}`);
      }

      const session = await sessionResponse.json();

      // Store the full session for reference
      this.session = session;

      // Extract and store capabilities
      this.capabilities = session.capabilities || {};

      // Extract the API URL
      this.apiUrl = session.apiUrl;

      // Extract the download URL
      this.downloadUrl = session.downloadUrl;

      // Extract and store all accounts (primary + shared)
      this.accounts = session.accounts || {};

      // Extract the primary account ID
      const mailAccount = session.primaryAccounts?.["urn:ietf:params:jmap:mail"];
      if (mailAccount) {
        this.accountId = mailAccount;
      } else {
        // Try to find any account
        if (this.accounts && Object.keys(this.accounts).length > 0) {
          this.accountId = Object.keys(this.accounts)[0];
        } else {
          throw new Error('No mail account found in session');
        }
      }

      // Start keep-alive mechanism
      this.startKeepAlive();
    } catch (error) {
      console.error('Connection failed:', error);
      throw error;
    }
  }

  private startKeepAlive(): void {
    // Stop any existing interval
    this.stopKeepAlive();

    // Ping every 30 seconds to keep the connection alive
    const PING_INTERVAL = 30000; // 30 seconds

    this.pingInterval = setInterval(async () => {
      try {
        await this.ping();
      } catch (error) {
        console.error('Keep-alive ping failed:', error);
        // If ping fails, try to reconnect
        try {
          await this.reconnect();
        } catch (reconnectError) {
          console.error('Reconnection failed:', reconnectError);
        }
      }
    }, PING_INTERVAL);
  }

  private stopKeepAlive(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  async ping(): Promise<void> {
    if (!this.apiUrl) {
      throw new Error('Not connected');
    }

    const now = Date.now();

    // Use Echo method for lightweight ping
    const response = await this.request([
      ["Core/echo", { ping: "pong" }, "0"]
    ]);

    if (response.methodResponses?.[0]?.[0] === "Core/echo") {
      this.lastPingTime = now;
    } else {
      throw new Error('Ping failed');
    }
  }

  async reconnect(): Promise<void> {
    await this.connect();
  }

  disconnect(): void {
    this.stopKeepAlive();
    this.closePushNotifications();
    this.apiUrl = "";
    this.accountId = "";
    this.session = null;
    this.capabilities = {};
  }

  private async request(methodCalls: JMAPMethodCall[]): Promise<JMAPResponse> {
    if (!this.apiUrl) {
      throw new Error('Not connected. Call connect() first.');
    }

    const requestBody = {
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls: methodCalls,
    };

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('Request failed:', response.status, responseText);
      throw new Error(`Request failed: ${response.status} - ${responseText.substring(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('Failed to parse response:', responseText);
      throw new Error('Invalid JSON response from server');
    }

    return data;
  }

  async getQuota(): Promise<{ used: number; total: number } | null> {
    try {
      const response = await this.request([
        ["Quota/get", {
          accountId: this.accountId,
        }, "0"]
      ]);

      if (response.methodResponses?.[0]?.[0] === "Quota/get") {
        const quotas = (response.methodResponses[0][1].list || []) as JMAPQuota[];
        // Find the mail quota if it exists
        const mailQuota = quotas.find((q) => q.resourceType === "mail" || q.scope === "mail");

        if (mailQuota) {
          return {
            used: mailQuota.used ?? 0,
            total: mailQuota.hardLimit ?? mailQuota.limit ?? 0
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  async getMailboxes(): Promise<Mailbox[]> {
    try {
      const response = await this.request([
        ["Mailbox/get", {
          accountId: this.accountId,
        }, "0"]
      ]);

      if (response.methodResponses?.[0]?.[0] === "Mailbox/get") {
        const rawMailboxes = (response.methodResponses[0][1].list || []) as JMAPMailbox[];

        // Map and ensure all required fields are present
        const mailboxes = rawMailboxes.map((mb) => {
          return {
            id: mb.id,
            originalId: undefined, // Primary account uses original IDs
            name: mb.name,
            parentId: mb.parentId || undefined,
            role: mb.role || undefined,
            sortOrder: mb.sortOrder ?? 0,
            totalEmails: mb.totalEmails ?? 0,
            unreadEmails: mb.unreadEmails ?? 0,
            totalThreads: mb.totalThreads ?? 0,
            unreadThreads: mb.unreadThreads ?? 0,
            myRights: mb.myRights || {
              mayReadItems: true,
              mayAddItems: true,
              mayRemoveItems: true,
              maySetSeen: true,
              maySetKeywords: true,
              mayCreateChild: true,
              mayRename: true,
              mayDelete: true,
              maySubmit: true,
            },
            isSubscribed: mb.isSubscribed ?? true,
            // Account info for primary account
            accountId: this.accountId,
            accountName: this.accounts[this.accountId]?.name || this.username,
            isShared: false,
          } as Mailbox;
        });

        return mailboxes;
      }

      throw new Error('Unexpected response format');
    } catch (error) {
      console.error('Failed to get mailboxes:', error);
      // Return default inbox with all required fields
      return [{
        id: 'INBOX',
        originalId: undefined,
        name: 'Inbox',
        role: 'inbox',
        sortOrder: 0,
        totalEmails: 0,
        unreadEmails: 0,
        totalThreads: 0,
        unreadThreads: 0,
        myRights: {
          mayReadItems: true,
          mayAddItems: true,
          mayRemoveItems: true,
          maySetSeen: true,
          maySetKeywords: true,
          mayCreateChild: true,
          mayRename: true,
          mayDelete: true,
          maySubmit: true,
        },
        isSubscribed: true,
        accountId: this.accountId,
        accountName: this.username,
        isShared: false,
      }] as Mailbox[];
    }
  }

  async getAllMailboxes(): Promise<Mailbox[]> {
    try {
      const allMailboxes: Mailbox[] = [];

      // Get all account IDs
      const accountIds = Object.keys(this.accounts);

      // If no accounts, fallback to primary only
      if (accountIds.length === 0) {
        return this.getMailboxes();
      }

      // Fetch mailboxes for each account
      for (const accountId of accountIds) {
        const account = this.accounts[accountId];
        const isPrimary = accountId === this.accountId;

        try {
          const response = await this.request([
            ["Mailbox/get", {
              accountId: accountId,
            }, "0"]
          ]);

          if (response.methodResponses?.[0]?.[0] === "Mailbox/get") {
            const rawMailboxes = (response.methodResponses[0][1].list || []) as JMAPMailbox[];

            // Map mailboxes with account info
            const mailboxes = rawMailboxes.map((mb) => {
              return {
                id: isPrimary ? mb.id : `${accountId}:${mb.id}`, // Namespace shared mailbox IDs
                originalId: mb.id, // Keep original ID for JMAP queries
                name: mb.name,
                parentId: mb.parentId ? (isPrimary ? mb.parentId : `${accountId}:${mb.parentId}`) : undefined,
                role: mb.role || undefined,
                sortOrder: mb.sortOrder ?? 0,
                totalEmails: mb.totalEmails ?? 0,
                unreadEmails: mb.unreadEmails ?? 0,
                totalThreads: mb.totalThreads ?? 0,
                unreadThreads: mb.unreadThreads ?? 0,
                myRights: mb.myRights || {
                  mayReadItems: true,
                  mayAddItems: true,
                  mayRemoveItems: true,
                  maySetSeen: true,
                  maySetKeywords: true,
                  mayCreateChild: true,
                  mayRename: true,
                  mayDelete: true,
                  maySubmit: true,
                },
                isSubscribed: mb.isSubscribed ?? true,
                // Account info
                accountId: accountId,
                accountName: account?.name || (isPrimary ? this.username : accountId),
                isShared: !isPrimary,
              } as Mailbox;
            });

            allMailboxes.push(...mailboxes);
          }
        } catch (error) {
          console.error(`Failed to fetch mailboxes for account ${accountId}:`, error);
          // Continue with other accounts even if one fails
        }
      }

      return allMailboxes;
    } catch (error) {
      console.error("Failed to fetch all mailboxes:", error);
      // Fallback to primary account mailboxes
      return this.getMailboxes();
    }
  }

  async getEmails(mailboxId?: string, accountId?: string, limit: number = 50, position: number = 0): Promise<{ emails: Email[], hasMore: boolean, total: number }> {
    try {
      // Use provided accountId or fallback to primary account
      const targetAccountId = accountId || this.accountId;

      // Build filter - only add inMailbox if we have a mailboxId
      const filter: { inMailbox?: string } = {};
      if (mailboxId && mailboxId !== '') {
        filter.inMailbox = mailboxId;
      }

      const response = await this.request([
        ["Email/query", {
          accountId: targetAccountId,
          filter: filter,
          sort: [{ property: "receivedAt", isAscending: false }],
          limit: limit,
          position: position,
        }, "0"],
        ["Email/get", {
          accountId: targetAccountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "size",
            "receivedAt",
            "from",
            "to",
            "cc",
            "subject",
            "preview",
            "hasAttachment",
          ],
        }, "1"],
      ]);

      const queryResponse = response.methodResponses?.[0]?.[1];
      const getResponse = response.methodResponses?.[1]?.[1];

      if (response.methodResponses?.[1]?.[0] === "Email/get" && getResponse) {
        const emails = getResponse.list || [];

        // Stalwart doesn't return 'total', so we use a different strategy:
        // If we got exactly 'limit' emails, there might be more
        // If we got fewer, we've reached the end
        const total = queryResponse?.total || 0;
        const hasMore = total > 0
          ? (position + emails.length) < total  // Use total if available
          : emails.length === limit;             // Otherwise, check if we got a full page

        // If fetching from a shared account, namespace the mailboxIds to match our store
        const isSharedAccount = accountId && accountId !== this.accountId;
        if (isSharedAccount) {
          emails.forEach((email: Email) => {
            if (email.mailboxIds) {
              const namespacedMailboxIds: Record<string, boolean> = {};
              Object.keys(email.mailboxIds).forEach(mbId => {
                namespacedMailboxIds[`${accountId}:${mbId}`] = email.mailboxIds[mbId];
              });
              email.mailboxIds = namespacedMailboxIds;
            }
          });
        }

        return { emails, hasMore, total };
      }

      return { emails: [], hasMore: false, total: 0 };
    } catch (error) {
      console.error('Failed to get emails:', error);
      return { emails: [], hasMore: false, total: 0 };
    }
  }

  async getEmail(emailId: string, accountId?: string): Promise<Email | null> {
    try {
      // Use provided accountId or fallback to primary account
      const targetAccountId = accountId || this.accountId;

      const response = await this.request([
        ["Email/get", {
          accountId: targetAccountId,
          ids: [emailId],
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "size",
            "receivedAt",
            "sentAt",
            "from",
            "to",
            "cc",
            "bcc",
            "replyTo",
            "subject",
            "preview",
            "textBody",
            "htmlBody",
            "bodyValues",
            "hasAttachment",
            "attachments",
            "messageId",
            "inReplyTo",
            "references",
            "headers",
          ],
          fetchTextBodyValues: true,
          fetchHTMLBodyValues: true,
          fetchAllBodyValues: true,
          maxBodyValueBytes: 256000,
        }, "0"],
      ]);

      if (response.methodResponses?.[0]?.[0] === "Email/get") {
        const emails = response.methodResponses[0][1].list || [];
        const email = emails[0];

        if (email) {
          // If fetching from a shared account, namespace the mailboxIds to match our store
          const isSharedAccount = accountId && accountId !== this.accountId;
          if (isSharedAccount && email.mailboxIds) {
            const namespacedMailboxIds: Record<string, boolean> = {};
            Object.keys(email.mailboxIds).forEach(mbId => {
              namespacedMailboxIds[`${accountId}:${mbId}`] = email.mailboxIds[mbId];
            });
            email.mailboxIds = namespacedMailboxIds;
          }

          // Parse headers if available
          if (email.headers) {
            // Import the parsing functions
            const { parseAuthenticationResults, parseSpamScore, parseSpamLLM } = await import('@/lib/email-headers');

            // Convert headers array to Record format if needed
            let headersRecord: Record<string, string | string[]>;
            if (Array.isArray(email.headers)) {
              headersRecord = {};
              (email.headers as JMAPEmailHeader[]).forEach((header) => {
                if (header && header.name && header.value) {
                  // If header already exists, convert to array or append
                  if (headersRecord[header.name]) {
                    if (Array.isArray(headersRecord[header.name])) {
                      (headersRecord[header.name] as string[]).push(header.value);
                    } else {
                      headersRecord[header.name] = [headersRecord[header.name] as string, header.value];
                    }
                  } else {
                    headersRecord[header.name] = header.value;
                  }
                }
              });
              // Replace array with record for easier access
              email.headers = headersRecord;
            } else {
              headersRecord = email.headers as Record<string, string | string[]>;
            }

            // Parse Authentication-Results header
            const authResultsHeader = headersRecord['Authentication-Results'];
            if (authResultsHeader) {
              const headerValue = Array.isArray(authResultsHeader) ? authResultsHeader[0] : authResultsHeader;
              email.authenticationResults = parseAuthenticationResults(headerValue);
            }

            // Parse Spam headers
            const spamHeaders = ['X-Spam-Status', 'X-Spam-Result', 'X-Rspamd-Score'];
            for (const header of spamHeaders) {
              if (headersRecord[header]) {
                const headerValue = Array.isArray(headersRecord[header]) ? headersRecord[header][0] : headersRecord[header];
                const spamResult = parseSpamScore(headerValue as string);
                if (spamResult) {
                  email.spamScore = spamResult.score;
                  email.spamStatus = spamResult.status;
                  break;
                }
              }
            }

            // Parse X-Spam-LLM header
            if (headersRecord['X-Spam-LLM']) {
              const llmHeader = Array.isArray(headersRecord['X-Spam-LLM'])
                ? headersRecord['X-Spam-LLM'][0]
                : headersRecord['X-Spam-LLM'];
              const llmResult = parseSpamLLM(llmHeader as string);
              if (llmResult) {
                email.spamLLM = llmResult;
              }
            }
          }

          return email;
        }

        return null;
      }

      return null;
    } catch (error) {
      console.error('Failed to get email:', error);
      return null;
    }
  }

  async markAsRead(emailId: string, read: boolean = true, accountId?: string): Promise<void> {
    // Use provided accountId or fallback to primary account
    const targetAccountId = accountId || this.accountId;

    await this.request([
      ["Email/set", {
        accountId: targetAccountId,
        update: {
          [emailId]: {
            "keywords/$seen": read,
          },
        },
      }, "0"],
    ]);
  }

  async batchMarkAsRead(emailIds: string[], read: boolean = true): Promise<void> {
    if (emailIds.length === 0) return;

    const updates: Record<string, { "keywords/$seen": boolean }> = {};
    emailIds.forEach(id => {
      updates[id] = {
        "keywords/$seen": read,
      };
    });

    await this.request([
      ["Email/set", {
        accountId: this.accountId,
        update: updates,
      }, "0"],
    ]);
  }

  async toggleStar(emailId: string, starred: boolean): Promise<void> {
    await this.request([
      ["Email/set", {
        accountId: this.accountId,
        update: {
          [emailId]: {
            "keywords/$flagged": starred,
          },
        },
      }, "0"],
    ]);
  }

  async updateEmailKeywords(emailId: string, keywords: Record<string, boolean>): Promise<void> {
    await this.request([
      ["Email/set", {
        accountId: this.accountId,
        update: {
          [emailId]: {
            keywords,
          },
        },
      }, "0"],
    ]);
  }

  async deleteEmail(emailId: string): Promise<void> {
    await this.request([
      ["Email/set", {
        accountId: this.accountId,
        destroy: [emailId],
      }, "0"],
    ]);
  }

  async moveToTrash(emailId: string, trashMailboxId: string, accountId?: string): Promise<void> {
    const targetAccountId = accountId || this.accountId;
    await this.request([
      ["Email/set", {
        accountId: targetAccountId,
        update: {
          [emailId]: {
            mailboxIds: { [trashMailboxId]: true },
          },
        },
      }, "0"],
    ]);
  }

  async batchDeleteEmails(emailIds: string[]): Promise<void> {
    if (emailIds.length === 0) return;

    await this.request([
      ["Email/set", {
        accountId: this.accountId,
        destroy: emailIds,
      }, "0"],
    ]);
  }

  async batchMoveEmails(emailIds: string[], toMailboxId: string): Promise<void> {
    if (emailIds.length === 0) return;

    const updates: Record<string, { mailboxIds: Record<string, boolean> }> = {};
    emailIds.forEach(id => {
      updates[id] = {
        mailboxIds: { [toMailboxId]: true },
      };
    });

    await this.request([
      ["Email/set", {
        accountId: this.accountId,
        update: updates,
      }, "0"],
    ]);
  }

  async moveEmail(emailId: string, toMailboxId: string): Promise<void> {
    await this.request([
      ["Email/set", {
        accountId: this.accountId,
        update: {
          [emailId]: {
            mailboxIds: { [toMailboxId]: true },
          },
        },
      }, "0"],
    ]);
  }

  async searchEmails(query: string, limit: number = 50): Promise<Email[]> {
    try {
      const response = await this.request([
        ["Email/query", {
          accountId: this.accountId,
          filter: {
            text: query,
          },
          sort: [{ property: "receivedAt", isAscending: false }],
          limit: limit,
        }, "0"],
        ["Email/get", {
          accountId: this.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "size",
            "receivedAt",
            "from",
            "to",
            "cc",
            "subject",
            "preview",
            "hasAttachment",
          ],
        }, "1"],
      ]);

      if (response.methodResponses?.[1]?.[0] === "Email/get") {
        return response.methodResponses[1][1].list || [];
      }

      return [];
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  // Thread methods for conversation view
  async getThread(threadId: string, accountId?: string): Promise<Thread | null> {
    try {
      const targetAccountId = accountId || this.accountId;

      const response = await this.request([
        ["Thread/get", {
          accountId: targetAccountId,
          ids: [threadId],
        }, "0"],
      ]);

      if (response.methodResponses?.[0]?.[0] === "Thread/get") {
        const threads = response.methodResponses[0][1].list || [];
        return threads[0] || null;
      }

      return null;
    } catch (error) {
      console.error('Failed to get thread:', error);
      return null;
    }
  }

  async getThreadEmails(threadId: string, accountId?: string): Promise<Email[]> {
    try {
      const targetAccountId = accountId || this.accountId;

      // First get the thread to find all email IDs
      const thread = await this.getThread(threadId, accountId);
      if (!thread || !thread.emailIds || thread.emailIds.length === 0) {
        return [];
      }

      // Fetch all emails in the thread
      const response = await this.request([
        ["Email/get", {
          accountId: targetAccountId,
          ids: thread.emailIds,
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "size",
            "receivedAt",
            "from",
            "to",
            "cc",
            "subject",
            "preview",
            "hasAttachment",
          ],
        }, "0"],
      ]);

      if (response.methodResponses?.[0]?.[0] === "Email/get") {
        const emails = response.methodResponses[0][1].list || [];

        // If fetching from a shared account, namespace the mailboxIds
        const isSharedAccount = accountId && accountId !== this.accountId;
        if (isSharedAccount) {
          emails.forEach((email: Email) => {
            if (email.mailboxIds) {
              const namespacedMailboxIds: Record<string, boolean> = {};
              Object.keys(email.mailboxIds).forEach(mbId => {
                namespacedMailboxIds[`${accountId}:${mbId}`] = email.mailboxIds[mbId];
              });
              email.mailboxIds = namespacedMailboxIds;
            }
          });
        }

        // Sort by receivedAt descending (newest first)
        return emails.sort((a: Email, b: Email) =>
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        );
      }

      return [];
    } catch (error) {
      console.error('Failed to get thread emails:', error);
      return [];
    }
  }

  async createDraft(
    to: string[],
    subject: string,
    body: string,
    cc?: string[],
    bcc?: string[],
    draftId?: string,
    attachments?: Array<{ blobId: string; name: string; type: string; size: number }>
  ): Promise<string> {
    // Find the drafts mailbox
    const mailboxes = await this.getMailboxes();
    const draftsMailbox = mailboxes.find(mb => mb.role === 'drafts');

    if (!draftsMailbox) {
      throw new Error('No drafts mailbox found');
    }

    const emailId = `draft-${Date.now()}`;

    // Build email object with attachments if provided
    interface EmailDraft {
      from: { email: string }[];
      to: { email: string }[];
      cc?: { email: string }[];
      bcc?: { email: string }[];
      subject: string;
      keywords: Record<string, boolean>;
      mailboxIds: Record<string, boolean>;
      bodyValues: Record<string, { value: string }>;
      textBody: { partId: string }[];
      attachments?: { blobId: string; type: string; name: string; disposition: string }[];
    }
    const emailData: EmailDraft = {
      from: [{ email: this.username }],
      to: to.map(email => ({ email })),
      cc: cc?.map(email => ({ email })),
      bcc: bcc?.map(email => ({ email })),
      subject: subject,
      keywords: { "$draft": true },
      mailboxIds: { [draftsMailbox.id]: true },
      bodyValues: {
        "1": {
          value: body,
        },
      },
      textBody: [
        {
          partId: "1",
        },
      ],
    };

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      emailData.attachments = attachments.map(att => ({
        blobId: att.blobId,
        type: att.type,
        name: att.name,
        disposition: "attachment",
      }));
    }

    // If updating an existing draft, destroy it first then create new one
    // This is simpler than trying to update individual fields
    const methodCalls: JMAPMethodCall[] = [];

    if (draftId) {
      // Delete old draft
      methodCalls.push(["Email/set", {
        accountId: this.accountId,
        destroy: [draftId],
      }, "0"]);

      // Create new draft
      methodCalls.push(["Email/set", {
        accountId: this.accountId,
        create: {
          [emailId]: emailData
        },
      }, "1"]);
    } else {
      // Just create new draft
      methodCalls.push(["Email/set", {
        accountId: this.accountId,
        create: {
          [emailId]: emailData
        },
      }, "0"]);
    }

    const response = await this.request(methodCalls);

    console.log('Draft save response:', JSON.stringify(response, null, 2));

    // If we're updating (destroy + create), check the second response
    // Otherwise check the first response
    const responseIndex = draftId ? 1 : 0;

    if (response.methodResponses?.[responseIndex]?.[0] === "Email/set") {
      const result = response.methodResponses[responseIndex][1];

      // Check for errors
      if (result.notCreated || result.notUpdated) {
        const errors = result.notCreated || result.notUpdated;
        const firstError = Object.values(errors)[0] as { description?: string; type?: string };
        console.error('Draft save error:', firstError);
        throw new Error(firstError?.description || firstError?.type || 'Failed to save draft');
      }

      if (result.created?.[emailId]) {
        console.log('Draft created successfully:', result.created[emailId].id);
        return result.created[emailId].id;
      }
    }

    console.error('Unexpected draft save response:', response);
    throw new Error('Failed to save draft');
  }

  async sendEmail(
    to: string[],
    subject: string,
    body: string,
    cc?: string[],
    bcc?: string[],
    draftId?: string
  ): Promise<void> {
    const emailId = draftId || `draft-${Date.now()}`;

    // Find the Sent mailbox
    const mailboxes = await this.getMailboxes();
    const sentMailbox = mailboxes.find(mb => mb.role === 'sent');

    if (!sentMailbox) {
      throw new Error('No sent mailbox found');
    }

    // Get the identity ID - fetch identities from server
    const identityResponse = await this.request([
      ["Identity/get", {
        accountId: this.accountId,
      }, "0"]
    ]);

    let identityId = this.accountId; // fallback

    if (identityResponse.methodResponses?.[0]?.[0] === "Identity/get") {
      const identities = (identityResponse.methodResponses[0][1].list || []) as { id: string; email: string }[];

      if (identities.length > 0) {
        // Use the first identity (or find one matching the username)
        const matchingIdentity = identities.find((id) => id.email === this.username);
        identityId = matchingIdentity?.id || identities[0].id;
      }
    }

    const methodCalls: JMAPMethodCall[] = [];

    // If we have a draftId, update it and remove draft keyword, move to Sent
    // Otherwise, create a new email in Sent
    if (draftId) {
      methodCalls.push(["Email/set", {
        accountId: this.accountId,
        update: {
          [draftId]: {
            "keywords/$draft": false,
            "keywords/$seen": true,
            mailboxIds: { [sentMailbox.id]: true },
          },
        },
      }, "0"]);
      methodCalls.push(["EmailSubmission/set", {
        accountId: this.accountId,
        create: {
          "1": {
            emailId: draftId,
            identityId: identityId,
          },
        },
      }, "1"]);
    } else {
      methodCalls.push(["Email/set", {
        accountId: this.accountId,
        create: {
          [emailId]: {
            from: [{ email: this.username }],
            to: to.map(email => ({ email })),
            cc: cc?.map(email => ({ email })),
            bcc: bcc?.map(email => ({ email })),
            subject: subject,
            keywords: { "$seen": true },
            mailboxIds: { [sentMailbox.id]: true },
            bodyValues: {
              "1": {
                value: body,
              },
            },
            textBody: [
              {
                partId: "1",
              },
            ],
          },
        },
      }, "0"]);
      methodCalls.push(["EmailSubmission/set", {
        accountId: this.accountId,
        create: {
          "1": {
            emailId: `#${emailId}`,
            identityId: identityId,
          },
        },
      }, "1"]);
    }

    const response = await this.request(methodCalls);

    // Check for errors in the response
    if (response.methodResponses) {
      for (const [methodName, result] of response.methodResponses) {
        if (methodName.endsWith('/error')) {
          console.error('JMAP method error:', result);
          throw new Error(result.description || `Failed to send email: ${result.type}`);
        }

        // Check for notCreated/notUpdated
        if (result.notCreated || result.notUpdated) {
          const errors = result.notCreated || result.notUpdated;
          const firstError = Object.values(errors)[0] as { description?: string; type?: string };
          console.error('Email send error:', firstError);
          throw new Error(firstError?.description || firstError?.type || 'Failed to send email');
        }
      }
    }
  }

  async uploadBlob(file: File): Promise<{ blobId: string; size: number; type: string }> {
    if (!this.session) {
      throw new Error('Not connected. Call connect() first.');
    }

    // Get upload URL from session
    const uploadUrl = this.session.uploadUrl;
    if (!uploadUrl) {
      throw new Error('Upload URL not available');
    }

    // Replace accountId in the upload URL
    const finalUploadUrl = uploadUrl.replace('{accountId}', encodeURIComponent(this.accountId));
    console.log('Uploading file to:', finalUploadUrl);
    console.log('File info:', { name: file.name, size: file.size, type: file.type });

    const response = await fetch(finalUploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file, // Send the file directly as binary
    });

    console.log('Upload response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upload failed:', errorText);
      throw new Error(`Failed to upload file: ${response.status} - ${errorText}`);
    }

    const responseText = await response.text();
    console.log('Upload response body:', responseText);

    let result;
    try {
      result = JSON.parse(responseText);
      console.log('Parsed upload response:', JSON.stringify(result, null, 2));
    } catch {
      console.error('Failed to parse upload response as JSON:', responseText);
      throw new Error('Invalid JSON response from upload');
    }

    // Try different response formats
    // Format 1: Direct response { blobId, type, size }
    if (result.blobId) {
      console.log('Using direct response format');
      return {
        blobId: result.blobId,
        size: result.size || file.size,
        type: result.type || file.type,
      };
    }

    // Format 2: Nested under accountId { accountId: { blobId, type, size } }
    const blobInfo = result[this.accountId];
    if (blobInfo && blobInfo.blobId) {
      console.log('Using accountId-nested response format');
      return {
        blobId: blobInfo.blobId,
        size: blobInfo.size || file.size,
        type: blobInfo.type || file.type,
      };
    }

    // If neither format works, show what we got
    console.error('Unexpected upload response format:', result);
    throw new Error('Invalid upload response: blobId not found');
  }

  getBlobDownloadUrl(blobId: string, name?: string, type?: string): string {
    if (!this.downloadUrl) {
      throw new Error('Download URL not available. Please reconnect.');
    }

    // The downloadUrl is a URI Template (RFC 6570 level 1) with variables
    // like {accountId}, {blobId}, {name}, and {type}
    let url = this.downloadUrl;

    // Replace template variables with actual values
    url = url.replace('{accountId}', encodeURIComponent(this.accountId));
    url = url.replace('{blobId}', encodeURIComponent(blobId));

    // Replace {name} - use a default if not provided
    const fileName = name || 'download';
    url = url.replace('{name}', encodeURIComponent(fileName));

    // Replace {type} - URL encode it since it may contain slashes (e.g., "application/pdf")
    // If type is not provided, use a generic binary type
    const mimeType = type || 'application/octet-stream';
    url = url.replace('{type}', encodeURIComponent(mimeType));

    return url;
  }

  // Capability checking methods
  getCapabilities(): Record<string, unknown> {
    return this.capabilities;
  }

  hasCapability(capability: string): boolean {
    return capability in this.capabilities;
  }

  getMaxSizeUpload(): number {
    const coreCapability = this.capabilities["urn:ietf:params:jmap:core"] as { maxSizeUpload?: number } | undefined;
    return coreCapability?.maxSizeUpload || 0;
  }

  getMaxCallsInRequest(): number {
    const coreCapability = this.capabilities["urn:ietf:params:jmap:core"] as { maxCallsInRequest?: number } | undefined;
    return coreCapability?.maxCallsInRequest || 50;
  }

  getEventSourceUrl(): string | null {
    const session = this.session;
    if (!session) {
      return null;
    }
    // RFC 8620: eventSourceUrl is at session root level
    if (session.eventSourceUrl) {
      return session.eventSourceUrl;
    }
    // Some servers may put it in capabilities
    const coreCapability = session.capabilities?.["urn:ietf:params:jmap:core"] as { eventSourceUrl?: string } | undefined;
    if (coreCapability?.eventSourceUrl) {
      return coreCapability.eventSourceUrl;
    }
    return null;
  }

  getAccountId(): string {
    return this.accountId;
  }

  supportsEmailSubmission(): boolean {
    return this.hasCapability("urn:ietf:params:jmap:submission");
  }

  supportsQuota(): boolean {
    return this.hasCapability("urn:ietf:params:jmap:quota");
  }

  supportsVacationResponse(): boolean {
    return this.hasCapability("urn:ietf:params:jmap:vacationresponse");
  }

  async downloadBlob(blobId: string, name?: string, type?: string): Promise<void> {
    const url = this.getBlobDownloadUrl(blobId, name, type);

    const response = await fetch(url, {
      headers: {
        'Authorization': this.authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download attachment: ${response.status}`);
    }

    // Get the blob from the response
    const blob = await response.blob();

    // Create a temporary URL for the blob
    const blobUrl = URL.createObjectURL(blob);

    // Create a temporary anchor element and trigger download
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = name || 'download';
    document.body.appendChild(a);
    a.click();

    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }

  // Real-time Updates via Polling (EventSource has auth limitations with Basic Auth)
  private pollingInterval: NodeJS.Timeout | null = null;
  private pollingStates: { [key: string]: string } = {};

  setupPushNotifications(): boolean {
    // Use polling instead of EventSource due to Basic Auth limitations
    // EventSource can't send Authorization headers, and URL-embedded credentials
    // get decoded by browsers, breaking auth for usernames/passwords with special chars

    // Initial state fetch
    this.fetchCurrentStates();

    // Set up polling interval
    this.pollingInterval = setInterval(() => {
      this.checkForStateChanges();
    }, 15000); // Poll every 15 seconds

    return true;
  }

  private async fetchCurrentStates(): Promise<void> {
    try {
      // Get current states from server using JMAP query
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.authHeader,
        },
        body: JSON.stringify({
          using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
          methodCalls: [
            ['Mailbox/get', { accountId: this.accountId, ids: null, properties: ['id'] }, 'a'],
            ['Email/get', { accountId: this.accountId, ids: [], properties: ['id'] }, 'b'],
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Extract states from response
        for (const [method, result] of data.methodResponses) {
          if (method === 'Mailbox/get' && result.state) {
            this.pollingStates['Mailbox'] = result.state;
          }
          if (method === 'Email/get' && result.state) {
            this.pollingStates['Email'] = result.state;
          }
        }
      }
    } catch {
      // Silently fail - polling will retry
    }
  }

  private async checkForStateChanges(): Promise<void> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.authHeader,
        },
        body: JSON.stringify({
          using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
          methodCalls: [
            ['Mailbox/get', { accountId: this.accountId, ids: null, properties: ['id'] }, 'a'],
            ['Email/get', { accountId: this.accountId, ids: [], properties: ['id'] }, 'b'],
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const changes: { [key: string]: string } = {};
        let hasChanges = false;

        for (const [method, result] of data.methodResponses) {
          if (method === 'Mailbox/get' && result.state) {
            if (this.pollingStates['Mailbox'] && this.pollingStates['Mailbox'] !== result.state) {
              changes['Mailbox'] = result.state;
              hasChanges = true;
            }
            this.pollingStates['Mailbox'] = result.state;
          }
          if (method === 'Email/get' && result.state) {
            if (this.pollingStates['Email'] && this.pollingStates['Email'] !== result.state) {
              changes['Email'] = result.state;
              hasChanges = true;
            }
            this.pollingStates['Email'] = result.state;
          }
        }

        if (hasChanges && this.stateChangeCallback) {
          this.stateChangeCallback({
            '@type': 'StateChange',
            changed: {
              [this.accountId]: changes,
            },
          });
        }
      }
    } catch {
      // Silently fail - polling will retry
    }
  }

  closePushNotifications(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.stateChangeCallback = null;
    this.pollingStates = {};
  }

  onStateChange(callback: (change: StateChange) => void): void {
    this.stateChangeCallback = callback;
  }

  getLastStates(): AccountStates {
    return { ...this.lastStates };
  }

  setLastStates(states: AccountStates): void {
    this.lastStates = { ...states };
  }
}