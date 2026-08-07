import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSettings } from "@/lib/data";
import { soakTargetSchema } from "@/lib/validation";
import { DEFAULT_TARGET_RANGES, TEMP_MAX_C, TEMP_MIN_C } from "@/lib/chemistry";

export const runtime = "nodejs";

// Just the soak temperature, saved straight from the heating card. A dedicated
// route because PUT /api/settings replaces the whole settings object, and a
// card shouldn't have to re-send every dosing constant to change one number.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = soakTargetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Temperature must be between ${TEMP_MIN_C} and ${TEMP_MAX_C} °C` },
      { status: 400 },
    );
  }

  // Belt and braces: the schema already bounds this, but the tub's own ceiling
  // is a safety limit and shouldn't depend on one layer getting it right.
  const tempTarget = Math.min(
    TEMP_MAX_C,
    Math.max(TEMP_MIN_C, parsed.data.tempTarget),
  );

  try {
    const settings = await getSettings();
    const supabase = getSupabase();

    // Merge rather than replace, so nothing else in target_ranges is lost.
    const ranges = {
      ...DEFAULT_TARGET_RANGES,
      ...(settings.target_ranges ?? {}),
      tempTarget,
    };

    const { data, error } = await supabase
      .from("spa_settings")
      .update({ target_ranges: ranges, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ settings: data, tempTarget });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save" },
      { status: 500 },
    );
  }
}
