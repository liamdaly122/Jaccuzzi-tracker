import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { completeTaskSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Mark a task complete. Uses the complete_task() DB function so recording the
// completion and bumping last_completed_at happen atomically.
export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = completeTaskSchema.safeParse(body ?? {});
  const note = parsed.success ? parsed.data.note ?? null : null;

  const supabase = getSupabase();
  const { error } = await supabase.rpc("complete_task", {
    p_task_id: taskId,
    p_note: note,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
