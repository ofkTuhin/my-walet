'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatCurrency } from '@/lib/utils';
import type { MonthlyBucket, WalletSummary } from '@/lib/types';

/**
 * Month-by-month, with the balance carried forward.
 *
 * The rule this shows: a month that earns more than it spends hands a larger
 * balance to the next month, and a month that overspends hands on a smaller
 * one. The closing figure of the last row is the ledger balance — the summary
 * card differs from it by whatever is currently lent out or borrowed.
 */

function monthLabel(month: string): string {
  // `YYYY-MM` — parsed as UTC midday so the label cannot slip a month in
  // timezones behind UTC.
  const [year, m] = month.split('-');
  const date = new Date(Date.UTC(Number(year), Number(m) - 1, 15));
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function Row({ bucket, index, currency }: { bucket: MonthlyBucket; index: number; currency: string }) {
  const positive = bucket.net >= 0;

  return (
    <tr
      className="animate-enter hover:bg-accent/40 border-b transition-colors last:border-0"
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
    >
      <td className="px-3 py-3 font-medium whitespace-nowrap sm:px-4">{monthLabel(bucket.month)}</td>
      <td className="hidden px-4 py-3 text-right tabular-nums text-[var(--income)] sm:table-cell">
        {formatCurrency(bucket.income, currency)}
      </td>
      <td className="hidden px-4 py-3 text-right tabular-nums text-[var(--expense)] sm:table-cell">
        {formatCurrency(bucket.expense, currency)}
      </td>
      <td className="px-3 py-3 text-right sm:px-4">
        <span
          className={cn(
            'inline-flex items-center gap-1 font-medium tabular-nums',
            positive ? 'text-[var(--income)]' : 'text-[var(--expense)]',
          )}
        >
          {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {formatCurrency(Math.abs(bucket.net), currency)}
        </span>
        {/* On phones the income and expense columns are hidden, so the two
            figures behind this net are folded in here. */}
        <span className="text-muted-foreground mt-0.5 block text-xs tabular-nums sm:hidden">
          {formatCurrency(bucket.income, currency)} in · {formatCurrency(bucket.expense, currency)} out
        </span>
      </td>
      <td className="px-3 py-3 text-right font-semibold tabular-nums sm:px-4">
        {formatCurrency(bucket.closingBalance, currency)}
      </td>
    </tr>
  );
}

export function MonthlyBalance({ summary }: { summary: WalletSummary | null }) {
  if (!summary) return null;

  const { monthly, currency } = summary;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Month by month</CardTitle>
        <CardDescription>
          What each month left over, carried into the next. A month that spends more than it
          earns takes the balance back down.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {monthly.length === 0 ? (
          <p className="text-muted-foreground px-6 pb-6 text-sm">
            No transactions yet, so there is nothing to carry forward.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium sm:px-4">Month</th>
                  <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">In</th>
                  <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Out</th>
                  <th className="px-3 py-2 text-right font-medium sm:px-4">Left over</th>
                  <th className="px-3 py-2 text-right font-medium sm:px-4">Balance</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((bucket, index) => (
                  <Row key={bucket.month} bucket={bucket} index={index} currency={currency} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
