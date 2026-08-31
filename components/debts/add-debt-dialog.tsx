'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn, todayISODate } from '@/lib/utils';
import type { DebtDirection } from '@/lib/types';

/** Records money lent out or borrowed. */
export function AddDebtDialog({ onCreated }: { onCreated: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<DebtDirection>('RECEIVABLE');
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISODate());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDirection('RECEIVABLE');
    setCounterparty('');
    setAmount('');
    setNote('');
    setDate(todayISODate());
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!counterparty.trim() || !Number.isFinite(value) || value <= 0) {
      setError('Enter a name and an amount greater than zero.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.addDebt({
        direction,
        counterparty: counterparty.trim(),
        amount: value,
        note: note.trim() || undefined,
        date,
      });
      await onCreated();
      setOpen(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button aria-label="Record a debt" className="max-sm:h-9 max-sm:w-9 max-sm:p-0">
          <Plus />
          <span className="max-sm:hidden">Record a debt</span>
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a debt</DialogTitle>
          <DialogDescription>
            Lending moves cash out of your balance, borrowing moves it in. Both stay listed
            until they are repaid.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Two buttons rather than a select: there are only two directions and
              the wording matters more than the control. */}
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'RECEIVABLE' as const, label: 'I lent money', hint: 'they owe me' },
              { value: 'PAYABLE' as const, label: 'I borrowed money', hint: 'I owe them' },
            ]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDirection(option.value)}
                aria-pressed={direction === option.value}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left transition-colors duration-200',
                  direction === option.value ? 'border-primary bg-accent' : 'hover:bg-accent/50',
                )}
              >
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="text-muted-foreground block text-xs">{option.hint}</span>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debt-counterparty">
              {direction === 'RECEIVABLE' ? 'Who owes you' : 'Who you owe'}
            </Label>
            <Input
              id="debt-counterparty"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="Name"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="debt-amount">Amount</Label>
              <Input
                id="debt-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-date">Date</Label>
              <Input id="debt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debt-note">Note</Label>
            <Input
              id="debt-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </div>

          {error ? <p className="text-sm text-[var(--expense)]">{error}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
