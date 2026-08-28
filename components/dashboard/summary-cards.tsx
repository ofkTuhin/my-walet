'use client';

import { ArrowDownRight, ArrowUpRight, Receipt, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatCurrency } from '@/lib/utils';
import type { WalletSummary } from '@/lib/types';

interface SummaryCardsProps {
  summary: WalletSummary | null;
  loading: boolean;
}

function StatCard({
  title,
  value,
  hint,
  icon,
  valueClassName,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-semibold tabular-nums tracking-tight', valueClassName)}>{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

export function SummaryCards({ summary, loading }: SummaryCardsProps) {
  if (loading || !summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const { balance, totalIncome, totalExpense, transactionCount, incomeCount, expenseCount } = summary;

  // A negative balance is a real state worth signalling, not just a minus sign.
  const balanceTone = balance < 0 ? 'text-[var(--expense)]' : 'text-foreground';
  const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Current balance"
        value={formatCurrency(balance, summary.currency)}
        hint={totalIncome > 0 ? `${savingsRate}% of income retained` : 'No income recorded yet'}
        icon={<Wallet className="h-4 w-4" />}
        valueClassName={balanceTone}
      />
      <StatCard
        title="Total income"
        value={formatCurrency(totalIncome, summary.currency)}
        hint={`${incomeCount} transaction${incomeCount === 1 ? '' : 's'}`}
        icon={<ArrowUpRight className="h-4 w-4" />}
        valueClassName="text-[var(--income)]"
      />
      <StatCard
        title="Total expense"
        value={formatCurrency(totalExpense, summary.currency)}
        hint={`${expenseCount} transaction${expenseCount === 1 ? '' : 's'}`}
        icon={<ArrowDownRight className="h-4 w-4" />}
        valueClassName="text-[var(--expense)]"
      />
      <StatCard
        title="All transactions"
        value={String(transactionCount)}
        hint={summary.topCategories[0] ? `Top: ${summary.topCategories[0].category}` : 'No categories yet'}
        icon={<Receipt className="h-4 w-4" />}
      />
    </div>
  );
}
