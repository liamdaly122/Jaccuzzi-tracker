import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { heatingScheduleSchema } from "@/lib/validation";

export const runtime = "nodejs";

// Save (or clear) the heating schedule. A dedicated route rather than going
// through PUT /api/settings, which replaces the whole settings object — a card
// shouldn't have to re-send every dosing constant to remember a time.
//
// Send `null` to clear it, which drops back to guessing from logged soaks.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  let schedule: unknown = null;
  if (body?.schedule !== null && body?.schedule !== undefined) {
    const parsed = heatingScheduleSchema.safeParse(body.schedule);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "That schedule doesn't look right", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    // An enabled schedule with no days would never fire — treat it as cleared
    // rather than storing something that silently does nothing.
    schedule =
      parsed.data.enabled && parsed.data.weekdays.length === 0 ? null : parsed.data;
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("spa_settings")
      .update({
        heating_schedule: schedule,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ settings: data, schedule });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save" },
      { status: 500 },
    );
  }
}
