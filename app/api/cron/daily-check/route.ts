import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  getSettings,
  toSpaConfig,
  getTasks,
  getLatestReading,
  getRecentReadings,
  getBathersSince,
  toTaskLike,
} from "@/lib/data";
import { computeNextDue } from "@/lib/tasks";
import { calculateRecommendations } from "@/lib/chemistry";
import { buildForecasts } from "@/lib/predict";
import { usageWaterStatus } from "@/lib/water";
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
  let hasDanger = false;

  try {
    const config = toSpaConfig(await getSettings());
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
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }

  const parts: string[] = [];
  if (dueTasks.length) parts.push(`Due: ${dueTasks.join(", ")}`);
  if (chemAlerts.length) parts.push(`Water: ${chemAlerts.join(" ")}`);
  if (forecastAlerts.length) parts.push(`Forecast: ${forecastAlerts.join(", ")}`);
  if (usageAlert) parts.push(usageAlert);
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
  });
}

// Vercel Cron issues a GET; POST is allowed for manual curl testing.
export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}
