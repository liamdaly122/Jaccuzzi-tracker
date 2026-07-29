import Link from "next/link";
import SetupNeeded from "@/components/SetupNeeded";
import TrendChart, { type TrendPoint } from "@/components/TrendChart";
import { Card } from "@/components/ui";
import { getRecentReadings, getSettings, toSpaConfig } from "@/lib/data";
import { linearTrend } from "@/lib/predict";

export const dynamic = "force-dynamic";

// A short human caption for a metric's recent direction.
function trendNote(points: TrendPoint[], decimals: number, unit: string): string {
  const trend = linearTrend(points);
  if (!trend) return "Not enough data for a trend yet.";
  const rate = Math.abs(trend.slopePerDay);
  const u = unit ? ` ${unit}` : "";
  if (rate < (unit === "ppm" ? 0.05 : 0.02)) return "→ Holding steady.";
  const arrow = trend.slopePerDay < 0 ? "↓ Falling" : "↑ Rising";
  return `${arrow} ~${rate.toFixed(decimals === 0 ? 1 : decimals)}${u}/day.`;
}

export default async function TrendsPage() {
  let readings, settings;
  try {
    [readings, settings] = await Promise.all([
      getRecentReadings(30),
      getSettings(),
    ]);
  } catch (err) {
    return (
      <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />
    );
  }

  const config = toSpaConfig(settings);
  // getRecentReadings is newest-first; charts want oldest -> newest.
  const ordered = [...readings].reverse();

  const phPoints: TrendPoint[] = ordered.map((r) => ({
    date: r.recorded_at,
    value: r.ph === null ? null : Number(r.ph),
  }));
  const taPoints: TrendPoint[] = ordered.map((r) => ({
    date: r.recorded_at,
    value:
      r.total_alkalinity_ppm === null ? null : Number(r.total_alkalinity_ppm),
  }));
  const isChlorine = config.sanitizerType === "chlorine";
  const sanitizerPoints: TrendPoint[] = ordered.map((r) => ({
    date: r.recorded_at,
    value: isChlorine
      ? r.free_chlorine_ppm === null
        ? null
        : Number(r.free_chlorine_ppm)
      : r.bromine_ppm === null
        ? null
        : Number(r.bromine_ppm),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Trends</h1>
        <p className="text-sm text-slate-500">
          How your water has changed over time. Points outside the green band are
          out of range.
        </p>
      </div>

      {readings.length < 2 ? (
        <Card>
          <p className="text-sm text-slate-500">
            Once you&apos;ve logged a couple of water tests, your trends will show
            up here so you can spot problems before they happen.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          <TrendChart
            title="pH"
            points={phPoints}
            idealMin={config.targetRanges.phIdealMin}
            idealMax={config.targetRanges.phIdealMax}
            decimals={1}
            note={trendNote(phPoints, 1, "")}
          />
          <TrendChart
            title="Total alkalinity"
            points={taPoints}
            idealMin={config.targetRanges.taMin}
            idealMax={config.targetRanges.taMax}
            unit="ppm"
            decimals={0}
            note={trendNote(taPoints, 0, "ppm")}
          />
          <TrendChart
            title={isChlorine ? "Free chlorine" : "Bromine"}
            points={sanitizerPoints}
            idealMin={isChlorine ? config.targetRanges.fcMin : config.targetRanges.brMin}
            idealMax={isChlorine ? config.targetRanges.fcMax : config.targetRanges.brMax}
            unit="ppm"
            decimals={1}
            note={trendNote(sanitizerPoints, 1, "ppm")}
          />
        </div>
      )}

      <Card>
        <Link
          href="/history"
          className="flex items-center justify-between font-medium text-slate-700"
        >
          <span>📜 See the full numbers (history)</span>
          <span className="text-brand-600">→</span>
        </Link>
      </Card>
    </div>
  );
}
