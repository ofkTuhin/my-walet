import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * JSON Schemas advertised to MCP clients via `tools/list`.
 *
 * These are written by hand rather than derived from Zod so the descriptions
 * can be tuned for the model — an LLM picks a tool almost entirely from this
 * text, so each field explains its units, format, and default. The Zod schemas
 * in `src/lib/validation.ts` enforce the same rules at runtime.
 */

const DATE_FORMAT_HINT =
  'Accepts `YYYY-MM-DD` (interpreted at 12:00 UTC) or a full ISO-8601 timestamp such as `2026-03-14T09:30:00Z`.';

export const TOOLS: Tool[] = [
  {
    name: 'get_wallet_summary',
    description:
      "Get the wallet's financial overview: current balance, total income, total expense, " +
      'transaction counts, the biggest spending/earning categories, and the most recent ' +
      'transactions. Call this first when the user asks how much money they have, how they ' +
      'are doing financially, or for a summary of a period. Optionally scope the whole ' +
      'summary to a date range.',
    inputSchema: {
      type: 'object',
      properties: {
        recentLimit: {
          type: 'integer',
          description: 'How many of the most recent transactions to include in the response.',
          minimum: 0,
          maximum: 100,
          default: 5,
        },
        startDate: {
          type: 'string',
          description: `Only include transactions on or after this date. ${DATE_FORMAT_HINT} Omit for all time.`,
        },
        endDate: {
          type: 'string',
          description: `Only include transactions on or before this date. ${DATE_FORMAT_HINT} Omit for all time.`,
        },
      },
      additionalProperties: false,
    },
    annotations: {
      title: 'Get wallet summary',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'add_transaction',
    description:
      'Record a new income or expense in the wallet. Use this whenever the user reports ' +
      'money coming in ("I got paid $2000") or going out ("I spent $30 on lunch"). The ' +
      'amount is always a positive number — direction is conveyed by `type`, never by a ' +
      'negative amount. If the category does not exist yet it is created automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['INCOME', 'EXPENSE'],
          description:
            'INCOME for money received (salary, refunds, gifts). EXPENSE for money spent.',
        },
        amount: {
          type: 'number',
          description:
            'Positive magnitude of the transaction in the wallet currency (USD). ' +
            'Do NOT pass a negative number for expenses — set `type` to EXPENSE instead. ' +
            'Stored with 2 decimal places.',
          exclusiveMinimum: 0,
          maximum: 9999999999.99,
        },
        category: {
          type: 'string',
          description:
            'Category name, e.g. "Groceries", "Salary", "Rent", "Transport". Matched ' +
            'case-insensitively against existing categories; a new one is created if none matches.',
          minLength: 1,
          maxLength: 64,
        },
        note: {
          type: 'string',
          description: 'Optional free-text detail about the transaction, e.g. "Lunch with the team".',
          maxLength: 500,
        },
        date: {
          type: 'string',
          description: `When the transaction happened. ${DATE_FORMAT_HINT} Defaults to now if omitted.`,
        },
      },
      required: ['type', 'amount', 'category'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Add transaction',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'search_transactions',
    description:
      'Search and filter transactions. Every filter is optional and they combine with AND, ' +
      'so you can ask for things like "all EXPENSE transactions in Groceries over $50 in ' +
      'March". Returns the matching page of transactions plus totals computed across the ' +
      'entire result set (not just the returned page). Use this to answer questions about ' +
      'specific spending, and to find a transaction id before calling delete_transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['INCOME', 'EXPENSE'],
          description: 'Restrict to one side of the ledger. Omit to include both.',
        },
        category: {
          type: 'string',
          description: 'Exact category name, matched case-insensitively.',
          minLength: 1,
          maxLength: 64,
        },
        startDate: {
          type: 'string',
          description: `Only transactions on or after this date. ${DATE_FORMAT_HINT}`,
        },
        endDate: {
          type: 'string',
          description: `Only transactions on or before this date. ${DATE_FORMAT_HINT}`,
        },
        minAmount: {
          type: 'number',
          description: 'Only transactions with amount >= this value.',
          minimum: 0,
        },
        maxAmount: {
          type: 'number',
          description: 'Only transactions with amount <= this value.',
          minimum: 0,
        },
        search: {
          type: 'string',
          description: 'Free-text substring matched case-insensitively against note and category.',
          minLength: 1,
          maxLength: 200,
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of transactions to return in this page.',
          minimum: 1,
          maximum: 200,
          default: 50,
        },
        offset: {
          type: 'integer',
          description: 'Number of matching transactions to skip, for paging through results.',
          minimum: 0,
          default: 0,
        },
        sortBy: {
          type: 'string',
          enum: ['date', 'amount', 'createdAt'],
          description: 'Field to sort by.',
          default: 'date',
        },
        sortOrder: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction.',
          default: 'desc',
        },
      },
      additionalProperties: false,
    },
    annotations: {
      title: 'Search transactions',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'delete_transaction',
    description:
      'Permanently delete a transaction by its id. This cannot be undone. If you do not ' +
      'already know the exact id, call search_transactions first and confirm the specific ' +
      'transaction with the user before deleting it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description:
            'The UUID of the transaction to delete, as returned by search_transactions, ' +
            'get_wallet_summary, or add_transaction.',
          minLength: 1,
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Delete transaction',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];
