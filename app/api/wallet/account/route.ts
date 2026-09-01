import { NextResponse, type NextRequest } from 'next/server';

import { getAccountSettings, updateAccountSettings } from '@/lib/server/account-service';
import { requireUserId } from '@/lib/server/current-user';
import { route } from '@/lib/server/http';
import { updateAccountSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const userId = await requireUserId();
  return NextResponse.json(await getAccountSettings(userId));
});

export const PATCH = route(async (request: NextRequest) => {
  const userId = await requireUserId();
  const input = updateAccountSchema.parse(await request.json());
  return NextResponse.json(await updateAccountSettings(userId, input));
});
