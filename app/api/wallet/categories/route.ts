import { NextResponse, type NextRequest } from 'next/server';

import { route } from '@/lib/server/http';
import { createCategorySchema } from '@/lib/server/validation';
import { createCategory, listCategories } from '@/lib/server/wallet-service';

export const dynamic = 'force-dynamic';

export const GET = route(async () => NextResponse.json(await listCategories()));

export const POST = route(async (request: NextRequest) => {
  const created = await createCategory(createCategorySchema.parse(await request.json()));
  return NextResponse.json(created, { status: 201 });
});
