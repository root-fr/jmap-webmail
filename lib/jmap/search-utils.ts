export interface SearchFilters {
  from: string;
  to: string;
  subject: string;
  body: string;
  hasAttachment: boolean | null;
  dateAfter: string;
  dateBefore: string;
  isUnread: boolean | null;
  isStarred: boolean | null;
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  from: "",
  to: "",
  subject: "",
  body: "",
  hasAttachment: null,
  dateAfter: "",
  dateBefore: "",
  isUnread: null,
  isStarred: null,
};

export function buildJMAPFilter(
  textQuery: string,
  filters: SearchFilters,
  mailboxId?: string
): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  if (textQuery) {
    conditions.push({ text: textQuery });
  }

  if (filters.from) {
    conditions.push({ from: filters.from });
  }

  if (filters.to) {
    conditions.push({ to: filters.to });
  }

  if (filters.subject) {
    conditions.push({ subject: filters.subject });
  }

  if (filters.body) {
    conditions.push({ body: filters.body });
  }

  if (filters.hasAttachment === true) {
    conditions.push({ hasAttachment: true });
  } else if (filters.hasAttachment === false) {
    conditions.push({ hasAttachment: false });
  }

  if (filters.dateAfter) {
    const date = new Date(filters.dateAfter);
    if (!isNaN(date.getTime())) {
      conditions.push({ after: date.toISOString() });
    }
  }

  if (filters.dateBefore) {
    const endOfDay = new Date(filters.dateBefore);
    if (!isNaN(endOfDay.getTime())) {
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push({ before: endOfDay.toISOString() });
    }
  }

  if (filters.isUnread === true) {
    conditions.push({ notKeyword: "$seen" });
  } else if (filters.isUnread === false) {
    conditions.push({ hasKeyword: "$seen" });
  }

  if (filters.isStarred === true) {
    conditions.push({ hasKeyword: "$flagged" });
  } else if (filters.isStarred === false) {
    conditions.push({ notKeyword: "$flagged" });
  }

  if (mailboxId) {
    conditions.push({ inMailbox: mailboxId });
  }

  if (conditions.length === 0) {
    return mailboxId ? { inMailbox: mailboxId } : {};
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return {
    operator: "AND",
    conditions,
  };
}

export function isFilterEmpty(filters: SearchFilters): boolean {
  return (
    !filters.from &&
    !filters.to &&
    !filters.subject &&
    !filters.body &&
    filters.hasAttachment === null &&
    !filters.dateAfter &&
    !filters.dateBefore &&
    filters.isUnread === null &&
    filters.isStarred === null
  );
}

export function activeFilterCount(filters: SearchFilters): number {
  let count = 0;
  if (filters.from) count++;
  if (filters.to) count++;
  if (filters.subject) count++;
  if (filters.body) count++;
  if (filters.hasAttachment !== null) count++;
  if (filters.dateAfter) count++;
  if (filters.dateBefore) count++;
  if (filters.isUnread !== null) count++;
  if (filters.isStarred !== null) count++;
  return count;
}

export type EmailScope =
  | { kind: "folder"; mailboxId: string }
  | { kind: "all"; includeTrashJunk: boolean };

export type EmailSort = {
  by: "receivedAt" | "from" | "subject" | "size";
  ascending: boolean;
};

export interface EmailQuery {
  text?: string;
  filters?: SearchFilters;
  scope: EmailScope;
  sort: EmailSort;
}

export interface EmailPage {
  limit: number;
  anchor?: string;
  anchorOffset?: number;
}

export interface QueryRequest {
  filter: Record<string, unknown>;
  sort: { property: string; isAscending: boolean }[];
  anchor?: string;
  anchorOffset?: number;
  position?: number;
  limit: number;
  calculateTotal: boolean;
}

export function buildQueryRequest(
  query: EmailQuery,
  page: EmailPage,
  ctx: { trashId?: string; junkId?: string }
): QueryRequest {
  const mailboxId =
    query.scope.kind === "folder" ? query.scope.mailboxId : undefined;
  const base = buildJMAPFilter(
    query.text ?? "",
    query.filters ?? DEFAULT_SEARCH_FILTERS,
    mailboxId
  );

  let filter: Record<string, unknown> = base;
  if (query.scope.kind === "all" && !query.scope.includeTrashJunk) {
    const excludeIds = [ctx.trashId, ctx.junkId].filter(
      (id): id is string => Boolean(id)
    );
    if (excludeIds.length > 0) {
      const notClause: Record<string, unknown> = {
        operator: "NOT",
        conditions: excludeIds.map((id) => ({ inMailbox: id })),
      };
      filter =
        Object.keys(base).length === 0
          ? notClause
          : { operator: "AND", conditions: [base, notClause] };
    }
  }

  const sort = [{ property: query.sort.by, isAscending: query.sort.ascending }];

  if (page.anchor) {
    return {
      filter,
      sort,
      anchor: page.anchor,
      anchorOffset: page.anchorOffset ?? 1,
      limit: page.limit,
      calculateTotal: false,
    };
  }

  return {
    filter,
    sort,
    position: 0,
    limit: page.limit,
    calculateTotal: true,
  };
}
