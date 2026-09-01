import { z } from 'zod';

/**
 * Runtime validation shared by the MCP tool handlers and the REST API.
 *
 * MCP advertises hand-written JSON Schemas to the model (see
 * `src/mcp/tool-schemas.ts`), but an MCP client is free to send anything, so
 * every payload is re-validated here before it reaches Prisma.
 */

export const transactionTypeSchema = z.enum(['INCOME', 'EXPENSE']);

/**
 * Accepts `YYYY-MM-DD` or a full ISO-8601 timestamp.
 *
 * A bare date is anchored at 12:00 UTC rather than midnight so that rendering
 * it in a timezone behind UTC cannot shift it to the previous calendar day.
 */
export const flexibleDateSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value, ctx) => {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
    const iso = dateOnly.test(value) ? `${value}T12:00:00.000Z` : value;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid date "${value}". Use YYYY-MM-DD or a full ISO-8601 timestamp.`,
      });
      return z.NEVER;
    }
    return parsed;
  });

export const addTransactionSchema = z.object({
  type: transactionTypeSchema,
  amount: z
    .number()
    .finite()
    .positive('amount must be greater than 0 — use `type` to indicate direction')
    .max(9_999_999_999.99, 'amount exceeds the Decimal(12,2) column limit'),
  category: z.string().trim().min(1, 'category is required').max(64),
  note: z.string().trim().max(500).optional().nullable(),
  date: flexibleDateSchema.optional(),
});
export type AddTransactionInput = z.infer<typeof addTransactionSchema>;

export const searchTransactionsSchema = z
  .object({
    type: transactionTypeSchema.optional(),
    category: z.string().trim().min(1).max(64).optional(),
    startDate: flexibleDateSchema.optional(),
    endDate: flexibleDateSchema.optional(),
    minAmount: z.number().finite().nonnegative().optional(),
    maxAmount: z.number().finite().nonnegative().optional(),
    search: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
    sortBy: z.enum(['date', 'amount', 'createdAt']).default('date'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine((v) => !(v.startDate && v.endDate) || v.startDate <= v.endDate, {
    message: 'startDate must be on or before endDate',
    path: ['startDate'],
  })
  .refine((v) => !(v.minAmount !== undefined && v.maxAmount !== undefined) || v.minAmount <= v.maxAmount, {
    message: 'minAmount must be less than or equal to maxAmount',
    path: ['minAmount'],
  });
export type SearchTransactionsInput = z.infer<typeof searchTransactionsSchema>;

export const deleteTransactionSchema = z.object({
  id: z.string().trim().min(1, 'id is required'),
});

export const walletSummarySchema = z.object({
  recentLimit: z.number().int().min(0).max(100).default(5),
  startDate: flexibleDateSchema.optional(),
  endDate: flexibleDateSchema.optional(),
});

export const debtDirectionSchema = z.enum(['RECEIVABLE', 'PAYABLE']);

export const addDebtSchema = z.object({
  direction: debtDirectionSchema,
  counterparty: z.string().trim().min(1, 'counterparty is required').max(120),
  amount: z
    .number()
    .finite()
    .positive('amount must be greater than 0 — use `direction` to indicate which way it points')
    .max(9_999_999_999.99, 'amount exceeds the Decimal(12,2) column limit'),
  note: z.string().trim().max(500).optional().nullable(),
  date: flexibleDateSchema.optional(),
});
export type AddDebtInput = z.infer<typeof addDebtSchema>;

export const addRepaymentSchema = z.object({
  amount: z
    .number()
    .finite()
    .positive('a repayment must be greater than 0')
    .max(9_999_999_999.99, 'amount exceeds the Decimal(12,2) column limit'),
  note: z.string().trim().max(500).optional().nullable(),
  date: flexibleDateSchema.optional(),
});
export type AddRepaymentInput = z.infer<typeof addRepaymentSchema>;

export const listDebtsSchema = z.object({
  direction: debtDirectionSchema.optional(),
  includeSettled: z.boolean().default(false),
});

export const updateAccountSchema = z.object({
  /// Negative is allowed on purpose: an account can legitimately start overdrawn.
  openingBalance: z
    .number()
    .finite()
    .min(-9_999_999_999.99, 'openingBalance exceeds the Decimal(12,2) column limit')
    .max(9_999_999_999.99, 'openingBalance exceeds the Decimal(12,2) column limit'),
  /// `YYYY-MM`. Null clears the anchor, applying the balance from the earliest
  /// month on record.
  openingBalanceMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'openingBalanceMonth must be YYYY-MM')
    .nullable()
    .optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(64),
  type: transactionTypeSchema.optional().nullable(),
  color: z
    .string()
    .trim()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'color must be a hex value like #16a34a')
    .optional()
    .nullable(),
  icon: z.string().trim().max(32).optional().nullable(),
});

/** Flattens a ZodError into a single human-readable line. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}
