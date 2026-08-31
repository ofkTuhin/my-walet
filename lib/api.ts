import type {
  AskResponse,
  Category,
  Debt,
  DebtDirection,
  SearchResult,
  Transaction,
  TransactionFilters,
  WalletSummary,
} from './types';
import { EMPTY_FILTERS } from './types';

/**
 * Browser-side client for the Next.js proxy at /api/wallet/*.
 *
 * The proxy forwards to the Express backend server-side, so the backend URL
 * stays private and no CORS preflight is involved.
 */
const BASE = '/api/wallet';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });

  if (!response.ok) {
    // The backend reports failures as { error, details }; fall back to status.
    const body = await response.json().catch(() => null);
    const message = body?.details || body?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export interface PageOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'date' | 'amount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/** Turns the UI filter state into a query string, dropping empty/ALL values. */
export function filtersToQuery(
  filters: TransactionFilters,
  page: PageOptions | number = {},
): string {
  // Historically this took a bare `limit`; keep that call shape working.
  const opts: PageOptions = typeof page === 'number' ? { limit: page } : page;
  const params = new URLSearchParams();

  if (filters.type !== 'ALL') params.set('type', filters.type);
  if (filters.category && filters.category !== 'ALL') params.set('category', filters.category);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.minAmount) params.set('minAmount', filters.minAmount);
  if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
  if (filters.search) params.set('search', filters.search);
  params.set('limit', String(opts.limit ?? 100));
  if (opts.offset) params.set('offset', String(opts.offset));
  if (opts.sortBy) params.set('sortBy', opts.sortBy);
  if (opts.sortOrder) params.set('sortOrder', opts.sortOrder);

  return params.toString();
}

/**
 * Maps the filters Claude produced back onto the dashboard's filter controls,
 * so the UI visibly reflects how the question was interpreted. Dates arrive as
 * full ISO timestamps and the date inputs need plain YYYY-MM-DD.
 */
export function askFiltersToUiFilters(filters: AskResponse['filters']): TransactionFilters {
  return {
    ...EMPTY_FILTERS,
    type: filters.type ?? 'ALL',
    category: filters.category ?? 'ALL',
    startDate: filters.startDate ? filters.startDate.slice(0, 10) : '',
    endDate: filters.endDate ? filters.endDate.slice(0, 10) : '',
    minAmount: filters.minAmount !== undefined ? String(filters.minAmount) : '',
    maxAmount: filters.maxAmount !== undefined ? String(filters.maxAmount) : '',
    search: filters.search ?? '',
  };
}

export const api = {
  ask: (question: string) =>
    request<AskResponse>('/ask', { method: 'POST', body: JSON.stringify({ question }) }),

  getSummary: () => request<WalletSummary>('/summary?recentLimit=5'),

  searchTransactions: (filters: TransactionFilters, page?: PageOptions) =>
    request<SearchResult>(`/transactions?${filtersToQuery(filters, page ?? {})}`),

  getCategories: () => request<Category[]>('/categories'),

  addTransaction: (input: {
    type: string;
    amount: number;
    category: string;
    note?: string;
    date?: string;
  }) =>
    request<Transaction>('/transactions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  deleteTransaction: (id: string) =>
    request<{ deleted: boolean; transaction: Transaction }>(`/transactions/${id}`, {
      method: 'DELETE',
    }),

  getDebts: (options: { direction?: DebtDirection; includeSettled?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (options.direction) query.set('direction', options.direction);
    if (options.includeSettled) query.set('includeSettled', 'true');
    const suffix = query.toString();
    return request<Debt[]>(`/debts${suffix ? `?${suffix}` : ''}`);
  },

  addDebt: (input: {
    direction: DebtDirection;
    counterparty: string;
    amount: number;
    note?: string;
    date?: string;
  }) => request<Debt>('/debts', { method: 'POST', body: JSON.stringify(input) }),

  /** Returns the whole debt, so the caller sees the new outstanding amount. */
  addRepayment: (debtId: string, input: { amount: number; note?: string; date?: string }) =>
    request<Debt>(`/debts/${debtId}/repayments`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  deleteDebt: (id: string) =>
    request<{ deleted: boolean; debt: Debt }>(`/debts/${id}`, { method: 'DELETE' }),
};
