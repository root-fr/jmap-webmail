import type { Email, Mailbox, StateChange, AccountStates, Thread, Identity, EmailAddress, ContactCard, AddressBook, VacationResponse, Calendar, CalendarEvent, CalendarEventFilter } from "./types";
import type { SieveScript, SieveCapabilities } from "./sieve-types";
import { retryWithBackoff } from './retry';

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

type JMAPMethodCall = [string, Record<string, unknown>, string];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JMAP responses have schema-variable nested payloads
type JMAPResponseResult = Record<string, any>;

interface JMAPResponse {
  methodResponses: Array<[string, JMAPResponseResult, string]>;
}

export class JMAPSetError extends Error {
  type: string;
  description?: string;
  constructor(type: string, description?: string) {
    super(description || `Mailbox/set error: ${type}`);
    this.name = 'JMAPSetError';
    this.type = type;
    this.description = description;
  }
}

const DEFAULT_MAILBOX_RIGHTS = {
  mayReadItems: true,
  mayAddItems: true,
  mayRemoveItems: true,
  maySetSeen: true,
  maySetKeywords: true,
  mayCreateChild: true,
  mayRename: true,
  mayDelete: true,
  maySubmit: true,
} as const;

const EMAIL_LIST_PROPERTIES = [
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
] as const;

const CALENDAR_EVENT_PROPERTIES = [
  "id",
  "uid",
  "calendarIds",
  "title",
  "description",
  "descriptionContentType",
  "start",
  "duration",
  "timeZone",
  "showWithoutTime",
  "status",
  "freeBusyStatus",
  "privacy",
  "color",
  "keywords",
  "locations",
  "virtualLocations",
  "links",
  "participants",
  "organizerCalendarAddress",
  "alerts",
  "recurrenceRules",
  "excludedRecurrenceRules",
  "recurrenceOverrides",
  "recurrenceId",
  "isOrigin",
] as const;

function namespaceMailboxIds(emails: Email[], accountId: string): void {
  for (const email of emails) {
    if (!email.mailboxIds) continue;
    const namespaced: Record<string, boolean> = {};
    for (const mbId of Object.keys(email.mailboxIds)) {
      namespaced[`${accountId}:${mbId}`] = email.mailboxIds[mbId];
    }
    email.mailboxIds = namespaced;
  }
}

function computeHasMore(position: number, emailCount: number, total: number, limit: number): boolean {
  if (total > 0) return (position + emailCount) < total;
  return emailCount === limit;
}

export class JMAPClient {
  private serverUrl: string;
  private username: string;
  private password: string;
  private authHeader: string;
  private authMode: 'basic' | 'bearer' = 'basic';
  private onTokenRefresh?: () => Promise<string | null>;
  private apiUrl: string = "";
  private accountId: string = "";
  private downloadUrl: string = "";
  private capabilities: Record<string, unknown> = {};
  private session: JMAPSession | null = null;
  private lastPingTime: number = 0;
  private pingInterval: NodeJS.Timeout | null = null;
  private accounts: Record<string, JMAPAccount> = {};
  private eventSource: EventSource | null = null;
  private stateChangeCallback: ((change: StateChange) => void) | null = null;
  private lastStates: AccountStates = {};

  constructor(serverUrl: string, username: string, password: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.username = username;
    this.password = password;
    this.authHeader = `Basic ${btoa(`${username}:${password}`)}`;
  }

  static withBearer(
    serverUrl: string,
    accessToken: string,
    username: string,
    onTokenRefresh?: () => Promise<string | null>,
  ): JMAPClient {
    const client = new JMAPClient(serverUrl, username, '');
    client.authMode = 'bearer';
    client.authHeader = `Bearer ${accessToken}`;
    client.onTokenRefresh = onTokenRefresh;
    return client;
  }

  updateAccessToken(token: string): void {
    this.authHeader = `Bearer ${token}`;
  }

  private async authenticatedFetch(
    url: string,
    init?: Parameters<typeof fetch>[1],
    options?: { retry?: boolean }
  ): Promise<Response> {
    const headers = { ...init?.headers as Record<string, string>, 'Authorization': this.authHeader };
    const doFetch = () => fetch(url, { ...init, headers });

    let response: Response;
    if (options?.retry !== false) {
      response = await retryWithBackoff(doFetch, {
        signal: init?.signal as AbortSignal | undefined,
      });
    } else {
      response = await doFetch();
    }

    if (response.status === 401 && this.authMode === 'bearer' && this.onTokenRefresh) {
      const newToken = await this.onTokenRefresh();
      if (newToken) {
        this.updateAccessToken(newToken);
        const retryHeaders = { ...init?.headers as Record<string, string>, 'Authorization': this.authHeader };
        response = await fetch(url, { ...init, headers: retryHeaders });
      }
    }

    return response;
  }

  async connect(): Promise<void> {
    const sessionUrl = `${this.serverUrl}/.well-known/jmap`;

    try {
      const sessionResponse = await this.authenticatedFetch(sessionUrl, {
        method: 'GET',
      });

      if (!sessionResponse.ok) {
        if (sessionResponse.status === 401) {
          throw new Error(this.authMode === 'bearer'
            ? 'Authentication failed - token may be expired'
            : 'Invalid username or password');
        }
        throw new Error(`Failed to get session: ${sessionResponse.status}`);
      }

      const session = await sessionResponse.json();
      this.rewriteSessionUrls(session);

      this.session = session;
      this.capabilities = session.capabilities || {};
      this.apiUrl = session.apiUrl;
      this.downloadUrl = session.downloadUrl;
      this.accounts = session.accounts || {};

      const mailAccount = session.primaryAccounts?.["urn:ietf:params:jmap:mail"];
      const fallbackAccount = Object.keys(this.accounts)[0];
      this.accountId = mailAccount || fallbackAccount;

      if (!this.accountId) {
        throw new Error('No mail account found in session');
      }

      this.startKeepAlive();
    } catch (error) {
      if (error instanceof TypeError && (error.message === 'Failed to fetch' || error.message.includes('NetworkError'))) {
        let serverReachable = false;
        try {
          await fetch(sessionUrl, { mode: 'no-cors' });
          serverReachable = true;
        } catch { /* genuinely unreachable */ }
        if (serverReachable) {
          throw new Error('CORS_ERROR');
        }
      }
      throw error;
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();

    this.pingInterval = setInterval(async () => {
      try {
        await this.ping();
      } catch {
        try {
          await this.reconnect();
        } catch {
          return;
        }
      }
    }, 30_000);
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
    const response = await this.request([
      ["Core/echo", { ping: "pong" }, "0"]
    ]);

    if (response.methodResponses?.[0]?.[0] !== "Core/echo") {
      throw new Error('Ping failed');
    }
    this.lastPingTime = now;
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

  private rewriteSessionUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const server = new URL(this.serverUrl);
      if (parsed.origin === server.origin) return url;
      const pathAndRest = url.slice(url.indexOf('/', url.indexOf('//') + 2));
      return server.origin + pathAndRest;
    } catch {
      return url;
    }
  }

  private rewriteSessionUrls(session: JMAPSession): void {
    session.apiUrl = this.rewriteSessionUrl(session.apiUrl);
    session.downloadUrl = this.rewriteSessionUrl(session.downloadUrl);
    if (session.uploadUrl) {
      session.uploadUrl = this.rewriteSessionUrl(session.uploadUrl);
    }
    if (session.eventSourceUrl) {
      session.eventSourceUrl = this.rewriteSessionUrl(session.eventSourceUrl);
    }
  }

  private async request(methodCalls: JMAPMethodCall[], using?: string[]): Promise<JMAPResponse> {
    if (!this.apiUrl) {
      throw new Error('Not connected. Call connect() first.');
    }

    const requestBody = {
      using: using || ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls,
    };

    const response = await this.authenticatedFetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} - ${responseText.substring(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
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
        ["Mailbox/get", { accountId: this.accountId }, "0"]
      ]);

