import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  getSettings,
  toSpaConfig,
  getRecentReadings,
  getRecentDosing,
} from "@/lib/data";
import {
  deriveObservations,
  computeCalibration,
  type CalibrateConfig,
  type CalibrationSuggestion,
} from "@/lib/calibrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Build the calibration suggestions from the recent reading + dosing history.
async function buildSuggestions(): Promise<{
  suggestions: CalibrationSuggestion[];
  observationCount: number;
}> {
  const settings = await getSettings();
  const config = toSpaConfig(settings);
  const [readings, dosing] = await Promise.all([
    getRecentReadings(100),
    getRecentDosing(100),
  ]);

  const calibrateConfig: CalibrateConfig = {
    volumeLitres: config.volumeLitres,
    dosingConstants: config.dosingConstants,
  };
  const observations = deriveObservations(readings, dosing, calibrateConfig);
  const suggestions = computeCalibration(observations, calibrateConfig);
  return { suggestions, observationCount: observations.length };
}

// GET — the current suggestions (empty when data is thin).
export async function GET() {
  try {
    const { suggestions, observationCount } = await buildSuggestions();
    return NextResponse.json({ suggestions, observationCount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to calibrate" },
      { status: 500 },
    );
  }
}

// POST — apply one suggestion by patching that single dosing constant.
// Body: { constantKey, suggestedValue }. We re-derive the suggestions server
// side and only accept a value that still matches, so a stale button can't
// write an arbitrary number.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const constantKey =
    body && typeof body.constantKey === "string" ? body.constantKey : null;
  const suggestedValue =
    body && typeof body.suggestedValue === "number" ? body.suggestedValue : null;
  if (!constantKey || suggestedValue === null) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const settings = await getSettings();
    const { suggestions } = await buildSuggestions();
    const match = suggestions.find(
      (s) => s.constantKey === constantKey && s.suggestedValue === suggestedValue,
    );
    if (!match) {
      return NextResponse.json(
        { error: "That suggestion is no longer current — please refresh." },
        { status: 409 },
      );
    }

    const nextConstants = {
      ...settings.dosing_constants,
      [match.constantKey]: match.suggestedValue,
    };

    const supabase = getSupabase();
    const { error } = await supabase
      .from("spa_settings")
      .update({
        dosing_constants: nextConstants,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, applied: match.constantKey });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to apply" },
      { status: 500 },
    );
  }
}
