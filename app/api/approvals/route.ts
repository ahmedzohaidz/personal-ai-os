import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { decideApprovalAndResume } from '@/src/core/goldenWorkflow';
import { getRuntime } from '@/src/application/runtime';
import { getAuthenticatedOwnerId } from '@/src/infrastructure/supabase/server';

export const runtime = 'nodejs';

const ApprovalSchema = z.object({
  idempotencyKey: z.string().min(8).max(160),
  approvalId: z.string().min(3).max(160),
  decision: z.enum(['approved', 'rejected'])
});

export async function POST(request: NextRequest) {
  try {
    const parsed = ApprovalSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'قرار الموافقة غير صالح.' }, { status: 400 });
    }

    const ownerId = process.env.PERSISTENCE_DRIVER === 'supabase'
      ? await getAuthenticatedOwnerId()
      : 'demo_user';
    if (!ownerId) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولًا.' }, { status: 401 });
    }

    const result = await decideApprovalAndResume({
      ownerId,
      ...parsed.data
    }, getRuntime());

    return NextResponse.json(result, {
      headers: { 'cache-control': 'no-store' }
    });
  } catch (error) {
    console.error('approval decision failed', error);
    return NextResponse.json({ error: 'تعذر تطبيق قرار الموافقة.' }, { status: 500 });
  }
}
