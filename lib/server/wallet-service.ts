import { Prisma, type TransactionType } from '@prisma/client';
import { prisma } from './prisma';
import {
  decimalToNumber,
  round2,
  toCategoryDTO,
  toTransactionDTO,
  type CategoryDTO,
  type TransactionDTO,
} from './serialize';
import { getDebtTotals, type DebtTotals } from './debt-service';
import type { AddTransactionInput, SearchTransactionsInput } from './validation';

/**
 * Wallet business logic.
 *
 * Both entry points — the MCP server (src/mcp) and the REST API (src/api) —
 * call into this module, so an LLM and the dashboard can never disagree about
 * what a balance means.
 */

/** One month of the ledger, with the balance carried in from the month before. */
export interface MonthlyBucket {
  /** `YYYY-MM`. */
  month: string;
  income: number;
  expense: number;
  /** income − expense for this month alone: what the month left over. */
  net: number;
  /**
   * Cash moved by lending and repayment this month, signed. Lending out and
   * repaying a loan are negative; borrowing and being repaid are positive.
   * Separate from `net` because neither is income or spending.
   */
  debtFlow: number;
  /** Closing balance of the previous month — what this month started with. */
  openingBalance: number;
  /** openingBalance + net + debtFlow, and the next month's opening balance. */
  closingBalance: number;
}

/**
 * The month in progress, and how it compares with the one before.
 *
 * Always present even when the month has no activity yet, so the dashboard can
 * state what the month opened with rather than showing nothing.
 */
export interface CurrentMonth extends MonthlyBucket {
  /** Last month's net, or null when there is no earlier month on record. */
  previousNet: number | null;
  /** thisMonth.net − previousNet. Null for the same reason. */
  deltaVsPrevious: number | null;
}

export interface WalletSummary {
  /**
   * Cash actually in hand: income − expense, less what you are owed and plus
   * what you owe. Lending moves money out of the wallet even though it is not
   * spending, so a balance that ignored debts would overstate what you have.
   */
  balance: number;
  /** income − expense alone, before any debt is taken into account. */
  ledgerBalance: number;
  totalIncome: number;
  totalExpense: number;
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
  currency: string;
  period: { startDate: string | null; endDate: string | null };
  topCategories: Array<{ category: string; type: TransactionType; total: number; count: number }>;
  recentTransactions: TransactionDTO[];
  debts: DebtTotals;
  /** The stated cash on hand at the start of `openingBalanceMonth`. */
  openingBalance: number;
  /** `YYYY-MM` the stated balance is true at the start of; null = earliest month. */
  openingBalanceMonth: string | null;
  /** Oldest month first, each one opening where the last one closed. */
  monthly: MonthlyBucket[];
  currentMonth: CurrentMonth;
}

export interface SearchResult {
  transactions: TransactionDTO[];
  totalCount: number;
  returnedCount: number;
  hasMore: boolean;
  totals: { income: number; expense: number; net: number };
  appliedFilters: Record<string, unknown>;
}

const CURRENCY = 'USD';

/** Builds a date filter, omitting it entirely when neither bound is set. */
function dateRangeFilter(startDate?: Date, endDate?: Date): Prisma.DateTimeFilter | undefined {
  if (!startDate && !endDate) return undefined;
  return { ...(startDate && { gte: startDate }), ...(endDate && { lte: endDate }) };
}

/**
 * Finds or creates the Category catalog row for `name` and returns its id.
 *
 * Matching is case-insensitive so "Groceries" and "groceries" do not become
 * two separate categories; the first spelling seen wins.
 */
async function resolveCategoryId(
  userId: string,
  name: string,
  type: TransactionType,
): Promise<{ id: string; name: string }> {
  const existing = await prisma.category.findFirst({
    where: { userId, name: { equals: name, mode: 'insensitive' } },
  });
  if (existing) return { id: existing.id, name: existing.name };

  // A concurrent insert can win the race between findFirst and create; the
  // unique constraint on [userId, name] makes that safe to recover from.
  try {
    const created = await prisma.category.create({ data: { userId, name, type } });
    return { id: created.id, name: created.name };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await prisma.category.findFirst({
        where: { userId, name: { equals: name, mode: 'insensitive' } },
      });
      if (raced) return { id: raced.id, name: raced.name };
    }
    throw error;
  }
}

/** `YYYY-MM` for a date, cut in UTC to match how dates are stored. */
function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Income and expense per calendar month.
 *
 * Grouped in SQL rather than in JS: pulling every transaction back to bucket it
 * would scale with the ledger, and this runs on every dashboard load.
 *
 * Months are cut in UTC, matching how dates are stored (anchored at 12:00 UTC),
 * so a transaction never lands in a different month than the one it displays.
 */
