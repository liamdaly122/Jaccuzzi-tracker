import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  getSettings,
  toSpaConfig,
  getRecentReadings,
  getRecentProbeReadings,
  getTasks,
  completeTaskByKey,
} from "@/lib/data";
import { readingSchema } from "@/lib/validation";
import { calculateRecommendations } from "@/lib/chemistry";
import { lsiSnapshot } from "@/lib/balance";

export const runtime = "nodejs";

export async function GET() {
  try {
    const readings = await getRecentReadings(50);
    return NextResponse.json({ readings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load readings" },
      { status: 500 },
    );
  }
}

// Save a reading AND return the calculator's recommendations in one response,
// so the "new reading" form needs no second round-trip.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = readingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid reading", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const settings = await getSettings();
    const config = toSpaConfig(settings);
    const r = parsed.data;

    const calculation = calculateRecommendations(
      {
        ph: r.ph,
        freeChlorinePpm: r.freeChlorinePpm,
        brominePpm: r.brominePpm,
        totalAlkalinityPpm: r.totalAlkalinityPpm,
        calciumHardnessPpm: r.calciumHardnessPpm,
        cyanuricAcidPpm: r.cyanuricAcidPpm,
        orpMv: r.orpMv,
        isFreshFill: r.isFreshFill,
      },
      config,
    );

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("test_readings")
      .insert({
        recorded_at: r.recordedAt ?? new Date().toISOString(),
        ph: r.ph,
        free_chlorine_ppm: r.freeChlorinePpm,
        bromine_ppm: r.brominePpm,
        total_alkalinity_ppm: r.totalAlkalinityPpm,
        calcium_hardness_ppm: r.calciumHardnessPpm,
        cyanuric_acid_ppm: r.cyanuricAcidPpm,
        orp_mv: r.orpMv,
        is_fresh_fill: r.isFreshFill,
        notes: r.notes ?? null,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // A saved test IS the "Test the water" job, so tick it off.
    await completeTaskByKey("test_water");

    // Heater protection: pH, alkalinity, calcium and temperature judged
    // together. Best-effort — the reading is already saved, so nothing here may
    // turn a successful save into an error.
    let balance = null;
    try {
      const [history, probeRows, tasks] = await Promise.all([
        getRecentReadings(30),
        getRecentProbeReadings(1).catch(() => []),
        getTasks().catch(() => []),
      ]);
      const drainTask = tasks.find((t) => t.task_key === "drain_refill");
      // Same assumed temperature as the Water tab: their soak target.
      balance = lsiSnapshot(
        history,
        probeRows,
        drainTask?.last_completed_at ?? null,
        new Date(),
        config.targetRanges.tempTarget,
      );
    } catch {
      balance = null;
    }

    return NextResponse.json({ reading: data, calculation, balance });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save reading" },
      { status: 500 },
    );
  }
}
