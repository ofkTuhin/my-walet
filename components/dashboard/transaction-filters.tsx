'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { EMPTY_FILTERS, type Category, type TransactionFilters } from '@/lib/types';
import { cn } from '@/lib/utils';

interface FiltersProps {
  filters: TransactionFilters;
  categories: Category[];
  onChange: (filters: TransactionFilters) => void;
}

/**
 * Filter bar mirroring the `search_transactions` MCP tool's parameters, so the
 * dashboard and an AI assistant can express exactly the same queries.
 */
export function TransactionFiltersBar({ filters, categories, onChange }: FiltersProps) {
  // Collapsed on phones by default. Expanded, this form is taller than the
  // viewport, which pushed the transactions themselves off the first screen.
  const [open, setOpen] = useState(false);

  const set = <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const isDirty = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const activeCount = (Object.keys(filters) as Array<keyof TransactionFilters>).filter(
    (key) => filters[key] !== EMPTY_FILTERS[key],
  ).length;

  return (
    <Card>
      <CardContent className="p-4">
        {/* Only a control below md; from md up the form is always visible. */}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="transaction-filters"
          className={cn(
            'flex w-full items-center gap-2 text-sm font-medium md:hidden',
            'transition-colors duration-200',
            open ? 'mb-4' : '',
          )}
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0" />
          Filters
          {activeCount > 0 ? (
            <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs tabular-nums">
              {activeCount}
            </span>
          ) : null}
          <span
            aria-hidden
            className={cn(
              'text-muted-foreground ml-auto transition-transform duration-300',
              open && 'rotate-180',
            )}
          >
            ▾
          </span>
        </button>

        <div
          id="transaction-filters"
          className={cn(
            'grid gap-4 md:grid-cols-2 lg:grid-cols-4',
            open ? 'grid' : 'hidden md:grid',
          )}
        >
          <div className="space-y-1.5">
            <Label htmlFor="filter-search">Search</Label>
            <Input
              id="filter-search"
              placeholder="Note or category…"
              value={filters.search}
              onChange={(event) => set('search', event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-type">Type</Label>
            <Select value={filters.type} onValueChange={(value) => set('type', value as TransactionFilters['type'])}>
              <SelectTrigger id="filter-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                <SelectItem value="INCOME">Income</SelectItem>
                <SelectItem value="EXPENSE">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-category">Category</Label>
            <Select value={filters.category} onValueChange={(value) => set('category', value)}>
              <SelectTrigger id="filter-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.icon ? `${category.icon} ` : ''}
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="filter-min">Min amount</Label>
              <Input
                id="filter-min"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={filters.minAmount}
                onChange={(event) => set('minAmount', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-max">Max amount</Label>
              <Input
                id="filter-max"
                type="number"
                min="0"
                step="0.01"
                placeholder="Any"
                value={filters.maxAmount}
                onChange={(event) => set('maxAmount', event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-start">From date</Label>
            <Input
              id="filter-start"
              type="date"
              value={filters.startDate}
              onChange={(event) => set('startDate', event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-end">To date</Label>
            <Input
              id="filter-end"
              type="date"
              value={filters.endDate}
              onChange={(event) => set('endDate', event.target.value)}
            />
          </div>

          <div className="flex items-end lg:col-span-2">
            {isDirty && (
              <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>
                <X /> Clear filters
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
