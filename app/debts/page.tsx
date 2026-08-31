'use client';

import { useCallback, useEffect, useState } from 'react';

import { AddDebtDialog } from '@/components/debts/add-debt-dialog';
import { DebtList } from '@/components/debts/debt-list';
import { AppShell } from '@/components/shell/app-shell';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import type { Debt } from '@/lib/types';

/** Who owes you, and who you owe. */
export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [includeSettled, setIncludeSettled] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDebts(await api.getDebts({ includeSettled }));
    } finally {
      setLoading(false);
    }
  }, [includeSettled]);

  useEffect(() => {
    void load();
  }, [load]);

  const receivables = debts.filter((d) => d.direction === 'RECEIVABLE');
  const payables = debts.filter((d) => d.direction === 'PAYABLE');

  // Settled rows carry no outstanding amount, so they do not skew the headline.
  const sumOutstanding = (rows: Debt[]) =>
    rows.filter((d) => !d.settledAt).reduce((total, d) => total + d.outstanding, 0);

  function Section({
    title, subtitle, rows, tone, empty,
  }: {
    title: string;
    subtitle: string;
    rows: Debt[];
    tone: 'income' | 'expense';
    empty: string;
  }) {
    return (
      <section className="bg-card min-w-0 rounded-xl border shadow-sm">
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p>
          </div>
          <AnimatedNumber
            value={sumOutstanding(rows)}
            format={(v) => formatCurrency(v)}
            className={cn(
              'shrink-0 text-lg font-semibold',
              tone === 'income' ? 'text-[var(--income)]' : 'text-[var(--expense)]',
            )}
          />
        </header>
        {loading ? (
          <div className="space-y-3 p-5">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : (
          <DebtList debts={rows} emptyMessage={empty} onChanged={load} />
        )}
      </section>
    );
  }

  return (
    <AppShell
      title="Debts"
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="max-sm:hidden"
            aria-pressed={includeSettled}
            onClick={() => setIncludeSettled((value) => !value)}
          >
            {includeSettled ? 'Hide settled' : 'Show settled'}
          </Button>
          <AddDebtDialog onCreated={load} />
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Owed to you"
          subtitle="Money you lent out. It has already left your balance."
          rows={receivables}
          tone="income"
          empty="Nobody owes you anything."
        />
        <Section
          title="You owe"
          subtitle="Money you borrowed. It is already counted in your balance."
          rows={payables}
          tone="expense"
          empty="You owe nothing."
        />
      </div>
    </AppShell>
  );
}