async function monthlyTotals(
  userId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<Array<{ month: string; income: number; expense: number }>> {
  const rows = await prisma.$queryRaw<
    Array<{ month: Date; income: Prisma.Decimal | null; expense: Prisma.Decimal | null }>
  >`
    SELECT date_trunc('month', t."date" AT TIME ZONE 'UTC') AS "month",
           SUM(t."amount") FILTER (WHERE t."type" = 'INCOME')  AS "income",
           SUM(t."amount") FILTER (WHERE t."type" = 'EXPENSE') AS "expense"
      FROM public."transactions" t
     WHERE t."userId" = ${userId}::text
       AND (${startDate ?? null}::timestamp IS NULL OR t."date" >= ${startDate ?? null}::timestamp)
       AND (${endDate ?? null}::timestamp IS NULL OR t."date" <= ${endDate ?? null}::timestamp)
     GROUP BY 1
     ORDER BY 1 ASC
  `;

  return rows.map((row) => ({
    month: monthKey(row.month),
    income: round2(decimalToNumber(row.income)),
    expense: round2(decimalToNumber(row.expense)),
  }));
}

/**
 * Cash moved by debts per calendar month.
 *
 * Lending out and repaying what you borrowed take cash out; borrowing and being
 * repaid put it back. Summing these alongside income and expense is what makes
 * the last month's closing balance equal the balance on the summary card —
 * without it the two would disagree by whatever is currently outstanding.
 */
async function monthlyDebtFlow(
  userId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ month: Date; flow: Prisma.Decimal | null }>>`
    SELECT "month", SUM("flow") AS "flow" FROM (
      SELECT date_trunc('month', d."date" AT TIME ZONE 'UTC') AS "month",
             CASE WHEN d."direction" = 'RECEIVABLE' THEN -d."principal" ELSE d."principal" END AS "flow"
        FROM public."debts" d
       WHERE d."userId" = ${userId}::text
         AND (${startDate ?? null}::timestamp IS NULL OR d."date" >= ${startDate ?? null}::timestamp)
         AND (${endDate ?? null}::timestamp IS NULL OR d."date" <= ${endDate ?? null}::timestamp)
      UNION ALL
      SELECT date_trunc('month', r."date" AT TIME ZONE 'UTC') AS "month",
             CASE WHEN d."direction" = 'RECEIVABLE' THEN r."amount" ELSE -r."amount" END AS "flow"
        FROM public."debt_repayments" r
        JOIN public."debts" d ON d."id" = r."debtId"
       WHERE d."userId" = ${userId}::text
         AND (${startDate ?? null}::timestamp IS NULL OR r."date" >= ${startDate ?? null}::timestamp)
         AND (${endDate ?? null}::timestamp IS NULL OR r."date" <= ${endDate ?? null}::timestamp)
    ) x
    GROUP BY "month"
  `;

  return new Map(rows.map((row) => [monthKey(row.month), round2(decimalToNumber(row.flow))]));
}

/**
 * Runs the opening/closing balance through the months.
 *
 * This is the "leftover carries over" rule stated directly: a month that earns
 * more than it spends raises the balance it hands to the next month, and a
 * month that overspends lowers it. Lending and repayment ride along in
 * `debtFlow`, which moves cash without being income or spending.
 *
 * The stated balance anchors one month, and the chain is solved outwards from
 * there: forwards by adding each month's flow, backwards by subtracting it. So
 * telling the app what you had at the start of September also fills in what
 * August must have closed on, instead of leaving earlier months stranded.
 */
