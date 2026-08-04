import Link from "next/link";
import Icon from "@/components/Icon";
import SetupNeeded from "@/components/SetupNeeded";
import TrendChart, { type TrendPoint } from "@/components/TrendChart";
import { Card } from "@/components/ui";
import {
  getRecentReadings,
  getSettings,
  toSpaConfig,
  getRecentProbeReadings,
  getTasks,
} from "@/lib/data";
import { downsampleDaily } from "@/lib/probe";
import { linearTrend } from "@/lib/predict";
import { lsiSeries } from "@/lib/balance";

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
  let readings, settings, tasks;
  try {
    [readings, settings, tasks] = await Promise.all([
      getRecentReadings(30),
      getSettings(),
      getTasks().catch(() => []),
    ]);
  } catch (err) {
    return (
      <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />
    );
  }

  // Probe history, thinned to one median point a day. Best-effort — the page
  // still works entirely on strip readings if the table isn't there yet.
  let probeDaily: ReturnType<typeof downsampleDaily> = [];
  try {
    probeDaily = downsampleDaily(await getRecentProbeReadings(1000));
  } catch {
    probeDaily = [];
  }
  const orpPoints: TrendPoint[] = probeDaily.map((d) => ({
    date: d.date,
    value: d.orpMv,
  }));
  const tempPoints: TrendPoint[] = probeDaily.map((d) => ({
    date: d.date,
    value: d.temperatureC,
  }));
  const hasProbeHistory = probeDaily.length >= 2;

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
  // Heater protection over time. Calcium is only carried forward within the
  // current fill, so points before the first calcium test of this fill are
  // honestly blank rather than back-filled.
  const fillStart =
    tasks.find((t) => t.task_key === "drain_refill")?.last_completed_at ?? null;
  const lsiPoints: TrendPoint[] = lsiSeries(
    ordered,
    probeDaily.map((d) => ({ measured_at: d.date, temperature_c: d.temperatureC })),
    fillStart,
  );
  const hasLsi = lsiPoints.filter((p) => p.value !== null).length >= 2;

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

      {readings.length < 2 && !hasProbeHistory ? (
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
          {hasLsi ? (
            <>
              <TrendChart
                title="Heater protection (saturation index)"
                points={lsiPoints}
                idealMin={-0.3}
                idealMax={0.3}
                decimals={2}
                note={trendNote(lsiPoints, 2, "")}
              />
              <p className="text-xs text-slate-400">
                Below the band the water is corrosive; above it, it deposits
                scale on the heater. A slow climb is the pattern to catch —
                it&apos;s invisible in any single number.
              </p>
            </>
          ) : null}
        </div>
      )}

      {/* Probe history — far denser than strip readings, so these are the
          charts that actually show a trend. */}
      {hasProbeHistory ? (
        <div className="space-y-3">
          <h2 className="pt-2 text-sm font-semibold text-slate-700">
            From your probe
          </h2>
          <TrendChart
            title="Sanitiser strength (ORP)"
            points={orpPoints}
            idealMin={config.targetRanges.orpMin ?? 650}
            idealMax={config.targetRanges.orpMax ?? 750}
            unit="mV"
            decimals={0}
            note={trendNote(orpPoints, 0, "mV")}
          />
          <TrendChart
            title="Water temperature"
            points={tempPoints}
            idealMin={36}
            idealMax={38}
            unit="°C"
            decimals={1}
            note={trendNote(tempPoints, 1, "°C")}
          />
          <p className="text-xs text-slate-400">
            One point per day, taken as the middle reading of that day so a
            single odd measurement can&apos;t skew it.
          </p>
        </div>
      ) : null}

      <Card>
        <Link
          href="/history"
          className="flex items-center justify-between font-medium text-slate-700"
        >
          <span className="flex items-center gap-2.5">
            <Icon name="scroll" size={20} className="text-brand-600" />
            See the full numbers (history)
          </span>
          <span className="text-brand-600">→</span>
        </Link>
      </Card>
    </div>
  );
}
