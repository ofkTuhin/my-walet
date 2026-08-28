import { Prisma, type Transaction, type Category } from '@prisma/client';

/** JSON-safe shape of a transaction, as returned by MCP tools and the REST API. */
export interface TransactionDTO {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  category: string;
  note: string | null;
  date: string;
  createdAt: string;
  updatedAt: string;
  categoryId: string | null;
}

export interface CategoryDTO {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | null;
  color: string | null;
  icon: string | null;
  createdAt: string;
}

/**
 * Converts a Prisma `Decimal` to a JS number.
 *
 * Money is stored as Decimal(12,2) so arithmetic in Postgres stays exact. At
 * the API boundary it becomes a number, which is lossless for every value that
 * fits in Decimal(12,2) — max 9,999,999,999.99, far inside the 2^53 range
 * where doubles represent 2-dp values exactly.
 */
export function decimalToNumber(value: Prisma.Decimal | number | string | null): number {
  if (value === null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value);
  return value.toNumber();
}

/** Rounds to 2 decimal places, killing float drift from summing doubles. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toTransactionDTO(tx: Transaction): TransactionDTO {
  return {
    id: tx.id,
    type: tx.type,
    amount: decimalToNumber(tx.amount),
    category: tx.category,
    note: tx.note,
    date: tx.date.toISOString(),
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
    categoryId: tx.categoryId,
  };
}

export function toCategoryDTO(category: Category): CategoryDTO {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    color: category.color,
    icon: category.icon,
    createdAt: category.createdAt.toISOString(),
  };
}

/** Formats an amount for the human-readable text block of an MCP tool result. */
export function formatMoney(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}
