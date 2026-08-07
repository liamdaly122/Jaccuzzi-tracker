import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { heatLossSchema } from "@/lib/validation";

export const runtime = "nodejs";

// Save (or clear) the measured insulation figure, in watts per kelvin. Its own
// route rather than PUT /api/settings, which replaces the whole settings object.
//
// Send null to clear it and fall back to whatever the probe has measured, or to
// the generic uninsulated estimate.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = heatLossSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That doesn't look like a heat-loss figure" },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("spa_settings")
      .update({
        heat_loss_w_per_k: parsed.data.heatLossWPerK,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ settings: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save" },
      { status: 500 },
    );
  }
}
