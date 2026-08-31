import { NextResponse, type NextRequest } from 'next/server';

import { requireUserId } from '@/lib/server/current-user';
import { deleteDebt, getDebt } from '@/lib/server/debt-service';
import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

// Next 16 hands route params in as a promise.
type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: NextRequest, context: Context) => {
  const userId = await requireUserId();
  const { id } = await context.params;
  return NextResponse.json(await getDebt(userId, id));
});

export const DELETE = route(async (_request: NextRequest, context: Context) => {
  const userId = await requireUserId();
  const { id } = await context.params;
  if (typeof id !== 'string' || id.trim() === '') {
    return NextResponse.json({ error: 'A debt id is required.' }, { status: 400 });
  }
  const deleted = await deleteDebt(userId, id);
  return NextResponse.json({ deleted: true, debt: deleted });
});
