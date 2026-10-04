import { headers } from "next/headers";
import SettingsForm from "@/components/SettingsForm";
import SetupNeeded from "@/components/SetupNeeded";
import PageHeader from "@/components/PageHeader";
import { getSettings, toSpaConfig, getRecentReadings, getRecentDosing } from "@/lib/data";
import { deriveObservations, computeCalibration, type CalibrationSuggestion } from "@/lib/calibrate";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let settings;
  try {
    settings = await getSettings();
  } catch (err) {
    return <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />;
  }

  // Self-calibration: learn from the tub's own dose→reading history. Best-effort:
  // with nothing logged yet, Calibration just says to keep logging.
  let suggestions: CalibrationSuggestion[] = [];
  let observationCount = 0;
  try {
    const config = toSpaConfig(settings);
    const [readings, dosing] = await Promise.all([getRecentReadings(100), getRecentDosing(100)]);
    const calibrateConfig = { volumeLitres: config.volumeLitres, dosingConstants: config.dosingConstants };
    const observations = deriveObservations(readings, dosing, calibrateConfig);
    observationCount = observations.length;
    suggestions = computeCalibration(observations, calibrateConfig);
  } catch {
    // Leave suggestions empty.
  }

  // The calendar subscription URL, from the incoming request plus the token.
  const token = process.env.ICS_FEED_TOKEN;
  let icsUrl: string | null = null;
  if (token) {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) icsUrl = `${proto}://${host}/api/calendar.ics?token=${encodeURIComponent(token)}`;
  }

  return (
    <div className="grid gap-[18px]">
      <PageHeader title="Settings" back={{ href: "/dashboard", label: "Back to Today" }} />
      <SettingsForm
        settings={settings}
        icsUrl={icsUrl}
        suggestions={suggestions}
        observationCount={observationCount}
      />
    </div>
  );
}
