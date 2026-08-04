import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSettings } from "@/lib/data";
import { settingsSchema } from "@/lib/validation";
import { geocode } from "@/lib/weather";

export const runtime = "nodejs";

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load settings" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid settings", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {
    sanitizer_type: parsed.data.sanitizerType,
    ...(parsed.data.sanitizerUnit
      ? { sanitizer_unit: parsed.data.sanitizerUnit }
      : {}),
    volume_litres: parsed.data.volumeLitres,
    avg_daily_bathers: parsed.data.avgDailyBathers,
    target_ranges: parsed.data.targetRanges,
    dosing_constants: parsed.data.dosingConstants,
    updated_at: new Date().toISOString(),
  };

  // Resolve the location for the weather feature (only when it was provided).
  let geocodeFailed = false;
  if (parsed.data.locationQuery !== undefined) {
    const q = parsed.data.locationQuery.trim();
    if (q === "") {
      update.latitude = null;
      update.longitude = null;
      update.location_name = null;
    } else {
      const hit = await geocode(q);
      if (hit) {
        update.latitude = hit.lat;
        update.longitude = hit.lon;
        update.location_name = hit.name;
      } else {
        // Couldn't find it — save everything else but report it.
        geocodeFailed = true;
      }
    }
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("spa_settings").update(update).eq("id", 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, geocodeFailed });
}
