'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { todayISODate } from '@/lib/utils';
import type { Category, TransactionType } from '@/lib/types';

interface AddTransactionDialogProps {
  categories: Category[];
  onCreated: () => Promise<void> | void;
}

const NEW_CATEGORY = '__new__';

export function AddTransactionDialog({ categories, onCreated }: AddTransactionDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [categorySelection, setCategorySelection] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISODate());

  function reset() {
    setType('EXPENSE');
    setAmount('');
    setCategorySelection('');
    setNewCategory('');
    setNote('');
    setDate(todayISODate());
    setError(null);
  }

  // The category is either an existing name or one typed into the "new" field.
  const resolvedCategory = categorySelection === NEW_CATEGORY ? newCategory.trim() : categorySelection;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter an amount greater than 0.');
      return;
    }
    if (!resolvedCategory) {
      setError('Choose or enter a category.');
      return;
    }

    setSubmitting(true);
    try {
      await api.addTransaction({
        type,
        amount: parsedAmount,
        category: resolvedCategory,
        note: note.trim() || undefined,
        date: date || undefined,
      });
      await onCreated();
      reset();
      setOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add transaction
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>Record income or an expense in your wallet.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tx-type">Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as TransactionType)}>
                <SelectTrigger id="tx-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">Expense</SelectItem>
                  <SelectItem value="INCOME">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tx-amount">Amount</Label>
              <Input
                id="tx-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-category">Category</Label>
            <Select value={categorySelection} onValueChange={setCategorySelection}>
              <SelectTrigger id="tx-category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.icon ? `${category.icon} ` : ''}
                    {category.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_CATEGORY}>+ New category…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {categorySelection === NEW_CATEGORY && (
            <div className="space-y-1.5">
              <Label htmlFor="tx-new-category">New category name</Label>
              <Input
                id="tx-new-category"
                placeholder="e.g. Coffee"
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tx-date">Date</Label>
            <Input id="tx-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-note">Note (optional)</Label>
            <Input
              id="tx-note"
              placeholder="What was this for?"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              {submitting ? 'Saving…' : 'Save transaction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
