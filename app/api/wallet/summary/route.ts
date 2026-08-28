import { NextResponse, type NextRequest } from 'next/server';

import { requireUserId } from '@/lib/server/current-user';
import { route } from '@/lib/server/http';
import { walletSummarySchema } from '@/lib/server/validation';
import { getWalletSummary } from '@/lib/server/wallet-service';

export const dynamic = 'force-dynamic';

export const GET = route(async (request: NextRequest) => {
  const userId = await requireUserId();
  const params = request.nextUrl.searchParams;
  const recentLimit = params.get('recentLimit');

  const input = walletSummarySchema.parse({
    ...(recentLimit ? { recentLimit: Number(recentLimit) } : {}),
    startDate: params.get('startDate') || undefined,
    endDate: params.get('endDate') || undefined,
  });

  return NextResponse.json(await getWalletSummary(userId, input));
});
