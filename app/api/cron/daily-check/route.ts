import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  getSettings,
  toSpaConfig,
  getTasks,
  getLatestReading,
  toTaskLike,
} from "@/lib/data";
import { computeNextDue } from "@/lib/tasks";
import { calculateRecommendations } from "@/lib/chemistry";
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
  let hasDanger = false;

  try {
    const tasks = await getTasks();
    dueTasks = tasks
      .map((t) => ({ name: t.name, info: computeNextDue(toTaskLike(t), now) }))
      .filter((t) => t.info.status !== "ok")
      .map((t) =>
        t.info.status === "overdue"
          ? `${t.name} (overdue)`
          : `${t.name} (due)`,
      );

    const latest = await getLatestReading();
    if (latest) {
      const config = toSpaConfig(await getSettings());
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
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }

  const parts: string[] = [];
  if (dueTasks.length) parts.push(`Due: ${dueTasks.join(", ")}`);
  if (chemAlerts.length) parts.push(`Water: ${chemAlerts.join(" ")}`);
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
  });
}

// Vercel Cron issues a GET; POST is allowed for manual curl testing.
export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}
