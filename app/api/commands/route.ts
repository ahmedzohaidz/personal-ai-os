import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { executeGoldenWorkflow } from '@/src/core/goldenWorkflow';
import { getRuntime } from '@/src/application/runtime';
import { getAuthenticatedOwnerId } from '@/src/infrastructure/supabase/server';

export const runtime = 'nodejs';

const CommandSchema = z.object({
  command: z.string().trim().min(3).max(4000),
  idempotencyKey: z.string().min(8).max(160)
});

export async function POST(request: NextRequest) {
  try {
    const parsed = CommandSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({
        error: 'الطلب غير صالح.',
        details: parsed.error.flatten()
      }, { status: 400 });
    }

    const ownerId = process.env.PERSISTENCE_DRIVER === 'supabase'
      ? await getAuthenticatedOwnerId()
      : 'demo_user';
    if (!ownerId) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولًا.' }, { status: 401 });
    }

    const result = await executeGoldenWorkflow({
      ownerId,
      command: parsed.data.command,
      idempotencyKey: parsed.data.idempotencyKey
    }, getRuntime());

    return NextResponse.json(result, {
      headers: { 'cache-control': 'no-store' }
    });
  } catch (error) {
    console.error('command execution failed', error);
    return NextResponse.json({ error: 'تعذر تنفيذ المهمة. راجع حالة النظام.' }, { status: 500 });
  }
}
