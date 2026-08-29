'use client';

import { AlertCircle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AddTransactionDialog } from '@/components/dashboard/add-transaction-dialog';
import { AskBar } from '@/components/dashboard/ask-bar';
import { TransactionFiltersBar } from '@/components/dashboard/transaction-filters';
import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, type PageOptions } from '@/lib/api';
import { EMPTY_FILTERS, type Category, type SearchResult, type TransactionFilters } from '@/lib/types';
import { cn, formatCurrency, formatDate } from '@/lib/utils';

type SortBy = 'date' | 'amount' | 'createdAt';
const PAGE_SIZES = [25, 50, 100];

export default function TransactionsPage() {
  const [result, setResult] = useState<SearchResult | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);

  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState(25);
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Only the newest request may write to state, so fast typing cannot leave stale rows. */
  const requestId = useRef(0);

  const load = useCallback(
    async (activeFilters: TransactionFilters, page: PageOptions) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const data = await api.searchTransactions(activeFilters, page);
        if (id === requestId.current) {
          setResult(data);
          setError(null);
        }
      } catch (err) {
        if (id === requestId.current) {
          setError(err instanceof Error ? err.message : 'Failed to load transactions.');
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => undefined);
  }, []);

  // Debounced so typing in the filter bar does not spam the API.
  useEffect(() => {
    const timer = setTimeout(() => {
      void load(filters, { limit: pageSize, offset, sortBy, sortOrder });
    }, 250);
    return () => clearTimeout(timer);
  }, [filters, pageSize, offset, sortBy, sortOrder, load]);

  // Any change to what is being asked for invalidates the current page number.
  function changeFilters(next: TransactionFilters) {
    setOffset(0);
    setFilters(next);
  }

  function toggleSort(column: SortBy) {
    setOffset(0);
    if (sortBy === column) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.deleteTransaction(id);
      await load(filters, { limit: pageSize, offset, sortBy, sortOrder });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.');
    } finally {
      setDeletingId(null);
    }
  }

  const total = result?.totalCount ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);
  const canPrev = offset > 0;
  const canNext = offset + pageSize < total;

  function SortHeader({ column, label, align }: { column: SortBy; label: string; align?: 'right' }) {
    const active = sortBy === column;
    return (
      <th className={cn('px-4 py-2', align === 'right' ? 'text-right' : 'text-left')}>
        <button
          type="button"
          onClick={() => toggleSort(column)}
          aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
          className={cn(
            'inline-flex items-center gap-1 rounded font-medium transition-colors',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
            active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
          {active ? (
            sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          ) : null}
        </button>
      </th>
    );
  }

  return (
    <AppShell
      title="Transactions"
      actions={
        <>
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh"
            onClick={() => void load(filters, { limit: pageSize, offset, sortBy, sortOrder })}
          >
            <RefreshCw />
          </Button>
          <AddTransactionDialog
            categories={categories}
            onCreated={() => load(filters, { limit: pageSize, offset, sortBy, sortOrder })}
          />
        </>
      }
    >
      <div className="space-y-4">
        <AskBar onFilters={changeFilters} />

        <TransactionFiltersBar filters={filters} categories={categories} onChange={changeFilters} />

        {error && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
          >
            <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-destructive">{error}</p>
          </div>
        )}

        <div className="bg-card rounded-xl border shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b text-xs">
                <tr>
                  <SortHeader column="date" label="Date" />
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-left font-medium">Category</th>
                  <th className="px-4 py-2 text-left font-medium">Note</th>
                  <SortHeader column="amount" label="Amount" align="right" />
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {loading && !result ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="bg-muted h-4 w-full animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                ) : result && result.transactions.length > 0 ? (
                  result.transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-accent/40 border-b transition-colors last:border-0">
                      <td className="text-muted-foreground px-4 py-3 whitespace-nowrap tabular-nums">
                        {formatDate(t.date)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={t.type === 'INCOME' ? 'income' : 'expense'}>
                          {t.type === 'INCOME' ? 'Income' : 'Expense'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-medium">{t.category}</td>
                      <td className="text-muted-foreground max-w-[20rem] truncate px-4 py-3">
                        {t.note || '—'}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right font-medium tabular-nums',
                          t.type === 'INCOME' ? 'text-[var(--income)]' : 'text-[var(--expense)]',
                        )}
                      >
                        {t.type === 'INCOME' ? '+' : '−'}
                        {formatCurrency(t.amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deletingId === t.id}
                          onClick={() => void handleDelete(t.id)}
                          className="text-muted-foreground hover:text-[var(--expense)]"
                        >
                          {deletingId === t.id ? 'Deleting…' : 'Delete'}
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground px-4 py-12 text-center">
                      <p className="font-medium">No transactions found</p>
                      <p className="mt-1 text-xs">Try clearing the filters, or add your first one.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs">
            <p className="text-muted-foreground">
              {total === 0 ? 'No results' : `${from}–${to} of ${total}`}
              {result ? (
                <span className="ml-3">
                  net{' '}
                  <span className={result.totals.net >= 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'}>
                    {formatCurrency(result.totals.net)}
                  </span>
                </span>
              ) : null}
            </p>

            <div className="flex items-center gap-3">
              <label className="text-muted-foreground flex items-center gap-2">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setOffset(0);
                    setPageSize(Number(e.target.value));
                  }}
                  className="border-input bg-background rounded-md border px-2 py-1"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canPrev}
                  onClick={() => setOffset(Math.max(0, offset - pageSize))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canNext}
                  onClick={() => setOffset(offset + pageSize)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
