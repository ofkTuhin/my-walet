'use client';

import { ArrowDownRight, ArrowUpRight, Receipt, Wallet } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatCurrency } from '@/lib/utils';
import type { WalletSummary } from '@/lib/types';

interface SummaryCardsProps {
  summary: WalletSummary | null;
  loading: boolean;
  /** Offsets the stagger so the cards follow whatever enters above them. */
  startDelay?: number;
}

/** Cards arrive in sequence rather than all at once; short enough not to wait on. */
const STAGGER_MS = 70;

function StatCard({
  title,
  value,
  format,
  hint,
  icon,
  valueClassName,
  index,
  startDelay,
}: {
  title: string;
  value: number;
  format: (value: number) => string;
  hint: string;
  icon: React.ReactNode;
  valueClassName?: string;
  index: number;
  startDelay: number;
}) {
  return (
    <Card
      className={cn(
        'group animate-enter transition-[transform,box-shadow,border-color] duration-200',
        'hover:border-foreground/15 hover:-translate-y-0.5 hover:shadow-md',
      )}
      style={{ animationDelay: `${startDelay + index * STAGGER_MS}ms` }}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className="text-muted-foreground transition-[transform,color] duration-200 group-hover:scale-110 group-hover:text-foreground">
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <AnimatedNumber
          value={value}
          format={format}
          className={cn('block text-2xl font-semibold tracking-tight', valueClassName)}
        />
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function SkeletonCard({ index, startDelay }: { index: number; startDelay: number }) {
  return (
    <Card className="animate-enter" style={{ animationDelay: `${startDelay + index * STAGGER_MS}ms` }}>
      <CardHeader className="pb-2">
        <div className="skeleton h-4 w-24 rounded" />
      </CardHeader>
      <CardContent>
        <div className="skeleton h-8 w-32 rounded" />
        <div className="skeleton mt-2 h-3 w-20 rounded" />
      </CardContent>
    </Card>
  );
}

export function SummaryCards({ summary, loading, startDelay = 0 }: SummaryCardsProps) {
  if (loading || !summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} index={i} startDelay={startDelay} />
        ))}
      </div>
    );
  }

  const { balance, totalIncome, totalExpense, transactionCount, incomeCount, expenseCount } = summary;

  // A negative balance is a real state worth signalling, not just a minus sign.
  const balanceTone = balance < 0 ? 'text-[var(--expense)]' : 'text-foreground';
  const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

  const money = (value: number) => formatCurrency(value, summary.currency);
  // Counts pass through a fractional value mid-flight; only whole ones make sense.
  const whole = (value: number) => String(Math.round(value));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        index={0}
        startDelay={startDelay}
        title="Current balance"
        value={balance}
        format={money}
        hint={totalIncome > 0 ? `${savingsRate}% of income retained` : 'No income recorded yet'}
        icon={<Wallet className="h-4 w-4" />}
        valueClassName={balanceTone}
      />
      <StatCard
        index={1}
        startDelay={startDelay}
        title="Total income"
        value={totalIncome}
        format={money}
        hint={`${incomeCount} transaction${incomeCount === 1 ? '' : 's'}`}
        icon={<ArrowUpRight className="h-4 w-4" />}
        valueClassName="text-[var(--income)]"
      />
      <StatCard
        index={2}
        startDelay={startDelay}
        title="Total expense"
        value={totalExpense}
        format={money}
        hint={`${expenseCount} transaction${expenseCount === 1 ? '' : 's'}`}
        icon={<ArrowDownRight className="h-4 w-4" />}
        valueClassName="text-[var(--expense)]"
      />
      <StatCard
        index={3}
        startDelay={startDelay}
        title="All transactions"
        value={transactionCount}
        format={whole}
        hint={summary.topCategories[0] ? `Top: ${summary.topCategories[0].category}` : 'No categories yet'}
        icon={<Receipt className="h-4 w-4" />}
      />
    </div>
  );
}
