import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { hibernationState, winterWindow } from "@/lib/winter";
import {
  getSettings,
  toSpaConfig,
  getTasks,
  getLatestReading,
  getRecentReadings,
  getBathersSince,
  getRecentDosing,
  toTaskLike,
} from "@/lib/data";
import { computeNextDue } from "@/lib/tasks";
import { calculateRecommendations } from "@/lib/chemistry";
import { buildForecasts } from "@/lib/predict";
import { usageWaterStatus, sanitiserDemandTrend } from "@/lib/water";
import { getForecast, weatherAdvice } from "@/lib/weather";
import { getIopoolReading, isIopoolConfigured } from "@/lib/iopool";
import { captureProbeReading, pruneProbeReadings } from "@/lib/data";
import { sendNtfy } from "@/lib/ntfy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The daily scheduler. Vercel Cron calls this once a day and automatically
// attaches "Authorization: Bearer <CRON_SECRET>". We reject anything else.
//
// It ALWAYS writes one notification_log row per day (even a no-op), which both
// dedupes same-day runs AND keeps Supabase's free tier from pausing the project
// after 7 idle days.
async function handle(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const now = new Date();

  let dueTasks: string[] = [];
  let chemAlerts: string[] = [];
  let forecastAlerts: string[] = [];
  let usageAlert: string | null = null;
  let weatherAlerts: string[] = [];
  let probeAlerts: string[] = [];
  let probeCaptured = false;
  let prunedRows = 0;
  let hasDanger = false;
  let hibernating = false;
  let stillOutdoors = false;

  try {
    const settings = await getSettings();
    const config = toSpaConfig(settings);

    // Packed away for the winter? Routine nagging is noise, and noise is how an
    // app gets muted. Frost warnings survive, though — a tub that's still in the
    // garden is still at risk, and that's exactly when a warning earns its keep.
    const hibernation = hibernationState(
      settings.winterised_at ?? null,
      settings.winter_strategy ?? null,
      winterWindow(settings.latitude === null ? null : Number(settings.latitude), now),
    );
    hibernating = hibernation.hibernating;
    stillOutdoors = hibernation.stillOutdoors;

    const tasks = await getTasks();
    dueTasks = tasks
      .map((t) => ({ name: t.name, info: computeNextDue(toTaskLike(t), now) }))
      .filter((t) => t.info.status !== "ok")
      .map((t) =>
        t.info.status === "overdue"
          ? `${t.name} (overdue)`
          : `${t.name} (due)`,
      );

    // Latest-reading safety alerts.
    const latest = await getLatestReading();
    if (latest) {
      const calc = calculateRecommendations(
        {
          ph: Number(latest.ph),
          freeChlorinePpm:
            latest.free_chlorine_ppm === null ? null : Number(latest.free_chlorine_ppm),
          brominePpm:
            latest.bromine_ppm === null ? null : Number(latest.bromine_ppm),
          totalAlkalinityPpm: Number(latest.total_alkalinity_ppm),
          calciumHardnessPpm:
            latest.calcium_hardness_ppm === null
              ? null
              : Number(latest.calcium_hardness_ppm),
          orpMv: latest.orp_mv === null ? null : Number(latest.orp_mv),
          isFreshFill: latest.is_fresh_fill,
        },
        config,
      );
      hasDanger = calc.safetyFlags.some((f) => f.severity === "danger");
      if (hasDanger || calc.recommendations.some((r) => r.severity === "high")) {
        chemAlerts = calc.safetyFlags.map((f) => f.message);
        if (chemAlerts.length === 0) {
          chemAlerts = calc.recommendations
            .filter((r) => r.severity === "high")
            .map((r) => r.label);
        }
      }
    }

    // Predictive early-warnings from the reading history.
    const recent = await getRecentReadings(30);
    forecastAlerts = buildForecasts(recent, config).map(
      (f) =>
        `${f.metric} ${f.direction === "falling" ? "low" : "high"} in ~${f.daysUntil}d`,
    );

    // Usage-based "time to change the water" (only if the usage table exists).
    try {
      const drainTask = tasks.find((t) => t.task_key === "drain_refill");
      const cumulative = await getBathersSince(drainTask?.last_completed_at ?? null);
      if (usageWaterStatus(config.volumeLitres, cumulative).changeDue) {
        usageAlert = "Water likely ready to change (based on how much it's been used)";
      }
    } catch {
      // usage_log table not set up yet — skip silently.
    }

    // The water asking for more chemical than it used to — an early warning
    // that it's tiring, well before the calendar says so.
    try {
      const trend = sanitiserDemandTrend(await getRecentDosing(60), now);
      if (trend.rising && !usageAlert) {
        usageAlert = `Sanitiser use up ~${Math.round((trend.changeRatio ?? 0) * 100)}% vs a fortnight ago — water may be tiring`;
      }
    } catch {
      // dosing history unavailable — skip.
    }

    // The probe: bank today's measurement, prune old history so storage stays
    // bounded, and — the point of doing this here — warn about a problem that
    // developed overnight, which otherwise goes unnoticed until the app is
    // next opened.
    if (isIopoolConfigured()) {
      const probe = await getIopoolReading({ fresh: true });
      if (probe.ok) {
        const m = probe.pool.measure;
        probeCaptured = await captureProbeReading(m);

        const r = config.targetRanges;
        const orpMin = r.orpMin ?? 650;
        const orpMax = r.orpMax ?? 750;
        if (m.isValid && m.orpMv !== null) {
          if (m.orpMv < orpMin - 100) {
            probeAlerts.push(`Sanitiser has collapsed (${m.orpMv} mV) — don't get in`);
            hasDanger = true;
          } else if (m.orpMv < orpMin) {
            probeAlerts.push(`Sanitiser low (${m.orpMv} mV, aim ${orpMin}+)`);
          } else if (m.orpMv > orpMax + 100) {
            probeAlerts.push(`Sanitiser very high (${m.orpMv} mV) — let it fall before use`);
            hasDanger = true;
          }
        }
        if (m.isValid && m.ph !== null) {
          if (m.ph > r.phAcceptableMax || m.ph < r.phAcceptableMin) {
            probeAlerts.push(`pH is ${m.ph} — outside the safe band`);
            hasDanger = true;
          }
        }
      }
      prunedRows = await pruneProbeReadings();
    }

    // Weather advisories (frost/heat) if a location is set.
    if (settings.latitude != null && settings.longitude != null) {
      const forecast = await getForecast(
        Number(settings.latitude),
        Number(settings.longitude),
        settings.location_name ?? undefined,
      );
      if (forecast) {
        const advisories = weatherAdvice(forecast, config.sanitizerType).filter(
          (a) => a.code === "frost" || a.code === "heat",
        );
        weatherAlerts = advisories.map((a) => a.message);
        if (advisories.some((a) => a.code === "frost")) hasDanger = true;
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }

  const parts: string[] = [];
  if (hibernating) {
    // Hibernating: everything routine is about water that isn't there. The one
    // thing still worth saying is that it's about to freeze outside.
    if (stillOutdoors && weatherAlerts.length) {
      parts.push(`Weather: ${weatherAlerts.join(" ")}`);
    }
  } else {
    if (dueTasks.length) parts.push(`Due: ${dueTasks.join(", ")}`);
    if (chemAlerts.length) parts.push(`Water: ${chemAlerts.join(" ")}`);
    if (forecastAlerts.length) parts.push(`Forecast: ${forecastAlerts.join(", ")}`);
    if (usageAlert) parts.push(usageAlert);
    if (probeAlerts.length) parts.push(`Probe: ${probeAlerts.join(" · ")}`);
    if (weatherAlerts.length) parts.push(`Weather: ${weatherAlerts.join(" ")}`);
  }
  const summary = parts.join(" · ");

  // Idempotent per-day guard + the daily DB write that prevents auto-pause.
  const supabase = getSupabase();
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const { data: firstRunToday, error: logError } = await supabase.rpc(
    "try_log_notification",
    { p_date: today, p_kind: "daily-summary", p_summary: summary },
  );

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  let notified = false;
  if (firstRunToday === true && summary.length > 0) {
    notified = await sendNtfy(summary, {
      title: hasDanger ? "⚠️ Hot tub needs attention" : "🛁 Hot tub reminder",
      priority: hasDanger ? "urgent" : "default",
      tags: hasDanger ? ["warning"] : ["droplet"],
    });
  }

  return NextResponse.json({
    ranAt: now.toISOString(),
    firstRunToday: firstRunToday === true,
    notified,
    dueTasks,
    chemAlerts,
    forecastAlerts,
    usageAlert,
    weatherAlerts,
    probeAlerts,
    probeCaptured,
    prunedRows,
  });
}

// Vercel Cron issues a GET; POST is allowed for manual curl testing.
export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}
