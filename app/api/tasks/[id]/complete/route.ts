import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { completeTaskSchema } from "@/lib/validation";
import { planUndo } from "@/lib/tasks";

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

// Undo the newest completion, if it's recent enough (see planUndo). Restores
// "last done" to the completion before it, so the schedule goes back exactly
// to where it was.
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: rows, error } = await supabase
    .from("task_completions")
    .select("id, completed_at")
    .eq("task_id", taskId)
    .order("completed_at", { ascending: false })
    .limit(2);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const plan = planUndo(rows ?? []);
  if (!plan) {
    return NextResponse.json(
      { error: "Nothing recent enough to undo" },
      { status: 409 },
    );
  }

  const del = await supabase.from("task_completions").delete().eq("id", plan.deleteId);
  if (del.error) {
    return NextResponse.json({ error: del.error.message }, { status: 500 });
  }
  const upd = await supabase
    .from("maintenance_tasks")
    .update({ last_completed_at: plan.restoreTo })
    .eq("id", taskId);
  if (upd.error) {
    return NextResponse.json({ error: upd.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
