import { headers } from "next/headers";
import SettingsForm from "@/components/SettingsForm";
import CalibrationCard from "@/components/CalibrationCard";
import SetupNeeded from "@/components/SetupNeeded";
import {
  getSettings,
  toSpaConfig,
  getRecentReadings,
  getRecentDosing,
} from "@/lib/data";
import {
  deriveObservations,
  computeCalibration,
  type CalibrationSuggestion,
} from "@/lib/calibrate";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let settings;
  try {
    settings = await getSettings();
  } catch (err) {
    return (
      <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />
    );
  }

  // Self-calibration: learn from the tub's own dose→reading history. Best-effort
  // — if the dosing/readings tables aren't populated yet, just show the card's
  // "keep logging" state rather than breaking Settings.
  let suggestions: CalibrationSuggestion[] = [];
  let observationCount = 0;
  try {
    const config = toSpaConfig(settings);
    const [readings, dosing] = await Promise.all([
      getRecentReadings(100),
      getRecentDosing(100),
    ]);
    const calibrateConfig = {
      volumeLitres: config.volumeLitres,
      dosingConstants: config.dosingConstants,
    };
    const observations = deriveObservations(readings, dosing, calibrateConfig);
    observationCount = observations.length;
    suggestions = computeCalibration(observations, calibrateConfig);
  } catch {
    // Leave suggestions empty; the card falls back to its "keep logging" copy.
  }

  // Build the calendar subscription URL from the incoming request + the token.
  const token = process.env.ICS_FEED_TOKEN;
  let icsUrl: string | null = null;
  if (token) {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) {
      icsUrl = `${proto}://${host}/api/calendar.ics?token=${encodeURIComponent(token)}`;
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500">
          Tune your tub, targets, and reminders.
        </p>
      </div>
      <CalibrationCard
        suggestions={suggestions}
        observationCount={observationCount}
      />
      <SettingsForm settings={settings} icsUrl={icsUrl} />
    </div>
  );
}
