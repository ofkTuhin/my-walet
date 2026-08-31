import { NextResponse, type NextRequest } from 'next/server';

import { requireUserId } from '@/lib/server/current-user';
import { addRepayment } from '@/lib/server/debt-service';
import { route } from '@/lib/server/http';
import { addRepaymentSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: NextRequest, context: Context) => {
  const userId = await requireUserId();
  const { id } = await context.params;
  const input = addRepaymentSchema.parse(await request.json());
  // Returns the whole debt, so the caller sees the new outstanding amount and
  // whether that instalment settled it.
  return NextResponse.json(await addRepayment(userId, id, input), { status: 201 });
});
