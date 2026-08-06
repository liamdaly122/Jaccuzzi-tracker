import { type NextRequest } from "next/server";
import { getTasks, getSettings } from "@/lib/data";
import { buildIcsFeed, type IcsSeasonalEvent, type IcsTask } from "@/lib/ics";
import { winterWindow } from "@/lib/winter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public route (excluded from the passcode middleware) because calendar apps
// cannot log in — instead it is protected by a secret token in the URL.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const expected = process.env.ICS_FEED_TOKEN;

  if (!expected || token !== expected) {
    return new Response("Not authorised", { status: 401 });
  }

  let tasks;
  try {
    tasks = await getTasks();
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : "Failed to build calendar",
      { status: 500 },
    );
  }

  const icsTasks: IcsTask[] = tasks.map((t) => ({
    taskKey: t.task_key,
    name: t.name,
    taskType: t.task_type,
    frequencyDays: t.frequency_days,
    lastCompletedAt: t.last_completed_at,
  }));

  // Winter shutdown and spring reopening, when we know where the tub lives.
  const seasonal: IcsSeasonalEvent[] = [];
  try {
    const settings = await getSettings();
    const w = winterWindow(
      settings.latitude === null ? null : Number(settings.latitude),
      new Date(),
    );
    if (w) {
      seasonal.push({
        key: "winter-shutdown",
        name: "Winterise the hot tub",
        date: w.deadline,
        description:
          "Drain, dry and pack the tub away before frost. Never leave it full with the power off — freezing water cracks the pump.",
      });
      seasonal.push({
        key: "spring-reopen",
        name: "Get the hot tub back out",
        date: w.reopen,
        description: "Unpack, inspect for winter damage, refill and rebalance.",
      });
    }
  } catch {
    // No settings yet — the task events still work on their own.
  }

  const body = buildIcsFeed(icsTasks, new Date(), seasonal);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="hot-tub.ics"',
      "Cache-Control": "no-store",
    },
  });
}
