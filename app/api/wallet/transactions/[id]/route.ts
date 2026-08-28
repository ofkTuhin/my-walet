import { NextResponse, type NextRequest } from 'next/server';

import { route } from '@/lib/server/http';
import { deleteTransaction } from '@/lib/server/wallet-service';

export const dynamic = 'force-dynamic';

// Next 16 hands route params in as a promise.
type Context = { params: Promise<{ id: string }> };

export const DELETE = route(async (_request: NextRequest, context: Context) => {
  const { id } = await context.params;
  if (typeof id !== 'string' || id.trim() === '') {
    return NextResponse.json({ error: 'A transaction id is required.' }, { status: 400 });
  }
  const deleted = await deleteTransaction(id);
  return NextResponse.json({ deleted: true, transaction: deleted });
});
