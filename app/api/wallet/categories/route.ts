import { NextResponse, type NextRequest } from 'next/server';

import { requireUserId } from '@/lib/server/current-user';
import { route } from '@/lib/server/http';
import { createCategorySchema } from '@/lib/server/validation';
import { createCategory, listCategories } from '@/lib/server/wallet-service';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const userId = await requireUserId();
  return NextResponse.json(await listCategories(userId));
});

export const POST = route(async (request: NextRequest) => {
  const userId = await requireUserId();
  const created = await createCategory(userId, createCategorySchema.parse(await request.json()));
  return NextResponse.json(created, { status: 201 });
});
