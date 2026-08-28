import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { askWallet } from '@/lib/server/ask-service';
import { requireUserId } from '@/lib/server/current-user';
import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
// Model calls take longer than the default function budget on Vercel.
export const maxDuration = 60;

const askSchema = z.object({
  question: z.string().trim().min(1, 'Ask a question.').max(500),
});

export const POST = route(async (request: NextRequest) => {
  const userId = await requireUserId();
  const { question } = askSchema.parse(await request.json());
  return NextResponse.json(await askWallet(userId, question));
});
