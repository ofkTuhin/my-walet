import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';

import { env } from './env';
import { log } from './logger';
import { prisma } from './prisma';
import { formatMoney } from './serialize';
import { z } from 'zod';

import { searchTransactionsSchema, type SearchTransactionsInput } from './validation';
import {
  aggregateForChart,
  searchTransactions,
  type ChartData,
  type ChartGroupBy,
  type SearchResult,
} from './wallet-service';
import { TOOLS } from './tool-schemas';

/**
 * Natural-language search.
 *
 * Two providers are supported — Anthropic and Groq — behind one interface. Both
 * are driven by the *same* JSON Schema exported by the MCP server, so adding a
 * provider never means maintaining a second definition of what a search is.
 *
 * The model translates a plain-English question into the same filter object the
 * `search_transactions` MCP tool accepts, and the result is run back through
 * `searchTransactionsSchema` before it reaches Prisma. The model therefore can
 * never produce a query the REST API would not already have accepted — it
 * chooses filter *values*, it does not get to shape the query.
 */

export class AskUnavailableError extends Error {
  constructor() {
    super(
      'Natural-language search is not configured. Set GROQ_API_KEY or ANTHROPIC_API_KEY in backend/.env.',
    );
    this.name = 'AskUnavailableError';
  }
}

/** Claude answered in prose instead of filters — usually a question we cannot turn into a search. */
export class AskNotUnderstoodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AskNotUnderstoodError';
  }
}

export interface AskResult {
  question: string;
  filters: SearchTransactionsInput;
  result: SearchResult;
  chart: { type: ChartType; data: ChartData };
  headline: string;
  model: string;
}

export type AskProvider = 'anthropic' | 'groq';

const DEFAULT_MODELS: Record<AskProvider, string> = {
  anthropic: 'claude-opus-5',
  // Verified available on Groq and reliable at tool calling. Note that Groq's
  // catalogue changes; `GET /openai/v1/models` lists what a key can reach.
  groq: 'openai/gpt-oss-120b',
};

/** Whichever provider is configured. ASK_PROVIDER forces one; otherwise Groq wins if both keys exist. */
export function resolveProvider(): AskProvider | null {
  const forced = env.askProvider;
  if (forced === 'anthropic') return env.anthropicApiKey ? 'anthropic' : null;
  if (forced === 'groq') return env.groqApiKey ? 'groq' : null;
  if (env.groqApiKey) return 'groq';
  if (env.anthropicApiKey) return 'anthropic';
  return null;
}

export function isAskEnabled(): boolean {
  return resolveProvider() !== null;
}

function modelFor(provider: AskProvider): string {
  return env.askModel ?? DEFAULT_MODELS[provider];
}

/** The one search definition, reused verbatim from the MCP server. */
function searchTool() {
  const tool = TOOLS.find((candidate) => candidate.name === 'search_transactions');
  if (!tool) {
    throw new Error(
      'search_transactions is missing from TOOLS — tool-schemas.ts and ask-service.ts are out of sync.',
    );
  }
  return tool;
}

