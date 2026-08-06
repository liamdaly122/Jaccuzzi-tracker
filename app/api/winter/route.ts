import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { winterSchema } from "@/lib/validation";

export const runtime = "nodejs";

// Start or end hibernation. Shutting down sets winterised_at, which quietens the
// routine task nagging and the daily push for the whole winter; waking up clears
// it and hands over to the existing fresh-fill wizard at /setup.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = winterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabase();
    const { action, strategy } = parsed.data;

    const patch =
      action === "hibernate"
        ? {
            winterised_at: new Date().toISOString(),
            winter_strategy: strategy ?? "pack_down",
          }
        : { winterised_at: null, winter_strategy: null };

    const { data, error } = await supabase
      .from("spa_settings")
      .update(patch)
      .eq("id", 1)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ settings: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update" },
      { status: 500 },
    );
  }
}
