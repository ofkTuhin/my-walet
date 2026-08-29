'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { SearchResult } from '@/lib/types';

interface TransactionTableProps {
  result: SearchResult | null;
  loading: boolean;
  onDelete: (id: string) => Promise<void>;
}

export function TransactionTable({ result, loading, onDelete }: TransactionTableProps) {
  // Tracks which row is mid-delete so only that button shows a spinner.
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  const transactions = result?.transactions ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Transactions</CardTitle>
          <CardDescription>
            {result
              ? `${result.returnedCount} of ${result.totalCount} matching · net ${formatCurrency(result.totals.net)}`
              : 'Loading…'}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading transactions…
          </div>
        ) : transactions.length === 0 ? (
          <div className="animate-enter px-6 py-16 text-center">
            <p className="text-sm font-medium">No transactions found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try clearing the filters, or add your first transaction.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              {/* Same priority order as the full transactions table: note goes
                  first, then type and category fold into the date cell. */}
              <TableRow>
                <TableHead className="px-3 sm:px-4">Date</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden sm:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Note</TableHead>
                <TableHead className="px-3 text-right sm:px-4">Amount</TableHead>
                <TableHead className="w-12 px-1 sm:px-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction, index) => {
                const isIncome = transaction.type === 'INCOME';
                const deleting = deletingId === transaction.id;
                return (
                  <TableRow
                    key={transaction.id}
                    style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
                    className={cn(
                      'animate-enter transition-[background-color,opacity,filter] duration-200',
                      deleting && 'pointer-events-none opacity-40 grayscale',
                    )}
                  >
                    <TableCell className="px-3 text-muted-foreground sm:px-4">
                      <span className="whitespace-nowrap">{formatDate(transaction.date)}</span>
                      <span className="mt-1 flex items-center gap-2 sm:hidden">
                        <Badge variant={isIncome ? 'income' : 'expense'}>
                          {isIncome ? 'Income' : 'Expense'}
                        </Badge>
                        <span className="truncate font-medium text-foreground">
                          {transaction.category}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={isIncome ? 'income' : 'expense'}>
                        {isIncome ? 'Income' : 'Expense'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden font-medium sm:table-cell">
                      {transaction.category}
                    </TableCell>
                    <TableCell className="hidden max-w-64 truncate text-muted-foreground lg:table-cell">
                      {transaction.note || '—'}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap px-3 text-right font-medium tabular-nums sm:px-4"
                      style={{ color: isIncome ? 'var(--income)' : 'var(--expense)' }}
                    >
                      {isIncome ? '+' : '−'}
                      {formatCurrency(transaction.amount)}
                    </TableCell>
                    <TableCell className="px-1 sm:px-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${transaction.category} transaction`}
                        disabled={deletingId === transaction.id}
                        onClick={() => handleDelete(transaction.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {deletingId === transaction.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Trash2 />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
