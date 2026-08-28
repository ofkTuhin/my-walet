import { NextResponse, type NextRequest } from 'next/server';

import { route, searchParamsToFilters } from '@/lib/server/http';
import { addTransactionSchema, searchTransactionsSchema } from '@/lib/server/validation';
import { addTransaction, searchTransactions } from '@/lib/server/wallet-service';

export const dynamic = 'force-dynamic';

export const GET = route(async (request: NextRequest) => {
  const filters = searchTransactionsSchema.parse(
    searchParamsToFilters(request.nextUrl.searchParams),
  );
  return NextResponse.json(await searchTransactions(filters));
});

export const POST = route(async (request: NextRequest) => {
  const created = await addTransaction(addTransactionSchema.parse(await request.json()));
  return NextResponse.json(created, { status: 201 });
});
