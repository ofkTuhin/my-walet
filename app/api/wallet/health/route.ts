import { NextResponse } from 'next/server';
import { isAskEnabled } from '@/lib/server/ask-service';

export const dynamic = 'force-dynamic';

export const GET = () =>
  NextResponse.json({ status: 'ok', service: 'wallet-api', askEnabled: isAskEnabled() });
