import { NextResponse, type NextRequest } from 'next/server';

import { requireUserId } from '@/lib/server/current-user';
import { createDebt, listDebts } from '@/lib/server/debt-service';
import { route } from '@/lib/server/http';
import { addDebtSchema, listDebtsSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const GET = route(async (request: NextRequest) => {
  const userId = await requireUserId();
  const params = request.nextUrl.searchParams;
  const options = listDebtsSchema.parse({
    direction: params.get('direction') || undefined,
    // Query strings carry no booleans; only the literal "true" opts in.
    includeSettled: params.get('includeSettled') === 'true',
  });
  return NextResponse.json(await listDebts(userId, options));
});

export const POST = route(async (request: NextRequest) => {
  const userId = await requireUserId();
  const created = await createDebt(userId, addDebtSchema.parse(await request.json()));
  return NextResponse.json(created, { status: 201 });
});