      if (response.methodResponses?.[0]?.[0] === "Mailbox/get") {
        const rawMailboxes = (response.methodResponses[0][1].list || []) as JMAPMailbox[];

        return rawMailboxes.map((mb) => ({
          id: mb.id,
          originalId: undefined,
          name: mb.name,
          parentId: mb.parentId || undefined,
          role: mb.role || undefined,
          sortOrder: mb.sortOrder ?? 0,
          totalEmails: mb.totalEmails ?? 0,
          unreadEmails: mb.unreadEmails ?? 0,
          totalThreads: mb.totalThreads ?? 0,
          unreadThreads: mb.unreadThreads ?? 0,
          myRights: mb.myRights || DEFAULT_MAILBOX_RIGHTS,
          isSubscribed: mb.isSubscribed ?? true,
          accountId: this.accountId,
          accountName: this.accounts[this.accountId]?.name || this.username,
          isShared: false,
        }) as Mailbox);
      }

      throw new Error('Unexpected response format');
    } catch {
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
        myRights: DEFAULT_MAILBOX_RIGHTS,
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
      const accountIds = Object.keys(this.accounts);

      if (accountIds.length === 0) {
        return this.getMailboxes();
      }

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

            const mailboxes = rawMailboxes.map((mb) => ({
              id: isPrimary ? mb.id : `${accountId}:${mb.id}`,
              originalId: mb.id,
              name: mb.name,
              parentId: mb.parentId ? (isPrimary ? mb.parentId : `${accountId}:${mb.parentId}`) : undefined,
              role: mb.role || undefined,
              sortOrder: mb.sortOrder ?? 0,
              totalEmails: mb.totalEmails ?? 0,
              unreadEmails: mb.unreadEmails ?? 0,
              totalThreads: mb.totalThreads ?? 0,
              unreadThreads: mb.unreadThreads ?? 0,
              myRights: mb.myRights || DEFAULT_MAILBOX_RIGHTS,
              isSubscribed: mb.isSubscribed ?? true,
              accountId,
              accountName: account?.name || (isPrimary ? this.username : accountId),
              isShared: !isPrimary,
            }) as Mailbox);

            allMailboxes.push(...mailboxes);
          }
        } catch {
          continue;
        }
      }

      return allMailboxes;
    } catch {
      return this.getMailboxes();
    }
  }

  async getEmails(mailboxId?: string, accountId?: string, limit: number = 50, position: number = 0): Promise<{ emails: Email[], hasMore: boolean, total: number }> {
    try {
      const targetAccountId = accountId || this.accountId;
      const filter: { inMailbox?: string } = {};
      if (mailboxId) {
        filter.inMailbox = mailboxId;
      }

      const response = await this.request([
        ["Email/query", {
          accountId: targetAccountId,
          filter,
          sort: [{ property: "receivedAt", isAscending: false }],
          limit,
          position,
        }, "0"],
        ["Email/get", {
          accountId: targetAccountId,
          "#ids": { resultOf: "0", name: "Email/query", path: "/ids" },
          properties: [...EMAIL_LIST_PROPERTIES],
        }, "1"],
      ]);

      const queryResponse = response.methodResponses?.[0]?.[1];
      const getResponse = response.methodResponses?.[1]?.[1];

      if (response.methodResponses?.[1]?.[0] === "Email/get" && getResponse) {
        const emails = getResponse.list || [];
        const total = queryResponse?.total || 0;
        const hasMore = computeHasMore(position, emails.length, total, limit);

        if (accountId && accountId !== this.accountId) {
          namespaceMailboxIds(emails, accountId);
        }

        return { emails, hasMore, total };
      }

      return { emails: [], hasMore: false, total: 0 };
    } catch {
      return { emails: [], hasMore: false, total: 0 };
    }
  }

  async getEmail(emailId: string, accountId?: string): Promise<Email | null> {
    try {
      const targetAccountId = accountId || this.accountId;

      const response = await this.request([
        ["Email/get", {
          accountId: targetAccountId,
          ids: [emailId],
          properties: [
            "id", "threadId", "mailboxIds", "keywords", "size",
            "receivedAt", "sentAt", "from", "to", "cc", "bcc", "replyTo",
            "subject", "preview", "textBody", "htmlBody", "bodyValues",
            "hasAttachment", "attachments", "messageId", "inReplyTo",
            "references", "headers",
          ],
          fetchTextBodyValues: true,
          fetchHTMLBodyValues: true,
          fetchAllBodyValues: true,
          maxBodyValueBytes: 256000,
        }, "0"],
      ]);

      if (response.methodResponses?.[0]?.[0] !== "Email/get") {
        return null;
      }

      const email = (response.methodResponses[0][1].list || [])[0];
      if (!email) return null;

      if (accountId && accountId !== this.accountId) {
        namespaceMailboxIds([email], accountId);
      }

      if (email.headers) {
        await this.parseEmailHeaders(email);
      }

      return email;
    } catch {
      return null;
    }
  }

  private async parseEmailHeaders(email: Email): Promise<void> {
    const { parseAuthenticationResults, parseSpamScore, parseSpamLLM } = await import('@/lib/email-headers');

    let headersRecord: Record<string, string | string[]>;
    if (Array.isArray(email.headers)) {
      headersRecord = {};
      for (const header of email.headers as unknown as JMAPEmailHeader[]) {
        if (!header?.name || !header?.value) continue;
        const existing = headersRecord[header.name];
        if (existing) {
          headersRecord[header.name] = Array.isArray(existing)
            ? [...existing, header.value]
            : [existing, header.value];
        } else {
          headersRecord[header.name] = header.value;
        }
      }
      email.headers = headersRecord;
    } else {
      headersRecord = email.headers as Record<string, string | string[]>;
    }

    const authResultsHeader = headersRecord['Authentication-Results'];
    if (authResultsHeader) {
      const value = Array.isArray(authResultsHeader) ? authResultsHeader[0] : authResultsHeader;
      email.authenticationResults = parseAuthenticationResults(value);
    }

    for (const headerName of ['X-Spam-Status', 'X-Spam-Result', 'X-Rspamd-Score']) {
      if (!headersRecord[headerName]) continue;
      const value = Array.isArray(headersRecord[headerName]) ? headersRecord[headerName][0] : headersRecord[headerName];
      const spamResult = parseSpamScore(value as string);
      if (spamResult) {
        email.spamScore = spamResult.score;
        email.spamStatus = spamResult.status;
        break;
      }
    }

    const llmHeader = headersRecord['X-Spam-LLM'];
    if (llmHeader) {
      const value = Array.isArray(llmHeader) ? llmHeader[0] : llmHeader;
      const llmResult = parseSpamLLM(value as string);
      if (llmResult) {
        email.spamLLM = llmResult;
      }
    }
  }

  async markAsRead(emailId: string, read: boolean = true, accountId?: string): Promise<void> {
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

  /**
   * JMAP Email/set reports per-id failures in notUpdated/notDestroyed maps and
   * still returns HTTP 200, so request() will not throw. A batch set against the
   * wrong account (e.g. a shared mailbox run against the primary accountId) lands
   * every id in these maps; without this check the store would optimistically
   * mutate rows the server never touched and the next poll resurrects them.
   */
  private assertNoBatchFailures(response: JMAPResponse, kind: "update" | "destroy"): void {
    const result = response.methodResponses?.[0]?.[1];
    const failed: Record<string, { type?: string; description?: string }> | undefined =
      kind === "update" ? result?.notUpdated : result?.notDestroyed;
    if (!failed) return;
    const ids = Object.keys(failed);
    if (ids.length > 0) {
      const first = failed[ids[0]];
      throw new JMAPSetError(first?.type || "unknown", first?.description || `Email/set failed to ${kind} ${ids.length} email(s)`);
    }
  }

  async batchMarkAsRead(emailIds: string[], read: boolean = true, accountId?: string): Promise<void> {
    if (emailIds.length === 0) return;

    const targetAccountId = accountId || this.accountId;
    const updates = Object.fromEntries(emailIds.map(id => [id, { "keywords/$seen": read }]));
    const response = await this.request([
      ["Email/set", { accountId: targetAccountId, update: updates }, "0"],
    ]);
    this.assertNoBatchFailures(response, "update");
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

  async deleteEmail(emailId: string, accountId?: string): Promise<void> {
    await this.request([
      ["Email/set", {
        accountId: accountId || this.accountId,
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

  async batchDeleteEmails(emailIds: string[], accountId?: string): Promise<void> {
    if (emailIds.length === 0) return;

    const targetAccountId = accountId || this.accountId;
    const response = await this.request([
      ["Email/set", {
        accountId: targetAccountId,
        destroy: emailIds,
      }, "0"],
    ]);
    this.assertNoBatchFailures(response, "destroy");
  }

  async queryTagCounts(tags: string[]): Promise<Record<string, number>> {
    if (tags.length === 0) return {};

    const methodCalls: JMAPMethodCall[] = tags.map((tag, i) => [
      "Email/query",
      {
        accountId: this.accountId,
        filter: { hasKeyword: `$color:${tag}` },
        calculateTotal: true,
        limit: 0,
      },
      `tag-${i}`,
    ]);

    const response = await this.request(methodCalls);
    const counts: Record<string, number> = {};

    response.methodResponses?.forEach(([method, result], i) => {
      if (method === "Email/query" && result?.total > 0) {
        counts[tags[i]] = result.total;
      }
    });

    return counts;
  }

  async queryMailboxEmailIds(mailboxId: string, limit: number = 500, position: number = 0): Promise<{ ids: string[]; total: number }> {
    const response = await this.request([
      ["Email/query", {
        accountId: this.accountId,
        filter: { inMailbox: mailboxId },
        sort: [{ property: "receivedAt", isAscending: false }],
        calculateTotal: true,
        limit,
        position,
      }, "0"],
    ]);

    const queryResult = response.methodResponses?.[0]?.[1];
    return {
      ids: queryResult?.ids || [],
      total: queryResult?.total || 0,
    };
  }

  async batchMoveEmails(emailIds: string[], toMailboxId: string, accountId?: string): Promise<void> {
    if (emailIds.length === 0) return;

    const targetAccountId = accountId || this.accountId;
    const updates = Object.fromEntries(emailIds.map(id => [id, { mailboxIds: { [toMailboxId]: true } }]));
    const response = await this.request([
      ["Email/set", { accountId: targetAccountId, update: updates }, "0"],
    ]);
    this.assertNoBatchFailures(response, "update");
  }

  /**
   * Move a thread's messages from a source mailbox to a destination mailbox.
   * Thread/get spans every mailbox the conversation touches, so a full
   * mailboxIds replacement would yank the user's own replies out of Sent and
   * drafts out of Drafts. Instead, fetch current membership and emit JMAP
   * patch pointers that detach only the source mailbox, skipping messages
   * that aren't in the source mailbox. Returns the ids that were moved so the
   * caller can reconcile local state.
   */
  async moveThreadToMailbox(threadId: string, toMailboxId: string, fromMailboxId: string, accountId?: string): Promise<string[]> {
    const targetAccountId = accountId || this.accountId;
    const thread = await this.getThread(threadId, accountId);
    const ids = thread?.emailIds ?? [];
    if (ids.length === 0) return [];

    const membership = await this.request([
      ["Email/get", { accountId: targetAccountId, ids, properties: ["mailboxIds"] }, "0"],
    ]);
    const emails = membership.methodResponses?.[0]?.[1]?.list ?? [];

    const update: Record<string, Record<string, unknown>> = {};
    const moved: string[] = [];
    for (const e of emails) {
      if (!e.mailboxIds?.[fromMailboxId]) continue;
      update[e.id] = {
        [`mailboxIds/${fromMailboxId}`]: null,
        [`mailboxIds/${toMailboxId}`]: true,
      };
      moved.push(e.id);
    }
    if (moved.length === 0) return [];

    await this.request([
      ["Email/set", { accountId: targetAccountId, update }, "0"],
    ]);
    return moved;
  }

  async createMailbox(name: string, parentId?: string): Promise<string> {
    const create: Record<string, unknown> = { name };
    if (parentId) create.parentId = parentId;

    const response = await this.request([
      ["Mailbox/set", {
        accountId: this.accountId,
        create: { "new-mailbox": create },
      }, "0"],
    ]);

    const result = response.methodResponses?.[0]?.[1];
    if (result?.notCreated?.["new-mailbox"]) {
      const err = result.notCreated["new-mailbox"];
      throw new JMAPSetError(err.type || "unknown", err.description);
    }

    const realId = result?.created?.["new-mailbox"]?.id;
    if (!realId) throw new JMAPSetError("unknown", "Server did not return created mailbox ID");
    return realId;
  }

  async updateMailbox(id: string, changes: { name?: string; parentId?: string | null }): Promise<void> {
    const response = await this.request([
      ["Mailbox/set", {
        accountId: this.accountId,
        update: { [id]: changes },
      }, "0"],
    ]);

    const result = response.methodResponses?.[0]?.[1];
    if (result?.notUpdated?.[id]) {
      const err = result.notUpdated[id];
      throw new JMAPSetError(err.type || "unknown", err.description);
    }
  }

  async destroyMailbox(id: string): Promise<void> {
    const response = await this.request([
      ["Mailbox/set", {
        accountId: this.accountId,
        destroy: [id],
        onDestroyRemoveEmails: false,
      }, "0"],
    ]);

    const result = response.methodResponses?.[0]?.[1];
    if (result?.notDestroyed?.[id]) {
      const err = result.notDestroyed[id];
      throw new JMAPSetError(err.type || "unknown", err.description);
    }
  }

  async moveEmail(emailId: string, toMailboxId: string, accountId?: string): Promise<void> {
    const targetAccountId = accountId || this.accountId;
    const response = await this.request([
      ["Email/set", {
        accountId: targetAccountId,
        update: {
          [emailId]: {
            mailboxIds: { [toMailboxId]: true },
          },
        },
      }, "0"],
    ]);

    const result = response.methodResponses?.[0]?.[1];
    if (result?.notUpdated?.[emailId]) {
      throw new Error(`Failed to move email: ${result.notUpdated[emailId].type || 'unknown error'}`);
    }
  }

  async markAsSpam(emailId: string, accountId?: string): Promise<void> {
    const targetAccountId = accountId || this.accountId;

    const mailboxes = await this.getMailboxes();
    const junkMailbox = mailboxes.find(m => {
      if (accountId) {
        return m.role === 'junk' && m.accountId === accountId;
      }
      return m.role === 'junk' && !m.isShared;
    });

    if (!junkMailbox) {
      throw new Error('Junk mailbox not found');
    }

    const mailboxId = accountId && junkMailbox.originalId
      ? junkMailbox.originalId
      : junkMailbox.id;

    await this.request([
      ["Email/set", {
        accountId: targetAccountId,
        update: {
          [emailId]: {
            mailboxIds: { [mailboxId]: true },
          },
        },
      }, "0"],
    ]);
  }

  async undoSpam(emailId: string, originalMailboxId: string, accountId?: string): Promise<void> {
    const targetAccountId = accountId || this.accountId;

    await this.request([
      ["Email/set", {
        accountId: targetAccountId,
        update: {
          [emailId]: {
            mailboxIds: { [originalMailboxId]: true },
          },
        },
      }, "0"],
    ]);
  }

  async searchEmails(query: string, mailboxId?: string, accountId?: string, limit: number = 50, position: number = 0): Promise<{ emails: Email[], hasMore: boolean, total: number }> {
    try {
      const targetAccountId = accountId || this.accountId;
      const filter: Record<string, unknown> = { text: query };
      if (mailboxId) {
        filter.inMailbox = mailboxId;
      }

      const response = await this.request([
        ["Email/query", {
          accountId: targetAccountId,
          filter,
          sort: [{ property: "receivedAt", isAscending: false }],
          limit,
          position,
        }, "0"],
        ["Email/get", {
          accountId: targetAccountId,
          "#ids": { resultOf: "0", name: "Email/query", path: "/ids" },
          properties: [...EMAIL_LIST_PROPERTIES],
        }, "1"],
      ]);

      const queryResponse = response.methodResponses?.[0]?.[1];
      const emails = response.methodResponses?.[1]?.[1]?.list || [];
      const total = queryResponse?.total || 0;
      const hasMore = computeHasMore(position, emails.length, total, limit);

      return { emails, hasMore, total };
    } catch {
      return { emails: [], hasMore: false, total: 0 };
    }
  }

  async advancedSearchEmails(
    filter: Record<string, unknown>,
    accountId?: string,
    limit: number = 50,
    position: number = 0
  ): Promise<{ emails: Email[], hasMore: boolean, total: number }> {
    const targetAccountId = accountId || this.accountId;

    const response = await this.request([
      ["Email/query", {
        accountId: targetAccountId,
        filter,
        sort: [{ property: "receivedAt", isAscending: false }],
        limit,
        position,
      }, "0"],
      ["Email/get", {
        accountId: targetAccountId,
        "#ids": { resultOf: "0", name: "Email/query", path: "/ids" },
        properties: [...EMAIL_LIST_PROPERTIES],
      }, "1"],
    ]);

    const queryResponse = response.methodResponses?.[0]?.[1];
    const emails = response.methodResponses?.[1]?.[1]?.list || [];
    const total = queryResponse?.total || 0;
    const hasMore = computeHasMore(position, emails.length, total, limit);

    return { emails, hasMore, total };
  }

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
    } catch {
      return null;
    }
  }

  async getThreadEmails(threadId: string, accountId?: string): Promise<Email[]> {
    try {
      const targetAccountId = accountId || this.accountId;
      const thread = await this.getThread(threadId, accountId);
      if (!thread?.emailIds?.length) {
        return [];
      }

      const response = await this.request([
        ["Email/get", {
          accountId: targetAccountId,
          ids: thread.emailIds,
          properties: [...EMAIL_LIST_PROPERTIES],
        }, "0"],
      ]);

      if (response.methodResponses?.[0]?.[0] === "Email/get") {
        const emails = response.methodResponses[0][1].list || [];

        if (accountId && accountId !== this.accountId) {
          namespaceMailboxIds(emails, accountId);
        }

        return emails.sort((a: Email, b: Email) =>
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        );
      }

      return [];
    } catch {
      return [];
    }
  }

  private submissionUsing(): string[] {
    return ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:submission"];
  }

  async getIdentities(): Promise<Identity[]> {
    try {
      const response = await this.request([
        ["Identity/get", {
          accountId: this.accountId,
        }, "0"]
      ], this.submissionUsing());

      if (response.methodResponses?.[0]?.[0] === "Identity/get") {
        return (response.methodResponses[0][1].list || []) as Identity[];
      }

      return [];
    } catch {
      return [];
    }
  }

  async createIdentity(
    name: string,
    email: string,
    replyTo?: EmailAddress[],
    bcc?: EmailAddress[],
    textSignature?: string,
    htmlSignature?: string
  ): Promise<Identity> {
    const response = await this.request([
      ["Identity/set", {
        accountId: this.accountId,
        create: {
          "new-identity": {
            name,
            email,
            replyTo,
            bcc,
            textSignature,
            htmlSignature,
          }
        }
      }, "0"]
    ], this.submissionUsing());

    if (response.methodResponses?.[0]?.[0] === "Identity/set") {
      const result = response.methodResponses[0][1];

      if (result.notCreated?.["new-identity"]) {
        const error = result.notCreated["new-identity"];
        if (error.type === "forbidden") {
          throw new Error("You are not authorized to send from this email address");
        }
        throw new Error(error.description || "Failed to create identity");
      }

      const createdId = result.created?.["new-identity"]?.id;
      if (createdId) {
        const identities = await this.getIdentities();
        const identity = identities.find(i => i.id === createdId);
        if (identity) return identity;
      }
    }

    throw new Error("Failed to create identity: Server response was unexpected. Check server logs.");
  }

  async updateIdentity(
    identityId: string,
    updates: {
      name?: string;
      replyTo?: EmailAddress[];
      bcc?: EmailAddress[];
      textSignature?: string;
      htmlSignature?: string;
    }
  ): Promise<void> {
    const response = await this.request([
      ["Identity/set", {
        accountId: this.accountId,
        update: {
          [identityId]: updates
        }
      }, "0"]
    ], this.submissionUsing());

    if (response.methodResponses?.[0]?.[0] === "Identity/set") {
      const result = response.methodResponses[0][1];

      if (result.notUpdated?.[identityId]) {
        const error = result.notUpdated[identityId];
        if (error.type === "notFound") {
          throw new Error("Identity not found (may have been deleted)");
        }
        if (error.type === "forbidden") {
          throw new Error("You are not authorized to modify this identity");
        }
        throw new Error(error.description || "Failed to update identity");
      }
      return;
    }

    throw new Error("Failed to update identity: Server response was unexpected. Check server logs.");
  }

  async deleteIdentity(identityId: string): Promise<void> {
    const response = await this.request([
      ["Identity/set", {
        accountId: this.accountId,
        destroy: [identityId]
      }, "0"]
    ], this.submissionUsing());

    if (response.methodResponses?.[0]?.[0] === "Identity/set") {
      const result = response.methodResponses[0][1];

      if (result.notDestroyed?.[identityId]) {
        const error = result.notDestroyed[identityId];
        if (error.type === "forbidden") {
          throw new Error("This identity cannot be deleted");
        }
        if (error.type === "notFound") {
          throw new Error("Identity not found (may already be deleted)");
        }
        throw new Error(error.description || "Failed to delete identity");
      }
      return;
    }

    throw new Error("Failed to delete identity: Server response was unexpected. Check server logs.");
  }

  private vacationUsing(): string[] {
    return ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:vacationresponse"];
  }

  async getVacationResponse(): Promise<VacationResponse> {
    const response = await this.request([
      ["VacationResponse/get", {
        accountId: this.accountId,
        ids: ["singleton"],
      }, "0"]
    ], this.vacationUsing());

    if (response.methodResponses?.[0]?.[0] === "VacationResponse/get") {
      const list = response.methodResponses[0][1].list || [];
      if (list.length > 0) {
        return list[0] as VacationResponse;
      }
      return {
        id: "singleton",
        isEnabled: false,
        fromDate: null,
        toDate: null,
        subject: "",
        textBody: "",
        htmlBody: null,
      };
    }

    throw new Error("Failed to fetch vacation response: unexpected server response");
  }

  async setVacationResponse(updates: Partial<VacationResponse>): Promise<void> {
    const response = await this.request([
      ["VacationResponse/set", {
        accountId: this.accountId,
        update: {
          "singleton": updates,
        },
      }, "0"]
    ], this.vacationUsing());

    if (response.methodResponses?.[0]?.[0] === "VacationResponse/set") {
      const result = response.methodResponses[0][1];

      if (result.notUpdated?.["singleton"]) {
        const error = result.notUpdated["singleton"];
        throw new Error(error.description || "Failed to update vacation response");
      }
      return;
    }

    throw new Error("Failed to update vacation response");
  }

  async createDraft(
    to: string[],
    subject: string,
    body: string,
    cc?: string[],
    bcc?: string[],
    identityId?: string,
    fromEmail?: string,
    draftId?: string,
    attachments?: Array<{ blobId: string; name: string; type: string; size: number }>,
    fromName?: string
  ): Promise<string> {
    const mailboxes = await this.getMailboxes();
    const draftsMailbox = mailboxes.find(mb => mb.role === 'drafts');
    if (!draftsMailbox) {
      throw new Error('No drafts mailbox found');
    }

    const emailId = `draft-${Date.now()}`;

    interface EmailDraft {
      from: { name?: string; email: string }[];
      to: { email: string }[];
      cc?: { email: string }[];
      bcc?: { email: string }[];
      subject: string;
      keywords: Record<string, boolean>;
      mailboxIds: Record<string, boolean>;
      bodyValues: Record<string, { value: string }>;
      textBody: { partId: string; type: string }[];
      attachments?: { blobId: string; type: string; name: string; disposition: string }[];
    }

    const emailData: EmailDraft = {
      from: [{ ...(fromName ? { name: fromName } : {}), email: fromEmail || this.username }],
      to: to.map(email => ({ email })),
      cc: cc?.map(email => ({ email })),
      bcc: bcc?.map(email => ({ email })),
      subject,
      keywords: { "$draft": true },
      mailboxIds: { [draftsMailbox.id]: true },
      bodyValues: { "1": { value: body } },
      textBody: [{ partId: "1", type: "text/plain" }],
    };

    if (attachments?.length) {
      emailData.attachments = attachments.map(att => ({
        blobId: att.blobId,
        type: att.type,
        name: att.name,
        disposition: "attachment",
      }));
    }

    // Destroy old draft before creating replacement to avoid duplicates
    const methodCalls: JMAPMethodCall[] = [];
    if (draftId) {
      methodCalls.push(["Email/set", {
        accountId: this.accountId, destroy: [draftId],
      }, "0"]);
      methodCalls.push(["Email/set", {
        accountId: this.accountId, create: { [emailId]: emailData },
      }, "1"]);
    } else {
      methodCalls.push(["Email/set", {
        accountId: this.accountId, create: { [emailId]: emailData },
      }, "0"]);
    }

    const response = await this.request(methodCalls);
    const responseIndex = draftId ? 1 : 0;

    if (response.methodResponses?.[responseIndex]?.[0] === "Email/set") {
      const result = response.methodResponses[responseIndex][1];

      if (result.notCreated || result.notUpdated) {
        const errors = result.notCreated || result.notUpdated;
        const firstError = Object.values(errors)[0] as { description?: string; type?: string };
        throw new Error(firstError?.description || firstError?.type || 'Failed to save draft');
      }

      if (result.created?.[emailId]) {
        return result.created[emailId].id;
      }
    }

    throw new Error('Failed to save draft');
  }

  async sendEmail(
    to: string[],
    subject: string,
    body: string,
    cc?: string[],
    bcc?: string[],
    identityId?: string,
    fromEmail?: string,
    draftId?: string,
    fromName?: string
  ): Promise<void> {
    const emailId = draftId || `draft-${Date.now()}`;
    const mailboxes = await this.getMailboxes();
    const sentMailbox = mailboxes.find(mb => mb.role === 'sent');
    if (!sentMailbox) {
      throw new Error('No sent mailbox found');
    }
    const draftsMailbox = mailboxes.find(mb => mb.role === 'drafts');

    let finalIdentityId = identityId;
    if (!finalIdentityId) {
      const identityResponse = await this.request([
        ["Identity/get", { accountId: this.accountId }, "0"]
      ], this.submissionUsing());

      finalIdentityId = this.accountId;
      if (identityResponse.methodResponses?.[0]?.[0] === "Identity/get") {
        const identities = (identityResponse.methodResponses[0][1].list || []) as { id: string; email: string }[];
        if (identities.length > 0) {
          const matchingIdentity = identities.find((id) => id.email === (fromEmail || this.username));
          finalIdentityId = matchingIdentity?.id || identities[0].id;
        }
      }
    }

    const methodCalls: JMAPMethodCall[] = [];

    // Stalwart's duplicate-message check (and many MDAs) consults the
    // sender's own account when delivering inbound mail. If we land the
    // outgoing copy in Sent before EmailSubmission runs, the subsequent
    // SMTP delivery for email-to-self matches the already-stored
    // Message-ID and gets dropped as a duplicate. Keep the email in the
    // Drafts mailbox (or any non-shared inbox proxy) during submission
    // and let EmailSubmission's onSuccessUpdateEmail move it to Sent
    // only after the server has handed the outbound copy to SMTP.
    // Closes #60.
    const holdingMailboxId = draftsMailbox?.id ?? sentMailbox.id;

    if (draftId) {
      // Draft already lives in Drafts — don't touch its mailbox until
      // after submission succeeds.
      methodCalls.push(["EmailSubmission/set", {
        accountId: this.accountId,
        create: { "1": { emailId: draftId, identityId: finalIdentityId } },
        onSuccessUpdateEmail: {
          "#1": {
            [`mailboxIds/${holdingMailboxId}`]: null,
            [`mailboxIds/${sentMailbox.id}`]: true,
            "keywords/$draft": null,
            "keywords/$seen": true,
          },
        },
      }, "0"]);
    } else {
      methodCalls.push(["Email/set", {
        accountId: this.accountId,
        create: {
          [emailId]: {
            from: [{ ...(fromName ? { name: fromName } : {}), email: fromEmail || this.username }],
            to: to.map(email => ({ email })),
            cc: cc?.map(email => ({ email })),
            bcc: bcc?.map(email => ({ email })),
            subject,
            keywords: { "$draft": true },
            mailboxIds: { [holdingMailboxId]: true },
            bodyValues: { "1": { value: body } },
            textBody: [{ partId: "1", type: "text/plain" }],
          },
        },
      }, "0"]);
      methodCalls.push(["EmailSubmission/set", {
        accountId: this.accountId,
        create: { "1": { emailId: `#${emailId}`, identityId: finalIdentityId } },
        onSuccessUpdateEmail: {
          "#1": {
            [`mailboxIds/${holdingMailboxId}`]: null,
            [`mailboxIds/${sentMailbox.id}`]: true,
            "keywords/$draft": null,
            "keywords/$seen": true,
          },
        },
      }, "1"]);
    }

    const response = await this.request(methodCalls, this.submissionUsing());

    if (response.methodResponses) {
      for (const [methodName, result] of response.methodResponses) {
        if (methodName === 'error') {
          throw new Error(result.description || `Failed to send email: ${result.type}`);
        }

        if (result.notCreated || result.notUpdated) {
          const errors = result.notCreated || result.notUpdated;
          const firstError = Object.values(errors)[0] as { description?: string; type?: string };
          throw new Error(firstError?.description || firstError?.type || 'Failed to send email');
        }
      }
    }
  }

  async uploadBlob(file: File): Promise<{ blobId: string; size: number; type: string }> {
    if (!this.session) {
      throw new Error('Not connected. Call connect() first.');
    }

    const uploadUrl = this.session.uploadUrl;
    if (!uploadUrl) {
      throw new Error('Upload URL not available');
    }

    const finalUploadUrl = uploadUrl.replace('{accountId}', encodeURIComponent(this.accountId));
    const response = await this.authenticatedFetch(finalUploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }, { retry: false });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload file: ${response.status} - ${errorText}`);
    }

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error('Invalid JSON response from upload');
    }

    // Direct format: { blobId, type, size }
    if (result.blobId) {
      return {
        blobId: result.blobId,
        size: result.size || file.size,
        type: result.type || file.type,
      };
    }

    // Nested format: { [accountId]: { blobId, type, size } }
    const blobInfo = result[this.accountId];
    if (blobInfo?.blobId) {
      return {
        blobId: blobInfo.blobId,
        size: blobInfo.size || file.size,
        type: blobInfo.type || file.type,
      };
    }

    throw new Error('Invalid upload response: blobId not found');
  }

  getBlobDownloadUrl(blobId: string, name?: string, type?: string): string {
    if (!this.downloadUrl) {
      throw new Error('Download URL not available. Please reconnect.');
    }

    // RFC 6570 level 1 URI template expansion
    return this.downloadUrl
      .replace('{accountId}', encodeURIComponent(this.accountId))
      .replace('{blobId}', encodeURIComponent(blobId))
      .replace('{name}', encodeURIComponent(name || 'download'))
      .replace('{type}', encodeURIComponent(type || 'application/octet-stream'));
  }

  async fetchBlobAsObjectUrl(blobId: string, name?: string, type?: string): Promise<string> {
    const url = this.getBlobDownloadUrl(blobId, name, type);
    const response = await this.authenticatedFetch(url, {}, { retry: false });
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.status}`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

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

  getMaxObjectsInGet(): number {
    const coreCapability = this.capabilities["urn:ietf:params:jmap:core"] as { maxObjectsInGet?: number } | undefined;
    return coreCapability?.maxObjectsInGet || 500;
  }

  getEventSourceUrl(): string | null {
    if (!this.session) return null;

    // RFC 8620: session root level, with fallback to capabilities for some servers
    const coreCapability = this.session.capabilities?.["urn:ietf:params:jmap:core"] as { eventSourceUrl?: string } | undefined;
    return this.session.eventSourceUrl || coreCapability?.eventSourceUrl || null;
  }

  getAccountId(): string {
    return this.accountId;
  }

  getUsername(): string {
    return this.username || this.session?.accounts?.[this.accountId]?.name || '';
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

  supportsContacts(): boolean {
    return this.hasCapability("urn:ietf:params:jmap:contacts");
  }

  supportsCalendars(): boolean {
    return this.hasCapability("urn:ietf:params:jmap:calendars");
  }

  supportsSieve(): boolean {
    return this.hasCapability("urn:ietf:params:jmap:sieve");
  }

  getSieveAccountId(): string {
    const sieveAccount = this.session?.primaryAccounts?.["urn:ietf:params:jmap:sieve"];
    return sieveAccount || this.accountId;
  }

  private sieveUsing(): string[] {
    return ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:sieve"];
  }

  getSieveCapabilities(): SieveCapabilities | null {
    const sieveAccountId = this.getSieveAccountId();
    const accountInfo = this.accounts[sieveAccountId];
    if (!accountInfo?.accountCapabilities) return null;
    const caps = accountInfo.accountCapabilities["urn:ietf:params:jmap:sieve"];
    return (caps as SieveCapabilities) || null;
  }

  async getSieveScripts(): Promise<SieveScript[]> {
    const response = await this.request([
      ["SieveScript/get", {
        accountId: this.getSieveAccountId(),
      }, "0"]
    ], this.sieveUsing());

    if (response.methodResponses?.[0]?.[0] === "SieveScript/get") {
      return (response.methodResponses[0][1].list || []) as SieveScript[];
    }
    throw new Error('Failed to fetch Sieve scripts');
  }

  async getSieveScriptContent(blobId: string): Promise<string> {
    const url = this.getBlobDownloadUrl(blobId, 'script.sieve', 'application/sieve');
    const response = await this.authenticatedFetch(url, {});
    if (!response.ok) throw new Error(`Failed to download script: ${response.status}`);
    return response.text();
  }

  private async uploadSieveBlob(content: string): Promise<string> {
    if (!this.session?.uploadUrl) {
      throw new Error('Upload URL not available');
    }

    const uploadUrl = this.session.uploadUrl.replace(
      '{accountId}',
      encodeURIComponent(this.getSieveAccountId())
    );

    const response = await this.authenticatedFetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sieve',
      },
      body: content,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload sieve script: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const result = await response.json();
    if (result.blobId) return result.blobId;
    const blobInfo = result[this.getSieveAccountId()];
    if (blobInfo?.blobId) return blobInfo.blobId;
    throw new Error('Invalid upload response: blobId not found');
  }

  async createSieveScript(name: string, content: string, activate?: boolean): Promise<SieveScript> {
    const blobId = await this.uploadSieveBlob(content);
    const accountId = this.getSieveAccountId();

    const setArgs: Record<string, unknown> = {
      accountId,
      create: {
        "new-script": { name, blobId }
      },
    };
    if (activate) {
      setArgs.onSuccessActivateScript = "#new-script";
    }

    const response = await this.request([
      ["SieveScript/set", setArgs, "0"]
    ], this.sieveUsing());

    if (response.methodResponses?.[0]?.[0] === "SieveScript/set") {
      const result = response.methodResponses[0][1];
      if (result.notCreated?.["new-script"]) {
        const error = result.notCreated["new-script"];
        throw new Error(error.description || "Failed to create sieve script");
      }
      const createdId = result.created?.["new-script"]?.id;
      if (createdId) {
        const scripts = await this.getSieveScripts();
        const script = scripts.find(s => s.id === createdId);
        if (script) return script;
      }
    }
    throw new Error("Failed to create sieve script");
  }

  async updateSieveScript(scriptId: string, content: string, activate?: boolean): Promise<void> {
    const blobId = await this.uploadSieveBlob(content);
    const accountId = this.getSieveAccountId();

    const setArgs: Record<string, unknown> = {
      accountId,
      update: {
        [scriptId]: { blobId }
      },
    };
    if (activate) {
      setArgs.onSuccessActivateScript = scriptId;
    }

    const response = await this.request([
      ["SieveScript/set", setArgs, "0"]
    ], this.sieveUsing());

    if (response.methodResponses?.[0]?.[0] === "SieveScript/set") {
      const result = response.methodResponses[0][1];
      if (result.notUpdated?.[scriptId]) {
        const error = result.notUpdated[scriptId];
        throw new Error(error.description || "Failed to update sieve script");
      }
      return;
    }
    throw new Error("Failed to update sieve script");
  }

  async deleteSieveScript(scriptId: string): Promise<void> {
    const accountId = this.getSieveAccountId();

    const response = await this.request([
      ["SieveScript/set", {
        accountId,
        destroy: [scriptId]
      }, "0"]
    ], this.sieveUsing());

    if (response.methodResponses?.[0]?.[0] === "SieveScript/set") {
      const result = response.methodResponses[0][1];
      if (result.notDestroyed?.[scriptId]) {
        const error = result.notDestroyed[scriptId];
        throw new Error(error.description || "Failed to delete sieve script");
      }
      return;
    }
    throw new Error("Failed to delete sieve script");
  }

  async activateSieveScript(scriptId: string): Promise<void> {
    const accountId = this.getSieveAccountId();

    const response = await this.request([
      ["SieveScript/set", {
        accountId,
        onSuccessActivateScript: scriptId,
      }, "0"]
    ], this.sieveUsing());

    const [methodName, result] = response.methodResponses?.[0] || [];
    if (methodName === "error") {
      throw new Error(result?.description || "Failed to activate sieve script");
    }
    if (methodName !== "SieveScript/set") {
      throw new Error("Failed to activate sieve script");
    }
  }

  async deactivateSieveScript(): Promise<void> {
    const accountId = this.getSieveAccountId();

    const response = await this.request([
      ["SieveScript/set", {
        accountId,
        onSuccessActivateScript: null,
      }, "0"]
    ], this.sieveUsing());

    const [methodName, result] = response.methodResponses?.[0] || [];
    if (methodName === "error") {
      throw new Error(result?.description || "Failed to deactivate sieve script");
    }
    if (methodName !== "SieveScript/set") {
      throw new Error("Failed to deactivate sieve script");
    }
  }

  async validateSieveScript(content: string): Promise<{ isValid: boolean; errors?: string[] }> {
    const blobId = await this.uploadSieveBlob(content);
    const accountId = this.getSieveAccountId();

    const response = await this.request([
      ["SieveScript/validate", {
        accountId,
        blobId,
      }, "0"]
    ], this.sieveUsing());

    if (response.methodResponses?.[0]?.[0] === "SieveScript/validate") {
      const result = response.methodResponses[0][1];
      if (result.error) {
        return { isValid: false, errors: [result.error.description || "Validation failed"] };
      }
      return { isValid: true };
    }

    if (response.methodResponses?.[0]?.[0] === 'error') {
      const error = response.methodResponses[0][1];
      return { isValid: false, errors: [error.description || "Validation failed"] };
    }

    return { isValid: false, errors: ['Unexpected validation response'] };
  }

  getContactsAccountId(): string {
    const contactsAccount = this.session?.primaryAccounts?.["urn:ietf:params:jmap:contacts"];
    return contactsAccount || this.accountId;
  }

  getCalendarsAccountId(): string {
    const calendarsAccount = this.session?.primaryAccounts?.["urn:ietf:params:jmap:calendars"];
    return calendarsAccount || this.accountId;
  }

  private contactUsing(): string[] {
    return ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:contacts"];
  }

  private calendarUsing(): string[] {
    return ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"];
  }

  async getAddressBooks(): Promise<AddressBook[]> {
    try {
      const accountId = this.getContactsAccountId();
      const response = await this.request([
        ["AddressBook/get", { accountId }, "0"]
      ], this.contactUsing());

      if (response.methodResponses?.[0]?.[0] === "AddressBook/get") {
        return (response.methodResponses[0][1].list || []) as AddressBook[];
      }
      return [];
    } catch {
      return [];
    }
  }

  async getContacts(addressBookId?: string): Promise<ContactCard[]> {
    try {
      const accountId = this.getContactsAccountId();
      const maxBatchSize = this.getMaxObjectsInGet();
      const CONTACTS_QUERY_LIMIT = 1000;
      const queryArgs: Record<string, unknown> = {
        accountId,
        limit: CONTACTS_QUERY_LIMIT,
        calculateTotal: true,
      };
      if (addressBookId) {
        queryArgs.filter = { inAddressBook: addressBookId };
      }

      const queryResponse = await this.request([
        ["ContactCard/query", queryArgs, "0"],
      ], this.contactUsing());

      if (queryResponse.methodResponses?.[0]?.[0] !== "ContactCard/query") {
        return [];
      }

      const queryResult = queryResponse.methodResponses[0][1];
      const allIds = (queryResult.ids || []) as string[];
      const total = typeof queryResult.total === "number" ? queryResult.total : allIds.length;
      if (total > allIds.length) {
        console.warn(
          `[JMAP] Contact list truncated: loaded ${allIds.length} of ${total} contacts (query limit ${CONTACTS_QUERY_LIMIT}).`
        );
      }
      if (allIds.length === 0) {
        return [];
      }

      // Batch the get so servers capping maxObjectsInGet (Stalwart default 500)
      // don't silently fail. All batches are packed into a single JMAP request
      // — one HTTP roundtrip regardless of contact count.
      const calls: [string, Record<string, unknown>, string][] = [];
      for (let i = 0; i < allIds.length; i += maxBatchSize) {
        const batchIds = allIds.slice(i, i + maxBatchSize);
        calls.push(["ContactCard/get", { accountId, ids: batchIds }, String(calls.length)]);
      }

      const response = await this.request(calls, this.contactUsing());
      const allContacts: ContactCard[] = [];
      for (const [method, result] of response.methodResponses || []) {
        if (method === "ContactCard/get") {
          allContacts.push(...((result as { list?: ContactCard[] }).list || []));
        }
      }
      return allContacts;
    } catch {
      return [];
    }
  }

  async getContact(contactId: string): Promise<ContactCard | null> {
    try {
      const accountId = this.getContactsAccountId();
      const response = await this.request([
        ["ContactCard/get", {
          accountId,
          ids: [contactId],
        }, "0"]
      ], this.contactUsing());

      if (response.methodResponses?.[0]?.[0] === "ContactCard/get") {
        const list = response.methodResponses[0][1].list || [];
        return list[0] || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  async createContact(contact: Partial<ContactCard>): Promise<ContactCard> {
    const accountId = this.getContactsAccountId();
    let addressBookIds = contact.addressBookIds;
    if (!addressBookIds || Object.keys(addressBookIds).length === 0) {
      const books = await this.getAddressBooks();
      const defaultBook = books.find(b => b.isDefault) || books[0];
      if (defaultBook) {
        addressBookIds = { [defaultBook.id]: true };
      }
    }

    const response = await this.request([
      ["ContactCard/set", {
        accountId,
        create: {
          "new-contact": {
            ...contact,
            addressBookIds,
          }
        }
      }, "0"]
    ], this.contactUsing());

    if (response.methodResponses?.[0]?.[0] === "ContactCard/set") {
      const result = response.methodResponses[0][1];

      if (result.notCreated?.["new-contact"]) {
        const error = result.notCreated["new-contact"];
        throw new Error(error.description || "Failed to create contact");
      }

      const createdId = result.created?.["new-contact"]?.id;
      if (createdId) {
        const created = await this.getContact(createdId);
        if (created) return created;
      }
    }

    throw new Error("Failed to create contact");
  }

  async updateContact(contactId: string, updates: Partial<ContactCard>): Promise<void> {
    const accountId = this.getContactsAccountId();

    const response = await this.request([
      ["ContactCard/set", {
        accountId,
        update: {
          [contactId]: updates
        }
      }, "0"]
    ], this.contactUsing());

    if (response.methodResponses?.[0]?.[0] === "ContactCard/set") {
      const result = response.methodResponses[0][1];

      if (result.notUpdated?.[contactId]) {
        const error = result.notUpdated[contactId];
        throw new Error(error.description || "Failed to update contact");
      }
      return;
    }

    throw new Error("Failed to update contact");
  }

  async deleteContact(contactId: string): Promise<void> {
    const accountId = this.getContactsAccountId();

    const response = await this.request([
      ["ContactCard/set", {
        accountId,
        destroy: [contactId]
      }, "0"]
    ], this.contactUsing());

    if (response.methodResponses?.[0]?.[0] === "ContactCard/set") {
      const result = response.methodResponses[0][1];

      if (result.notDestroyed?.[contactId]) {
        const error = result.notDestroyed[contactId];
        throw new Error(error.description || "Failed to delete contact");
      }
      return;
    }

    throw new Error("Failed to delete contact");
  }

  async searchContacts(query: string): Promise<ContactCard[]> {
    try {
      const accountId = this.getContactsAccountId();

      const response = await this.request([
        ["ContactCard/query", {
          accountId,
          filter: { text: query },
          limit: 50,
        }, "0"],
        ["ContactCard/get", {
          accountId,
          "#ids": { resultOf: "0", name: "ContactCard/query", path: "/ids" },
        }, "1"]
      ], this.contactUsing());

      if (response.methodResponses?.[1]?.[0] === "ContactCard/get") {
        return (response.methodResponses[1][1].list || []) as ContactCard[];
      }
      return [];
    } catch {
      return [];
    }
  }

  async getCalendars(): Promise<Calendar[]> {
    try {
      const accountId = this.getCalendarsAccountId();
      const response = await this.request([
        ["Calendar/get", { accountId }, "0"]
      ], this.calendarUsing());

      if (response.methodResponses?.[0]?.[0] === "Calendar/get") {
        return (response.methodResponses[0][1].list || []) as Calendar[];
      }
      return [];
    } catch {
      return [];
    }
  }

  async createCalendar(calendar: Partial<Calendar>): Promise<Calendar> {
    const accountId = this.getCalendarsAccountId();

    const response = await this.request([
      ["Calendar/set", {
        accountId,
        create: {
          "new-calendar": calendar
        }
      }, "0"]
    ], this.calendarUsing());

    if (response.methodResponses?.[0]?.[0] === "Calendar/set") {
      const result = response.methodResponses[0][1];

      if (result.notCreated?.["new-calendar"]) {
        const error = result.notCreated["new-calendar"];
        throw new Error(error.description || "Failed to create calendar");
      }

      const createdId = result.created?.["new-calendar"]?.id;
      if (createdId) {
        const calendars = await this.getCalendars();
        const created = calendars.find(c => c.id === createdId);
        if (created) return created;
      }
    }

    throw new Error("Failed to create calendar");
  }

  async updateCalendar(calendarId: string, updates: Partial<Calendar>): Promise<void> {
    const accountId = this.getCalendarsAccountId();

    const response = await this.request([
      ["Calendar/set", {
        accountId,
        update: {
          [calendarId]: updates
        }
      }, "0"]
    ], this.calendarUsing());

    if (response.methodResponses?.[0]?.[0] === "Calendar/set") {
      const result = response.methodResponses[0][1];

      if (result.notUpdated?.[calendarId]) {
        const error = result.notUpdated[calendarId];
        throw new Error(error.description || "Failed to update calendar");
      }
      return;
    }

    throw new Error("Failed to update calendar");
  }

  async deleteCalendar(calendarId: string): Promise<void> {
    const accountId = this.getCalendarsAccountId();

    const response = await this.request([
      ["Calendar/set", {
        accountId,
        destroy: [calendarId]
      }, "0"]
    ], this.calendarUsing());

    if (response.methodResponses?.[0]?.[0] === "Calendar/set") {
      const result = response.methodResponses[0][1];

      if (result.notDestroyed?.[calendarId]) {
        const error = result.notDestroyed[calendarId];
        throw new Error(error.description || "Failed to delete calendar");
      }
      return;
    }

    throw new Error("Failed to delete calendar");
  }

  async getCalendarEvents(calendarIds?: string[]): Promise<CalendarEvent[]> {
    try {
      const accountId = this.getCalendarsAccountId();

      const queryArgs: Record<string, unknown> = { accountId, limit: 1000 };
      if (calendarIds && calendarIds.length > 0) {
        queryArgs.filter = { inCalendars: calendarIds };
      }

      const response = await this.request([
        ["CalendarEvent/query", queryArgs, "0"],
        ["CalendarEvent/get", {
          accountId,
          "#ids": { resultOf: "0", name: "CalendarEvent/query", path: "/ids" },
          properties: [...CALENDAR_EVENT_PROPERTIES],
        }, "1"]
      ], this.calendarUsing());

      if (response.methodResponses?.[1]?.[0] === "CalendarEvent/get") {
        return (response.methodResponses[1][1].list || []) as CalendarEvent[];
      }
      return [];
    } catch {
      return [];
    }
  }

  async queryCalendarEvents(
    filter: CalendarEventFilter,
    sort?: Array<{ property: string; isAscending: boolean }>,
    limit?: number
  ): Promise<CalendarEvent[]> {
    try {
      const accountId = this.getCalendarsAccountId();

      const queryArgs: Record<string, unknown> = {
        accountId,
        filter,
        limit: limit || 100,
      };
      if (sort) {
        queryArgs.sort = sort;
      }

      const response = await this.request([
        ["CalendarEvent/query", queryArgs, "0"],
        ["CalendarEvent/get", {
          accountId,
          "#ids": { resultOf: "0", name: "CalendarEvent/query", path: "/ids" },
          properties: [...CALENDAR_EVENT_PROPERTIES],
        }, "1"]
      ], this.calendarUsing());

      if (response.methodResponses?.[1]?.[0] === "CalendarEvent/get") {
        return (response.methodResponses[1][1].list || []) as CalendarEvent[];
      }
      return [];
    } catch {
      return [];
    }
  }

  async getCalendarEvent(id: string): Promise<CalendarEvent | null> {
    try {
      const accountId = this.getCalendarsAccountId();
      const response = await this.request([
        ["CalendarEvent/get", {
          accountId,
          ids: [id],
          properties: [...CALENDAR_EVENT_PROPERTIES],
        }, "0"]
      ], this.calendarUsing());

      if (response.methodResponses?.[0]?.[0] === "CalendarEvent/get") {
        const list = response.methodResponses[0][1].list || [];
        return list[0] || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  async createCalendarEvent(event: Partial<CalendarEvent>, sendSchedulingMessages?: boolean): Promise<CalendarEvent> {
    const accountId = this.getCalendarsAccountId();

    const setArgs: Record<string, unknown> = {
      accountId,
      create: {
        "new-event": event
      }
    };
    if (sendSchedulingMessages !== undefined) {
      setArgs.sendSchedulingMessages = sendSchedulingMessages;
    }

    const response = await this.request([
      ["CalendarEvent/set", setArgs, "0"]
    ], this.calendarUsing());

    if (response.methodResponses?.[0]?.[0] === "CalendarEvent/set") {
      const result = response.methodResponses[0][1];

      if (result.notCreated?.["new-event"]) {
        const error = result.notCreated["new-event"];
        throw new Error(error.description || "Failed to create calendar event");
      }

      const createdId = result.created?.["new-event"]?.id;
      if (createdId) {
        const created = await this.getCalendarEvent(createdId);
        if (created) return created;
      }
    }

    throw new Error("Failed to create calendar event");
  }

  async updateCalendarEvent(
    eventId: string,
    updates: Partial<CalendarEvent>,
    sendSchedulingMessages?: boolean
  ): Promise<void> {
    const accountId = this.getCalendarsAccountId();

    const setArgs: Record<string, unknown> = {
      accountId,
      update: {
        [eventId]: updates
      }
    };
    if (sendSchedulingMessages !== undefined) {
      setArgs.sendSchedulingMessages = sendSchedulingMessages;
    }

    const response = await this.request([
      ["CalendarEvent/set", setArgs, "0"]
    ], this.calendarUsing());

    if (response.methodResponses?.[0]?.[0] === "CalendarEvent/set") {
      const result = response.methodResponses[0][1];

      if (result.notUpdated?.[eventId]) {
        const error = result.notUpdated[eventId];
        throw new Error(error.description || "Failed to update calendar event");
      }
      return;
    }

    throw new Error("Failed to update calendar event");
  }

  async parseCalendarEvents(accountId: string, blobId: string): Promise<Partial<CalendarEvent>[]> {
    const response = await this.request([
      ["CalendarEvent/parse", {
        accountId,
        blobIds: [blobId],
      }, "0"]
    ], this.calendarUsing());

    if (response.methodResponses?.[0]?.[0] === "CalendarEvent/parse") {
      const result = response.methodResponses[0][1];

      if (result.notParsable && result.notParsable.includes(blobId)) {
        throw new Error("Invalid calendar file format");
      }

      if (result.notFound && result.notFound.includes(blobId)) {
        throw new Error("Uploaded file not found");
      }

      const parsed = result.parsed?.[blobId];
      if (parsed) {
        return Array.isArray(parsed) ? parsed : [parsed];
      }

      return [];
    }

    throw new Error("Failed to parse calendar file");
  }

  async deleteCalendarEvent(eventId: string, sendSchedulingMessages?: boolean): Promise<void> {
    const accountId = this.getCalendarsAccountId();

    const setArgs: Record<string, unknown> = {
      accountId,
      destroy: [eventId]
    };
    if (sendSchedulingMessages !== undefined) {
      setArgs.sendSchedulingMessages = sendSchedulingMessages;
    }

    const response = await this.request([
      ["CalendarEvent/set", setArgs, "0"]
    ], this.calendarUsing());

    if (response.methodResponses?.[0]?.[0] === "CalendarEvent/set") {
      const result = response.methodResponses[0][1];

      if (result.notDestroyed?.[eventId]) {
        const error = result.notDestroyed[eventId];
        throw new Error(error.description || "Failed to delete calendar event");
      }
      return;
    }

    throw new Error("Failed to delete calendar event");
  }

  async downloadBlob(blobId: string, name?: string, type?: string): Promise<void> {
    const url = this.getBlobDownloadUrl(blobId, name, type);
    const response = await this.authenticatedFetch(url, {}, { retry: false });

    if (!response.ok) {
      throw new Error(`Failed to download attachment: ${response.status}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = name || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }

  private pollingInterval: NodeJS.Timeout | null = null;
  private pollingStates: { [key: string]: string } = {};

  private static readonly STATE_TYPE_MAP: Record<string, string> = {
    'Mailbox/get': 'Mailbox',
    'Email/get': 'Email',
    'Calendar/get': 'Calendar',
    'CalendarEvent/get': 'CalendarEvent',
    'SieveScript/get': 'SieveScript',
  };

  // Polling-based push since EventSource cannot send Authorization headers
  setupPushNotifications(): boolean {
    // Guard against stacking intervals if setup runs more than once (effect re-run)
    if (this.pollingInterval) {
      return true;
    }
    this.fetchCurrentStates();
    this.pollingInterval = setInterval(() => {
      this.checkForStateChanges();
    }, 15_000);
    return true;
  }

  private buildStatePollingRequest(): { using: string[]; methodCalls: JMAPMethodCall[] } {
    const using = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'];
    const methodCalls: JMAPMethodCall[] = [
      ['Mailbox/get', { accountId: this.accountId, ids: null, properties: ['id'] }, 'a'],
      ['Email/get', { accountId: this.accountId, ids: [], properties: ['id'] }, 'b'],
    ];

    if (this.supportsCalendars()) {
      using.push('urn:ietf:params:jmap:calendars');
      const calAccountId = this.getCalendarsAccountId();
      methodCalls.push(
        ['Calendar/get', { accountId: calAccountId, ids: null, properties: ['id'] }, 'c'],
        ['CalendarEvent/get', { accountId: calAccountId, ids: [], properties: ['id'] }, 'd'],
      );
    }

    if (this.supportsSieve()) {
      using.push('urn:ietf:params:jmap:sieve');
      methodCalls.push(
        ['SieveScript/get', { accountId: this.getSieveAccountId(), ids: [], properties: ['id'] }, 'e'],
      );
    }

    return { using, methodCalls };
  }

  private async fetchCurrentStates(): Promise<void> {
    try {
      const { using, methodCalls } = this.buildStatePollingRequest();
      const response = await this.authenticatedFetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ using, methodCalls }),
      }, { retry: false });

      if (response.ok) {
        const data = await response.json();
        for (const [method, result] of data.methodResponses) {
          const stateKey = JMAPClient.STATE_TYPE_MAP[method];
          if (stateKey && result.state) {
            this.pollingStates[stateKey] = result.state;
          }
        }
      }
    } catch {
      // Silently fail - polling will retry
    }
  }

  private async checkForStateChanges(): Promise<void> {
    try {
      const { using, methodCalls } = this.buildStatePollingRequest();
      const response = await this.authenticatedFetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ using, methodCalls }),
      }, { retry: false });

      if (response.ok) {
        const data = await response.json();
        const changes: { [key: string]: string } = {};
        let hasChanges = false;

        for (const [method, result] of data.methodResponses) {
          const stateKey = JMAPClient.STATE_TYPE_MAP[method];
          if (stateKey && result.state) {
            if (this.pollingStates[stateKey] && this.pollingStates[stateKey] !== result.state) {
              changes[stateKey] = result.state;
              hasChanges = true;
            }
            this.pollingStates[stateKey] = result.state;
          }
        }

        if (hasChanges && this.stateChangeCallback) {
          this.stateChangeCallback({
            '@type': 'StateChange',
            changed: { [this.accountId]: changes },
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
