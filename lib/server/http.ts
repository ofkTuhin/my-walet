import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AskNotUnderstoodError, AskUnavailableError } from './ask-service';
import { UnauthorizedError } from './current-user';
import { DebtNotFoundError, RepaymentExceedsDebtError } from './debt-service';
import { log } from './logger';
import { formatZodError } from './validation';
import { TransactionNotFoundError } from './wallet-service';

/**
 * One error mapping for every route, replacing the Express error middleware.
 * The status codes are unchanged, so the dashboard's client needs no edits.
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: 'Validation failed', details: formatZodError(error) },
      { status: 400 },
    );
  }
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof TransactionNotFoundError || error instanceof DebtNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  // Well-formed but not applicable to the debt's current state — 422, not 400.
  if (error instanceof RepaymentExceedsDebtError) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof AskUnavailableError) {
    return NextResponse.json({ error: error.message }, { status: 501 });
  }
  if (error instanceof AskNotUnderstoodError) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  const message = error instanceof Error ? error.message : String(error);
  log.error('API error:', message);
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Wraps a handler so any throw becomes the right JSON error response. */
export function route<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/**
 * Query strings are all strings; coerce the numeric and paging params before
 * they reach the shared Zod schema.
 */
export function searchParamsToFilters(params: URLSearchParams): Record<string, unknown> {
  const str = (key: string) => params.get(key) || undefined;
  const num = (key: string) => {
    const value = params.get(key);
    return value === null || value === '' ? undefined : Number(value);
  };

  return {
    type: str('type'),
    category: str('category'),
    startDate: str('startDate'),
    endDate: str('endDate'),
    minAmount: num('minAmount'),
    maxAmount: num('maxAmount'),
    search: str('search'),
    ...(num('limit') !== undefined && { limit: num('limit') }),
    ...(num('offset') !== undefined && { offset: num('offset') }),
    ...(str('sortBy') && { sortBy: str('sortBy') }),
    ...(str('sortOrder') && { sortOrder: str('sortOrder') }),
  };
}