export const CHART_TYPES = ['bar', 'line', 'area', 'pie', 'donut', 'table'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

/**
 * How the answer should be drawn. These are *presentation* fields — they exist
 * only on the ask path and are deliberately not added to the MCP tool, whose
 * job is data access, not rendering.
 */
const presentationSchema = z.object({
  chartType: z.enum(CHART_TYPES).default('bar'),
  groupBy: z.enum(['month', 'category', 'type', 'day']).default('category'),
});

const PRESENTATION_PROPERTIES = {
  chartType: {
    type: 'string',
    enum: [...CHART_TYPES],
    description:
      "Which chart the user asked for. Honour an explicit request exactly — 'pie chart' means pie, 'line graph' means line. When they did not name one, pick the clearest fit: bar for comparing categories, line or area for change over time, pie or donut for share of a whole, table when they asked to list or see the transactions themselves.",
  },
  groupBy: {
    type: 'string',
    enum: ['month', 'category', 'type', 'day'],
    description:
      "How to bucket the data. 'month' for monthly trends, 'day' for a short date range, 'category' to compare spending areas, 'type' to compare income against expense.",
  },
} as const;

/**
 * The search schema plus the two presentation fields. Built by extension rather
 * than by copying, so the search half stays in lockstep with the MCP tool.
 */
function askToolSchema(): Record<string, unknown> {
  const base = searchTool().inputSchema as {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  return {
    ...base,
    properties: { ...base.properties, ...PRESENTATION_PROPERTIES },
  };
}

/**
 * What a provider returns: either the raw filter object the model proposed, or
 * the prose it replied with when the question was not a search at all.
 */
type Translation = { kind: 'filters'; input: unknown } | { kind: 'prose'; text: string };

async function translateWithAnthropic(question: string, system: string): Promise<Translation> {
  const tool = searchTool();
  const client = new Anthropic({ apiKey: env.anthropicApiKey! });

  const response = await client.messages.create({
    model: modelFor('anthropic'),
    max_tokens: 2048,
    system,
    tools: [
      {
        name: tool.name,
        description: tool.description ?? 'Search and filter transactions.',
        input_schema: askToolSchema() as Anthropic.Tool['input_schema'],
      },
    ],
    messages: [{ role: 'user', content: question }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );
  if (toolUse) return { kind: 'filters', input: toolUse.input };

  return {
    kind: 'prose',
    text: response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join(' ')
      .trim(),
  };
}

async function translateWithGroq(question: string, system: string): Promise<Translation> {
  const tool = searchTool();
  const client = new Groq({ apiKey: env.groqApiKey! });

  const response = await client.chat.completions.create({
    model: modelFor('groq'),
    max_tokens: 2048,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: question },
    ],
    // OpenAI-compatible tool format; the schema object is identical to the MCP one.
    tools: [
      {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description ?? 'Search and filter transactions.',
          parameters: askToolSchema(),
        },
      },
    ],
    tool_choice: 'auto',
  });

  const message = response.choices[0]?.message;
  const call = message?.tool_calls?.[0];

  if (call && 'function' in call) {
    // Arguments arrive as a JSON string, not an object.
    let parsed: unknown;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch {
      throw new AskNotUnderstoodError('The model returned filters that could not be parsed. Try rephrasing.');
    }
    return { kind: 'filters', input: parsed };
  }

  return { kind: 'prose', text: (message?.content ?? '').trim() };
}

/**
 * Grounding facts. Without these the model guesses at "last month" and at
 * category names, which is the single biggest source of empty result sets.
 */
async function buildContext(userId: string): Promise<string> {
  // Scoped: without this the prompt would name another account's categories.
  const [categories, range] = await Promise.all([
    prisma.category.findMany({
      where: { userId },
      select: { name: true, type: true },
      orderBy: { name: 'asc' },
    }),
    prisma.transaction.aggregate({ where: { userId }, _min: { date: true }, _max: { date: true } }),
  ]);

  const categoryList = categories
    .map((c) => `${c.name}${c.type ? ` (${c.type})` : ''}`)
    .join(', ');

  const earliest = range._min.date?.toISOString().slice(0, 10) ?? 'n/a';
  const latest = range._max.date?.toISOString().slice(0, 10) ?? 'n/a';

  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)} (UTC).`,
    `Recorded transactions run from ${earliest} to ${latest}.`,
    `Existing categories: ${categoryList || '(none yet)'}.`,
  ].join('\n');
}

const SYSTEM_PROMPT = `You turn a person's question about their own wallet into a structured transaction search.

Call the search_transactions tool exactly once with the filters that best answer the question. Guidelines:

