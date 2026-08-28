'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { AddTransactionDialog } from '@/components/dashboard/add-transaction-dialog';
import { AskBar } from '@/components/dashboard/ask-bar';
import { IncomeExpenseBar } from '@/components/dashboard/income-expense-bar';
import { SummaryCards } from '@/components/dashboard/summary-cards';
import { TransactionFiltersBar } from '@/components/dashboard/transaction-filters';
import { TransactionTable } from '@/components/dashboard/transaction-table';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { EMPTY_FILTERS, type Category, type SearchResult, type TransactionFilters, type WalletSummary } from '@/lib/types';

export default function DashboardPage() {
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);

  const [summaryLoading, setSummaryLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Guards against out-of-order filter responses: only the newest request is
   * allowed to write to state, so fast typing cannot leave stale rows behind.
   */
  const requestId = useRef(0);

  const loadSummary = useCallback(async () => {
    const [summaryData, categoryData] = await Promise.all([api.getSummary(), api.getCategories()]);
    setSummary(summaryData);
    setCategories(categoryData);
  }, []);

  const loadTransactions = useCallback(async (activeFilters: TransactionFilters) => {
    const id = ++requestId.current;
    setTableLoading(true);
    try {
      const data = await api.searchTransactions(activeFilters);
      if (id === requestId.current) setResult(data);
    } finally {
      if (id === requestId.current) setTableLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([loadSummary(), loadTransactions(filters)]);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to load wallet data.');
    } finally {
      setSummaryLoading(false);
    }
  }, [filters, loadSummary, loadTransactions]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadSummary();
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load wallet data.');
        }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSummary]);

  // Re-query whenever filters change, debounced so typing does not spam the API.
  useEffect(() => {
    const timer = setTimeout(() => {
      loadTransactions(filters).catch((filterError) => {
        setError(filterError instanceof Error ? filterError.message : 'Failed to load transactions.');
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [filters, loadTransactions]);

  const subtitle = useMemo(() => {
    if (!summary) return 'Loading your wallet…';
    return `${summary.transactionCount} transaction${summary.transactionCount === 1 ? '' : 's'} tracked`;
  }, [summary]);

  async function handleDelete(id: string) {
    await api.deleteTransaction(id);
    await refreshAll();
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Wallet</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Refresh" onClick={() => void refreshAll()}>
            <RefreshCw />
          </Button>
          <AddTransactionDialog categories={categories} onCreated={refreshAll} />
          <UserButton />
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Could not reach the wallet API</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <SummaryCards summary={summary} loading={summaryLoading} />

        <AskBar onFilters={setFilters} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <IncomeExpenseBar summary={summary} />
          </div>
          <div className="space-y-6 lg:col-span-2">
            <TransactionFiltersBar filters={filters} categories={categories} onChange={setFilters} />
            <TransactionTable result={result} loading={tableLoading} onDelete={handleDelete} />
          </div>
        </div>
      </div>
    </main>
  );
}
