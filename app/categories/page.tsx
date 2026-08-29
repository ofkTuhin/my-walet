'use client';

import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { EMPTY_FILTERS, type Category, type SearchResult } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

/** Categories, each with what has actually been spent through it. */
export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [totals, setTotals] = useState<Map<string, { total: number; count: number }>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, all] = await Promise.all([
        api.getCategories(),
        // One pass over the ledger is cheaper than a request per category.
        api.searchTransactions(EMPTY_FILTERS, { limit: 200, sortBy: 'date', sortOrder: 'desc' }),
      ]);
      setCategories(cats);

      const map = new Map<string, { total: number; count: number }>();
      for (const t of (all as SearchResult).transactions) {
        const entry = map.get(t.category) ?? { total: 0, count: 0 };
        entry.total += t.amount;
        entry.count += 1;
        map.set(t.category, entry);
      }
      setTotals(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell title="Categories">
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-muted h-24 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="text-muted-foreground bg-card rounded-xl border py-16 text-center">
          <p className="font-medium">No categories yet</p>
          <p className="mt-1 text-sm">They are created automatically when you add a transaction.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const stat = totals.get(category.name);
            return (
              <div
                key={category.id}
                className="bg-card hover:border-foreground/20 rounded-xl border p-4 shadow-sm transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {category.icon ? <span aria-hidden>{category.icon}</span> : null}
                    <span className="font-medium">{category.name}</span>
                  </div>
                  {category.type ? (
                    <Badge variant={category.type === 'INCOME' ? 'income' : 'expense'}>
                      {category.type === 'INCOME' ? 'Income' : 'Expense'}
                    </Badge>
                  ) : (
                    <Badge>Both</Badge>
                  )}
                </div>
                <p className="mt-3 text-2xl font-semibold tabular-nums">
                  {stat ? formatCurrency(stat.total) : formatCurrency(0)}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {stat ? `${stat.count} transaction${stat.count === 1 ? '' : 's'}` : 'No activity yet'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
