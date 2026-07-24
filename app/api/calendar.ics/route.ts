import { type NextRequest } from "next/server";
import { getTasks } from "@/lib/data";
import { buildIcsFeed, type IcsTask } from "@/lib/ics";

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

  const body = buildIcsFeed(icsTasks, new Date());

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="hot-tub.ics"',
      "Cache-Control": "no-store",
    },
  });
}
