'use client';

import { Check, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Debt } from '@/lib/types';

/**
 * One side of the debt ledger.
 *
 * Repayment is inline rather than behind a dialog: it is the action people come
 * to this page to perform, and the amount is pre-filled with what is left so
 * settling in full is a single click.
 */
export function DebtList({
  debts,
  emptyMessage,
  onChanged,
}: {
  debts: Debt[];
  emptyMessage: string;
  onChanged: () => void | Promise<void>;
}) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startRepay(debt: Debt) {
    setError(null);
    setPayingId(debt.id);
    // Pre-filled with the full remainder: settling outright is the common case.
    setPayAmount(String(debt.outstanding));
  }

  async function submitRepay(debt: Debt) {
    const value = Number(payAmount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setBusyId(debt.id);
    setError(null);
    try {
      await api.addRepayment(debt.id, { amount: value });
      setPayingId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record that repayment.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(debt: Debt) {
    setBusyId(debt.id);
    try {
      await api.deleteDebt(debt.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that.');
    } finally {
      setBusyId(null);
    }
  }

  if (debts.length === 0) {
    return (
      <p className="text-muted-foreground animate-enter px-5 py-8 text-center text-sm">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div>
      {error ? <p className="px-5 pt-3 text-sm text-[var(--expense)]">{error}</p> : null}
      <ul>
        {debts.map((debt, index) => {
          const settled = debt.settledAt !== null;
          const progress = debt.principal > 0 ? (debt.repaid / debt.principal) * 100 : 0;

          return (
            <li
              key={debt.id}
              style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
              className={cn(
                'animate-enter border-b px-5 py-4 transition-opacity last:border-0',
                busyId === debt.id && 'pointer-events-none opacity-50',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{debt.counterparty}</span>
                    {settled ? <Badge variant="income">Settled</Badge> : null}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {formatDate(debt.date)}
                    {debt.note ? ` · ${debt.note}` : ''}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-semibold tabular-nums">
                    {formatCurrency(settled ? debt.principal : debt.outstanding)}
                  </p>
                  {debt.repaid > 0 && !settled ? (
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatCurrency(debt.repaid)} of {formatCurrency(debt.principal)} repaid
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Only worth drawing once something has been paid back. */}
              {debt.repaid > 0 && !settled ? (
                <div className="bg-muted mt-3 h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
              ) : null}

              {!settled ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {payingId === debt.id ? (
                    <>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        aria-label={`Repayment amount for ${debt.counterparty}`}
                        className="h-8 w-32"
                      />
                      <Button size="sm" onClick={() => void submitRepay(debt)}>
                        <Check className="h-3.5 w-3.5" />
                        Record
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPayingId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => startRepay(debt)}>
                      Record repayment
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete debt for ${debt.counterparty}`}
                    onClick={() => void remove(debt)}
                    className="text-muted-foreground hover:text-[var(--expense)] ml-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