- Resolve relative dates ("last month", "this week", "past 30 days") against today's date, given below, and emit concrete YYYY-MM-DD values.
- Map everyday words onto the categories that actually exist. "Food" or "eating out" usually means Dining and/or Groceries; if the question spans several categories, omit the category filter rather than guessing one, and narrow with type instead.
- "Spending", "spent", "cost" and "bought" mean type EXPENSE. "Earned", "made" and "paid me" mean type INCOME.
- Use sortBy/sortOrder to match the question — "biggest" or "most expensive" means sortBy amount, sortOrder desc; "recent" means sortBy date, sortOrder desc.
- Leave a filter out entirely when the question does not constrain it. Fewer filters returning too much beats over-filtering and returning nothing.

Also choose how to draw the answer:

- If the person names a chart ("as a pie chart", "on a line graph", "show me a table"), use exactly that. Their explicit choice always wins, even if another form would fit the data better.
- If they name none, pick the clearest fit for the question.
- Set groupBy to whatever the comparison is actually over — months for a trend, categories for "where does it go", type for income vs expense.

If the question is not a transaction search at all (for example "add a $20 coffee" or "hello"), do not call the tool. Reply with one short sentence explaining what you can search for instead.`;

/** A one-line, human-readable summary of what was searched and found. */
function buildHeadline(filters: SearchTransactionsInput, result: SearchResult): string {
  const bits: string[] = [];
  if (filters.type) bits.push(filters.type === 'INCOME' ? 'income' : 'expenses');
  else bits.push('transactions');
  if (filters.category) bits.push(`in ${filters.category}`);
  if (filters.search) bits.push(`matching "${filters.search}"`);
  if (filters.startDate && filters.endDate) {
    bits.push(`between ${filters.startDate.toISOString().slice(0, 10)} and ${filters.endDate.toISOString().slice(0, 10)}`);
  } else if (filters.startDate) {
    bits.push(`since ${filters.startDate.toISOString().slice(0, 10)}`);
  } else if (filters.endDate) {
    bits.push(`up to ${filters.endDate.toISOString().slice(0, 10)}`);
  }
  if (filters.minAmount !== undefined) bits.push(`over ${formatMoney(filters.minAmount)}`);
  if (filters.maxAmount !== undefined) bits.push(`under ${formatMoney(filters.maxAmount)}`);

  const scope = bits.join(' ');
  if (result.totalCount === 0) {
    return `No ${scope} found.`;
  }
  const net = filters.type === 'INCOME' ? result.totals.income : result.totals.expense;
  return `${result.totalCount} ${scope} — ${formatMoney(net)} total.`;
}

export async function askWallet(userId: string, question: string): Promise<AskResult> {
  const provider = resolveProvider();
  if (!provider) throw new AskUnavailableError();

  const system = `${SYSTEM_PROMPT}\n\n${await buildContext(userId)}`;

  const translation =
    provider === 'groq'
      ? await translateWithGroq(question, system)
      : await translateWithAnthropic(question, system);

  if (translation.kind === 'prose') {
    throw new AskNotUnderstoodError(
      translation.text ||
        'That did not look like a transaction search. Try asking about spending over a date range.',
    );
  }

  // The model proposes; the existing validator disposes. Anything it invents
  // that the REST API would reject is rejected here too. The two schemas read
  // the same object and each ignores the other's keys.
  const filters = searchTransactionsSchema.parse(translation.input);
  const presentation = presentationSchema.parse(translation.input);

  const [result, chartData] = await Promise.all([
    searchTransactions(userId, filters),
    aggregateForChart(userId, filters, presentation.groupBy as ChartGroupBy),
  ]);

  log.info(
    `ask [${provider}/${modelFor(provider)}]: "${question}" -> ` +
      `${JSON.stringify(translation.input)} (${result.totalCount} hits)`,
  );

  return {
    question,
    filters,
    result,
    chart: { type: presentation.chartType, data: chartData },
    headline: buildHeadline(filters, result),
    model: `${provider}/${modelFor(provider)}`,
  };
}
