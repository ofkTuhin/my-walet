'use client';

import { AnimatedNumber } from '@/components/ui/animated-number';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMountedFlag } from '@/lib/hooks/use-motion';
import { formatCurrency } from '@/lib/utils';
import type { WalletSummary } from '@/lib/types';

/**
 * Income vs expense comparison.
 *
 * Bars are scaled against the larger of the two values so the dominant side
 * always fills the track and the ratio between them stays readable.
 *
 * They also grow into place on first paint: watching the two tracks fill to
 * different lengths makes the ratio land harder than seeing it already drawn.
 */
export function IncomeExpenseBar({ summary }: { summary: WalletSummary | null }) {
  // Called before the early return: hooks cannot sit behind a condition.
  const grown = useMountedFlag();

  if (!summary) return null;

  const { totalIncome, totalExpense, currency } = summary;
  const max = Math.max(totalIncome, totalExpense, 1);
  const incomeWidth = (totalIncome / max) * 100;
  const expenseWidth = (totalExpense / max) * 100;
  const net = totalIncome - totalExpense;

  const rows = [
    { label: 'Income', value: totalIncome, width: incomeWidth, color: 'var(--income)' },
    { label: 'Expense', value: totalExpense, width: expenseWidth, color: 'var(--expense)' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Income vs expense</CardTitle>
        <CardDescription>
          {net >= 0
            ? `You are up ${formatCurrency(net, currency)} overall.`
            : `You are down ${formatCurrency(Math.abs(net), currency)} overall.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => (
          <div key={row.label} className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span style={{ color: row.color }}>
                <AnimatedNumber
                  value={row.value}
                  format={(value) => formatCurrency(value, currency)}
                  className="font-medium"
                />
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out-quart"
                style={{ width: grown ? `${row.width}%` : '0%', backgroundColor: row.color }}
              />
            </div>
          </div>
        ))}

        {summary.topCategories.length > 0 && (
          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Top categories
            </p>
            <ul className="space-y-2">
              {summary.topCategories.slice(0, 4).map((category, index) => (
                <li
                  key={`${category.category}-${category.type}`}
                  className="animate-enter flex justify-between text-sm"
                  style={{ animationDelay: `${200 + index * 60}ms` }}
                >
                  <span className="truncate text-muted-foreground">
                    {category.category}
                    <span className="ml-1.5 text-xs opacity-60">({category.count})</span>
                  </span>
                  <span
                    className="ml-3 shrink-0 font-medium tabular-nums"
                    style={{ color: category.type === 'INCOME' ? 'var(--income)' : 'var(--expense)' }}
                  >
                    {formatCurrency(category.total, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