function withCarryForward(
  ledger: Array<{ month: string; income: number; expense: number }>,
  debtFlow: Map<string, number>,
  openingBalance: number,
  anchorMonth: string | null,
): MonthlyBucket[] {
  // A month may have debt movement and no transactions at all, so the set of
  // months is the union of both sources, not just the ledger's.
  const months = [...new Set([...ledger.map((r) => r.month), ...debtFlow.keys()])].sort();
  const byMonth = new Map(ledger.map((row) => [row.month, row]));

  const rows = months.map((month) => {
    const row = byMonth.get(month);
    const income = row?.income ?? 0;
    const expense = row?.expense ?? 0;
    return {
      month,
      income,
      expense,
      net: round2(income - expense),
      debtFlow: debtFlow.get(month) ?? 0,
    };
  });

  // The anchor lands on the first month at or after the stated one. With no
  // anchor it is the earliest month, which is the behaviour without a stated
  // balance. An anchor past every recorded month lands one beyond the end,
  // leaving the whole chain to be solved backwards from it.
  const found = anchorMonth ? rows.findIndex((row) => row.month >= anchorMonth) : 0;
  const anchorIndex = anchorMonth ? (found === -1 ? rows.length : found) : 0;

  const opening = new Array<number>(rows.length);
  const closing = new Array<number>(rows.length);

  let forward = openingBalance;
  for (let i = anchorIndex; i < rows.length; i++) {
    opening[i] = forward;
    forward = round2(forward + rows[i]!.net + rows[i]!.debtFlow);
    closing[i] = forward;
  }

  // Each earlier month closes exactly where the next one opens.
  let backward = openingBalance;
  for (let i = anchorIndex - 1; i >= 0; i--) {
    closing[i] = backward;
    backward = round2(backward - rows[i]!.net - rows[i]!.debtFlow);
    opening[i] = backward;
  }

  return rows.map((row, i) => ({
    ...row,
    openingBalance: opening[i]!,
    closingBalance: closing[i]!,
  }));
}

/**
 * The month in progress, synthesised when it has no activity yet so the
 * dashboard can always say what the month opened with.
 */
function buildCurrentMonth(buckets: MonthlyBucket[], openingBalance: number): CurrentMonth {
  const now = monthKey(new Date());
  const existing = buckets.find((b) => b.month === now);

  // Everything before this month decides what it opened with.
  const earlier = buckets.filter((b) => b.month < now);
  const base: MonthlyBucket = existing ?? {
    month: now,
    income: 0,
    expense: 0,
    net: 0,
    debtFlow: 0,
    openingBalance: earlier.at(-1)?.closingBalance ?? openingBalance,
    closingBalance: earlier.at(-1)?.closingBalance ?? openingBalance,
  };

  // The month immediately before, or null when this is the first on record.
  const previous = earlier.at(-1);
  const previousNet = previous ? previous.net : null;

  return {
    ...base,
    previousNet,
    deltaVsPrevious: previousNet === null ? null : round2(base.net - previousNet),
  };
}

export async function getWalletSummary(
  userId: string,
  options: {
    recentLimit: number;
    startDate?: Date;
    endDate?: Date;
  },
): Promise<WalletSummary> {
  const dateFilter = dateRangeFilter(options.startDate, options.endDate);
  const where: Prisma.TransactionWhereInput = { userId, ...(dateFilter ? { date: dateFilter } : {}) };

  const [totals, recent, categoryTotals, monthlyRows, debts, debtFlow, account] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    options.recentLimit > 0
      ? prisma.transaction.findMany({
          where,
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          take: options.recentLimit,
        })
      : Promise.resolve([]),
    prisma.transaction.groupBy({
      by: ['category', 'type'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    }),
    monthlyTotals(userId, options.startDate, options.endDate),
    getDebtTotals(userId),
    monthlyDebtFlow(userId, options.startDate, options.endDate),
    prisma.user.findUnique({
      where: { id: userId },
      select: { openingBalance: true, openingBalanceMonth: true },
    }),
  ]);

  const incomeRow = totals.find((row) => row.type === 'INCOME');
  const expenseRow = totals.find((row) => row.type === 'EXPENSE');

  const totalIncome = round2(decimalToNumber(incomeRow?._sum.amount ?? null));
  const totalExpense = round2(decimalToNumber(expenseRow?._sum.amount ?? null));
  const incomeCount = incomeRow?._count._all ?? 0;
  const expenseCount = expenseRow?._count._all ?? 0;

  const ledgerBalance = round2(totalIncome - totalExpense);
  const openingBalance = round2(decimalToNumber(account?.openingBalance ?? null));
  const openingBalanceMonth = account?.openingBalanceMonth ?? null;
  const monthly = withCarryForward(monthlyRows, debtFlow, openingBalance, openingBalanceMonth);

  return {
    // Taken from the chain rather than recomputed, so the balance and the last
    // row of the monthly table can never drift apart. With no stated month this
    // is identical to openingBalance + ledger + debts; with one, it correctly
    // ignores months already baked into the stated figure.
    balance: monthly.at(-1)?.closingBalance ?? openingBalance,
    ledgerBalance,
    totalIncome,
    totalExpense,
    transactionCount: incomeCount + expenseCount,
    incomeCount,
    expenseCount,
    currency: CURRENCY,
    period: {
      startDate: options.startDate?.toISOString() ?? null,
      endDate: options.endDate?.toISOString() ?? null,
    },
    debts,
    openingBalance,
    openingBalanceMonth,
    monthly,
    currentMonth: buildCurrentMonth(monthly, openingBalance),
    topCategories: categoryTotals.map((row) => ({
      category: row.category,
      type: row.type,
      total: round2(decimalToNumber(row._sum.amount ?? null)),
      count: row._count._all,
    })),
    recentTransactions: recent.map(toTransactionDTO),
  };
}

