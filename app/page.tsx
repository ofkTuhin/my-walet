'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AddTransactionDialog } from '@/components/dashboard/add-transaction-dialog';
import { AskBar } from '@/components/dashboard/ask-bar';
import { IncomeExpenseBar } from '@/components/dashboard/income-expense-bar';
import { SummaryCards } from '@/components/dashboard/summary-cards';
import { TransactionTable } from '@/components/dashboard/transaction-table';
import { AppShell } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { EMPTY_FILTERS, type Category, type SearchResult, type WalletSummary } from '@/lib/types';

/**
 * The overview. Filtering and paging live on /transactions now, so this page
 * answers one question — how am I doing — rather than four at once.
 */
export default function DashboardPage() {
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [recent, setRecent] = useState<SearchResult | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    setError(null);
    try {
      const [summaryData, categoryData, recentData] = await Promise.all([
        api.getSummary(),
        api.getCategories(),
        api.searchTransactions(EMPTY_FILTERS, { limit: 8, sortBy: 'date', sortOrder: 'desc' }),
      ]);
      setSummary(summaryData);
      setCategories(categoryData);
      setRecent(recentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  async function handleDelete(id: string) {
    await api.deleteTransaction(id);
    await refreshAll();
  }

  return (
    <AppShell
      title="Dashboard"
      actions={
        <>
          <Button variant="outline" size="icon" aria-label="Refresh" onClick={() => void refreshAll()}>
            <RefreshCw />
          </Button>
          <AddTransactionDialog categories={categories} onCreated={refreshAll} />
        </>
      }
    >
      {error && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 animate-enter mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
        >
          <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-destructive font-medium">Could not reach the wallet API</p>
            <p className="text-muted-foreground mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <SummaryCards summary={summary} loading={loading} />

        <div className="animate-enter" style={{ animationDelay: '140ms' }}>
          <AskBar />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="animate-enter lg:col-span-1" style={{ animationDelay: '200ms' }}>
            <IncomeExpenseBar summary={summary} />
          </div>

          <div className="animate-enter space-y-3 lg:col-span-2" style={{ animationDelay: '260ms' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight">Recent activity</h2>
              <Link
                href="/transactions"
                className="text-muted-foreground hover:text-foreground group text-xs transition-colors"
              >
                View all{' '}
                <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            </div>
            <TransactionTable result={recent} loading={loading} onDelete={handleDelete} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
