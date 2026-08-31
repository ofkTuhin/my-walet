export type TransactionType = 'INCOME' | 'EXPENSE';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: string;
  note: string | null;
  date: string;
  createdAt: string;
  updatedAt: string;
  categoryId: string | null;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType | null;
  color: string | null;
  icon: string | null;
  createdAt: string;
}

export type DebtDirection = 'RECEIVABLE' | 'PAYABLE';

export interface Debt {
  id: string;
  direction: DebtDirection;
  counterparty: string;
  principal: number;
  outstanding: number;
  repaid: number;
  note: string | null;
  date: string;
  settledAt: string | null;
  repayments: Array<{ id: string; amount: number; date: string; note: string | null }>;
}

export interface DebtTotals {
  receivable: number;
  payable: number;
  receivableCount: number;
  payableCount: number;
  netCashEffect: number;
}

export interface MonthlyBucket {
  month: string;
  income: number;
  expense: number;
  net: number;
  openingBalance: number;
  closingBalance: number;
}

export interface WalletSummary {
  /** Cash in hand: the ledger, less what you are owed, plus what you owe. */
  balance: number;
  /** income − expense on its own, before debts. */
  ledgerBalance: number;
  totalIncome: number;
  totalExpense: number;
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
  currency: string;
  period: { startDate: string | null; endDate: string | null };
  topCategories: Array<{ category: string; type: TransactionType; total: number; count: number }>;
  recentTransactions: Transaction[];
  debts: DebtTotals;
  monthly: MonthlyBucket[];
}

export interface SearchResult {
  transactions: Transaction[];
  totalCount: number;
  returnedCount: number;
  hasMore: boolean;
  totals: { income: number; expense: number; net: number };
  appliedFilters: Record<string, unknown>;
}

/** Filter state shared between the filter bar and the transactions table. */
export interface TransactionFilters {
  type: TransactionType | 'ALL';
  category: string;
  startDate: string;
  endDate: string;
  minAmount: string;
  maxAmount: string;
  search: string;
}

export const EMPTY_FILTERS: TransactionFilters = {
  type: 'ALL',
  category: 'ALL',
  startDate: '',
  endDate: '',
  minAmount: '',
  maxAmount: '',
  search: '',
};

/** Response from POST /api/wallet/ask — natural-language search. */
export interface AskResponse {
  question: string;
  filters: {
    type?: TransactionType;
    category?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: number;
    maxAmount?: number;
    search?: string;
    limit: number;
    offset: number;
    sortBy: 'date' | 'amount' | 'createdAt';
    sortOrder: 'asc' | 'desc';
  };
  result: SearchResult;
  chart: { type: ChartType; data: ChartData };
  headline: string;
  model: string;
}

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'table';
export type ChartGroupBy = 'month' | 'category' | 'type' | 'day';

export interface ChartBucket {
  key: string;
  label: string;
  income: number;
  expense: number;
  /** Signed net for time buckets, magnitude for categorical ones. */
  total: number;
  /** Always non-negative — what pie and donut slices read. */
  value: number;
  count: number;
}

export interface ChartData {
  groupBy: ChartGroupBy;
  buckets: ChartBucket[];
  truncated: boolean;
}