export async function addTransaction(
  userId: string,
  input: AddTransactionInput,
): Promise<TransactionDTO> {
  const category = await resolveCategoryId(userId, input.category, input.type);

  const created = await prisma.transaction.create({
    data: {
      userId,
      type: input.type,
      // Constructing the Decimal from a string avoids inheriting any binary
      // float error already present in the incoming number.
      amount: new Prisma.Decimal(input.amount.toFixed(2)),
      category: category.name,
      note: input.note ?? null,
      date: input.date ?? new Date(),
      categoryId: category.id,
    },
  });

  return toTransactionDTO(created);
}

/** Builds the dynamic Prisma `where` clause from whichever filters were supplied. */
export function buildTransactionWhere(
  userId: string,
  filters: SearchTransactionsInput,
): Prisma.TransactionWhereInput {
  // Seeded first and never overwritten below: every read is tenant-scoped.
  const where: Prisma.TransactionWhereInput = { userId };

  if (filters.type) where.type = filters.type;
  if (filters.category) where.category = { equals: filters.category, mode: 'insensitive' };

  const dateFilter = dateRangeFilter(filters.startDate, filters.endDate);
  if (dateFilter) where.date = dateFilter;

  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    where.amount = {
      ...(filters.minAmount !== undefined && { gte: new Prisma.Decimal(filters.minAmount.toFixed(2)) }),
      ...(filters.maxAmount !== undefined && { lte: new Prisma.Decimal(filters.maxAmount.toFixed(2)) }),
    };
  }

  if (filters.search) {
    where.OR = [
      { note: { contains: filters.search, mode: 'insensitive' } },
      { category: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function searchTransactions(
  userId: string,
  filters: SearchTransactionsInput,
): Promise<SearchResult> {
  const where = buildTransactionWhere(userId, filters);

  const orderBy: Prisma.TransactionOrderByWithRelationInput[] =
    filters.sortBy === 'date'
      ? [{ date: filters.sortOrder }, { createdAt: filters.sortOrder }]
      : [{ [filters.sortBy]: filters.sortOrder } as Prisma.TransactionOrderByWithRelationInput];

  const [transactions, totalCount, totals] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy,
      take: filters.limit,
      skip: filters.offset,
    }),
    prisma.transaction.count({ where }),
    // Totals cover every row matching the filters, not just the current page.
    prisma.transaction.groupBy({ by: ['type'], where, _sum: { amount: true } }),
  ]);

  const income = round2(decimalToNumber(totals.find((r) => r.type === 'INCOME')?._sum.amount ?? null));
  const expense = round2(decimalToNumber(totals.find((r) => r.type === 'EXPENSE')?._sum.amount ?? null));

  const appliedFilters: Record<string, unknown> = {};
  if (filters.type) appliedFilters.type = filters.type;
  if (filters.category) appliedFilters.category = filters.category;
  if (filters.startDate) appliedFilters.startDate = filters.startDate.toISOString();
  if (filters.endDate) appliedFilters.endDate = filters.endDate.toISOString();
  if (filters.minAmount !== undefined) appliedFilters.minAmount = filters.minAmount;
  if (filters.maxAmount !== undefined) appliedFilters.maxAmount = filters.maxAmount;
  if (filters.search) appliedFilters.search = filters.search;

  return {
    transactions: transactions.map(toTransactionDTO),
    totalCount,
    returnedCount: transactions.length,
    hasMore: filters.offset + transactions.length < totalCount,
    totals: { income, expense, net: round2(income - expense) },
    appliedFilters,
  };
}

/** Thrown when a transaction id does not exist, so callers can map it to 404. */
export class TransactionNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`No transaction found with id "${id}".`);
    this.name = 'TransactionNotFoundError';
  }
}

export async function deleteTransaction(userId: string, id: string): Promise<TransactionDTO> {
  // Read scoped first, so another user's id is indistinguishable from a
  // missing one — the 404 must not confirm that the row exists.
  const existing = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!existing) throw new TransactionNotFoundError(id);

  // Scoped delete rather than delete-by-id: even with the check above, the
  // write itself must not be able to touch another account's row.
  const { count } = await prisma.transaction.deleteMany({ where: { id, userId } });
  if (count === 0) throw new TransactionNotFoundError(id);

  return toTransactionDTO(existing);
}

export async function listCategories(userId: string): Promise<CategoryDTO[]> {
  const categories = await prisma.category.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  return categories.map(toCategoryDTO);
}

export async function createCategory(
  userId: string,
  input: {
    name: string;
    type?: TransactionType | null;
    color?: string | null;
    icon?: string | null;
  },
): Promise<CategoryDTO> {
  const category = await prisma.category.upsert({
    // The composite unique is what makes this an upsert *within* the account
    // rather than across all accounts.
    where: { userId_name: { userId, name: input.name } },
    update: {
      ...(input.type !== undefined && { type: input.type }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.icon !== undefined && { icon: input.icon }),
    },
    create: {
      userId,
      name: input.name,
      type: input.type ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
    },
  });
  return toCategoryDTO(category);
}

/** How chart data is bucketed. */
export type ChartGroupBy = 'month' | 'category' | 'type' | 'day';

export interface ChartBucket {
  key: string;
  label: string;
  income: number;
  expense: number;
  /** Signed net for time buckets; absolute magnitude for category/type buckets. */
  total: number;
  /**
   * The single non-negative measure this bucket is "about", given the search:
   * expenses only, income only, or the combined magnitude. Pie and donut slices
   * read this — `total` can be negative and would render as a missing slice.
   */
  value: number;
  count: number;
}

export interface ChartData {
  groupBy: ChartGroupBy;
  buckets: ChartBucket[];
  /** True when the row cap was hit and the aggregate covers only part of the match. */
  truncated: boolean;
}

/** Guard against pulling an unbounded result set into memory to aggregate it. */
const CHART_ROW_CAP = 5000;

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Aggregates every transaction matching `filters` — not just the page returned
 * by searchTransactions — into chart buckets.
 *
 * Bucketing happens in JS rather than SQL because month/day truncation is
 * awkward to express through the Prisma query builder, and a personal wallet is
 * far below the row cap. Dates are read in UTC to match the noon-UTC anchor the
 * rest of the app stores.
 */
export async function aggregateForChart(
  userId: string,
  filters: SearchTransactionsInput,
  groupBy: ChartGroupBy,
): Promise<ChartData> {
  const rows = await prisma.transaction.findMany({
    where: buildTransactionWhere(userId, filters),
    select: { date: true, type: true, amount: true, category: true },
    orderBy: { date: 'asc' },
    take: CHART_ROW_CAP + 1,
  });

  const truncated = rows.length > CHART_ROW_CAP;
  const usable = truncated ? rows.slice(0, CHART_ROW_CAP) : rows;

  const buckets = new Map<string, ChartBucket>();

  for (const row of usable) {
    let key: string;
    let label: string;

    switch (groupBy) {
      case 'month': {
        const year = row.date.getUTCFullYear();
        const month = row.date.getUTCMonth();
        key = `${year}-${String(month + 1).padStart(2, '0')}`;
        label = `${MONTH_LABELS[month]} ${year}`;
        break;
      }
      case 'day': {
        key = row.date.toISOString().slice(0, 10);
        label = key;
        break;
      }
      case 'type': {
        key = row.type;
        label = row.type === 'INCOME' ? 'Income' : 'Expense';
        break;
      }
      case 'category':
      default: {
        key = row.category;
        label = row.category;
        break;
      }
    }

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label, income: 0, expense: 0, total: 0, value: 0, count: 0 };
      buckets.set(key, bucket);
    }

    const amount = decimalToNumber(row.amount);
    if (row.type === 'INCOME') bucket.income += amount;
    else bucket.expense += amount;
    bucket.count += 1;
  }

  // A search restricted to one side of the ledger is "about" that side; an
  // unrestricted one is about the combined magnitude.
  const measure = (bucket: ChartBucket): number => {
    if (filters.type === 'EXPENSE') return bucket.expense;
    if (filters.type === 'INCOME') return bucket.income;
    return bucket.income + bucket.expense;
  };

  const list = [...buckets.values()].map((bucket) => ({
    ...bucket,
    income: round2(bucket.income),
    expense: round2(bucket.expense),
    value: round2(measure(bucket)),
    // Time buckets want a signed net; category/type buckets want magnitude,
    // because a pie slice cannot be negative.
    total:
      groupBy === 'month' || groupBy === 'day'
        ? round2(bucket.income - bucket.expense)
        : round2(bucket.income + bucket.expense),
  }));

  // Chronological for time, largest-first for categorical.
  if (groupBy === 'month' || groupBy === 'day') list.sort((a, b) => a.key.localeCompare(b.key));
  else list.sort((a, b) => b.value - a.value);

  return { groupBy, buckets: list, truncated };
}
